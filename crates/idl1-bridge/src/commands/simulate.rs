//! Drivetrain simulator commands (C3 §3.15, drivetrain sim spec
//! `2026-11-19-idl1-drivetrain-sim-DRAFT.md`): thin glue over `idl_rs::sim`
//! and the bike file's `linkage` and `drivetrain` sections.
//!
//! The Simulate tab works on the bike's photo, in pixels. Every pixel ↔
//! metre conversion happens here, from the two axle centres clicked on the
//! photo and the wheelbase (`PhotoFrame`), so the metres the bike file keeps
//! are never computed in JavaScript. A dynamic run comes back as raw bytes
//! (`IDLM` v1, a sim result: [`encode_run`], [`crate::sim_result_wire`]).

use std::collections::BTreeMap;
use std::path::Path;

use idl_library::bikelog;
use idl_rs::calibration::drivetrain::{Body, ChainSide, ContactSurface, Derailleur, Drivetrain, DrivetrainPhoto, Roller, Span, SurfaceSide};
use idl_rs::calibration::linkage::{Linkage, LinkagePoints, PhotoFrame, P2};
use idl_rs::sim::bike::SimBike;
use idl_rs::sim::dynamics::{simulate, DynConfig, DynResult};
use idl_rs::sim::excite::BumpTrain;
use idl_rs::sim::kinematics::{gear_curves, snapshot, GearCurves, Snapshot};
use idl_rs::sim::path::chain_fit;
use idl_rs::sim::{SimError, SimErrorKind};
use idl_rs::time::now_ms;

use crate::commands::device::Progress;
use crate::error::{IpcError, IpcErrorKind};
use crate::sim_result_wire::{encode_sim_result, SimResult, Track, TrackKind};
use crate::state::DataDir;

impl From<SimError> for IpcError {
    fn from(e: SimError) -> Self {
        let kind = match e.kind {
            SimErrorKind::Linkage | SimErrorKind::Drivetrain | SimErrorKind::NoPath | SimErrorKind::Excitation => IpcErrorKind::InvalidArgument,
        };
        IpcError::new(kind, e.message)
    }
}

/// The linkage points, in the order the tab asks for them. `shock_*` are optional.
pub const LINKAGE_POINTS: [&str; 9] = ["rear_axle", "front_axle", "main_pivot", "horst", "ss_rocker", "rocker_frame", "shock_frame", "shock_rocker", "imu0"];
/// The drivetrain points, in the order the tab asks for them.
pub const DRIVETRAIN_POINTS: [&str; 4] = ["bb", "cage_pivot", "upper_jockey", "lower_jockey"];

/// A roller as the tab edits it.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct RollerPx {
    /// Name.
    pub name: String,
    /// The body it is on.
    pub body: Body,
    /// Centre, photo pixels.
    pub centre_px: P2,
    /// Teeth; null for a smooth roller.
    pub teeth: Option<u32>,
    /// A smooth roller's radius, mm.
    pub radius_mm: f64,
    /// The span it guides.
    pub span: Span,
    /// The side of it the chain runs on.
    pub side: ChainSide,
    /// Inertia, kg·m².
    pub inertia_kgm2: f64,
    /// Fitted.
    pub enabled: bool,
    /// An idler the chain is threaded round (always on that side of it), not a
    /// guide that acts only when the chain reaches it. Absent: a guide.
    #[serde(default)]
    pub threaded: bool,
}

/// A contact surface as the tab edits it.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct SurfacePx {
    /// Name.
    pub name: String,
    /// The body it is on.
    pub body: Body,
    /// Points along it, photo pixels.
    pub polyline_px: Vec<P2>,
    /// The side the chain stays on.
    pub side: SurfaceSide,
}

/// The drivetrain's numbers (everything but its points).
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct DrivetrainParams {
    /// Chainring teeth.
    pub chainring_teeth: u32,
    /// Cassette teeth, smallest first.
    pub cassette_teeth: Vec<u32>,
    /// Chain links.
    pub chain_links: u32,
    /// Chain mass, kg.
    pub chain_mass_kg: f64,
    /// Upper and lower jockey teeth.
    pub jockey_teeth: [u32; 2],
    /// Spring torque toward tension vs cage angle forward from drawn: `[[deg, N·m], …]`.
    pub spring_torque_nm: Vec<[f64; 2]>,
    /// Clutch torque, N·m.
    pub clutch_torque_nm: f64,
    /// Cage bearing friction, N·m.
    pub bearing_torque_nm: f64,
    /// Cage inertia about its pivot, kg·m².
    pub cage_inertia_kgm2: f64,
    /// Cage mass, kg.
    pub cage_mass_kg: f64,
    /// Each jockey's inertia, kg·m².
    pub jockey_inertia_kgm2: f64,
    /// The gear the photo was taken in (0 = smallest cog).
    pub photo_gear: usize,
    /// Cassette and freehub inertia, kg·m².
    pub cassette_inertia_kgm2: f64,
    /// Freehub engagement, degrees.
    pub freehub_engagement_deg: f64,
    /// Freehub drag, N·m.
    pub freehub_drag_nm: f64,
    /// Rear wheel rolling radius, m.
    pub wheel_radius_m: f64,
    /// Crank length, m.
    pub crank_length_m: f64,
}

/// The whole setup in photo pixels: what the tab edits and saves.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct SetupPx {
    /// The photo beside the bike file, if one was added.
    pub photo_file: Option<String>,
    /// Wheelbase, m (scales the photo).
    pub wheelbase_m: f64,
    /// Rear wheel travel, m.
    pub rear_travel_m: f64,
    /// Points by name ([`LINKAGE_POINTS`], [`DRIVETRAIN_POINTS`]), photo pixels.
    pub points: BTreeMap<String, P2>,
    /// Rollers.
    pub rollers: Vec<RollerPx>,
    /// Contact surfaces.
    pub surfaces: Vec<SurfacePx>,
    /// The drivetrain's numbers.
    pub params: DrivetrainParams,
}

/// `get_sim_setup`'s return.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct SimSetupView {
    /// The bike.
    pub bike_id: String,
    /// Whether the bike file has a linkage (else the points are a GT Force-shaped start).
    pub has_linkage: bool,
    /// Whether the bike file has a drivetrain (else typical numbers).
    pub has_drivetrain: bool,
    /// The photo's frame: stored, or the one asked for. Null until the axles are clicked.
    pub frame: Option<PhotoFrame>,
    /// The setup in pixels, when there is a frame.
    pub setup: Option<SetupPx>,
    /// The setup's numbers when there is no frame yet (wheelbase, travel, params).
    pub params: DrivetrainParams,
    /// Wheelbase, m.
    pub wheelbase_m: f64,
    /// Rear travel, m.
    pub rear_travel_m: f64,
    /// The photo's file name, if any.
    pub photo_file: Option<String>,
}

fn params_of(d: &Drivetrain) -> DrivetrainParams {
    let r = &d.derailleur;
    DrivetrainParams {
        chainring_teeth: d.chainring_teeth,
        cassette_teeth: d.cassette_teeth.clone(),
        chain_links: d.chain_links,
        chain_mass_kg: d.chain_mass_kg,
        jockey_teeth: r.jockey_teeth,
        spring_torque_nm: r.spring_torque_nm.clone(),
        clutch_torque_nm: r.clutch_torque_nm,
        bearing_torque_nm: r.bearing_torque_nm,
        cage_inertia_kgm2: r.cage_inertia_kgm2,
        cage_mass_kg: r.cage_mass_kg,
        jockey_inertia_kgm2: r.jockey_inertia_kgm2,
        photo_gear: r.photo_gear,
        cassette_inertia_kgm2: d.cassette_inertia_kgm2,
        freehub_engagement_deg: d.freehub_engagement_deg,
        freehub_drag_nm: d.freehub_drag_nm,
        wheel_radius_m: d.wheel_radius_m,
        crank_length_m: d.crank_length_m,
    }
}

/// A GT Force-shaped linkage scaled to `wheelbase_m`: where the points
/// start before they are dragged onto the photo.
fn starter_linkage(wheelbase_m: f64, travel_m: f64) -> Linkage {
    let k = wheelbase_m / 1.28;
    let s = |p: P2| [p[0] * k, p[1] * k];
    Linkage {
        updated_at_ms: 0,
        points_m: LinkagePoints {
            front_axle: [wheelbase_m, 0.0],
            rear_axle: [0.0, 0.0],
            main_pivot: s([0.43717, 0.08031]),
            horst: s([0.07805, -0.01296]),
            ss_rocker: s([0.37094, 0.18068]),
            rocker_frame: s([0.48793, 0.19457]),
            shock_frame: Some(s([0.52277, 0.04682])),
            shock_rocker: Some(s([0.55827, 0.25971])),
            imu0: s([0.47677, 0.36738]),
            fork_pod: None,
            rear_pod: None,
        },
        wheelbase_m,
        rear_travel_m: travel_m,
        front_travel_m: None,
        shock_eye_to_eye_m: None,
        source_image: None,
    }
}

/// The setup in pixels for `frame`.
fn to_px(linkage: &Linkage, d: &Drivetrain, frame: &PhotoFrame, photo_file: Option<String>) -> SetupPx {
    let px = |m: P2| frame.to_px(m);
    let p = &linkage.points_m;
    let mut points = BTreeMap::new();
    for (k, v) in [
        ("rear_axle", Some(p.rear_axle)),
        ("front_axle", Some(p.front_axle)),
        ("main_pivot", Some(p.main_pivot)),
        ("horst", Some(p.horst)),
        ("ss_rocker", Some(p.ss_rocker)),
        ("rocker_frame", Some(p.rocker_frame)),
        ("shock_frame", p.shock_frame),
        ("shock_rocker", p.shock_rocker),
        ("imu0", Some(p.imu0)),
        ("bb", Some(d.bb_m)),
        ("cage_pivot", Some(d.derailleur.cage_pivot_m)),
        ("upper_jockey", Some(d.derailleur.upper_jockey_m)),
        ("lower_jockey", Some(d.derailleur.lower_jockey_m)),
    ] {
        if let Some(v) = v {
            points.insert(k.to_string(), px(v));
        }
    }
    // the clicked axles are the frame; keep them exactly
    points.insert("rear_axle".into(), frame.rear_axle_px);
    points.insert("front_axle".into(), frame.front_axle_px);
    SetupPx {
        photo_file,
        wheelbase_m: frame.wheelbase_m,
        rear_travel_m: linkage.rear_travel_m,
        points,
        rollers: d
            .rollers
            .iter()
            .map(|r| RollerPx {
                name: r.name.clone(),
                body: r.body,
                centre_px: px(r.centre_m),
                teeth: r.teeth,
                radius_mm: r.radius_m * 1000.0,
                span: r.span,
                side: r.side,
                inertia_kgm2: r.inertia_kgm2,
                enabled: r.enabled,
                threaded: r.threaded,
            })
            .collect(),
        surfaces: d.contacts.iter().map(|s| SurfacePx { name: s.name.clone(), body: s.body, polyline_px: s.polyline_m.iter().map(|&q| px(q)).collect(), side: s.side }).collect(),
        params: params_of(d),
    }
}

/// The setup in metres: the linkage and the drivetrain. `base` supplies
/// what the tab doesn't edit (fork travel, the shock's length).
pub fn from_px(setup: &SetupPx, base: Option<&Linkage>, now: i64) -> Result<(Linkage, Drivetrain), IpcError> {
    let bad = |m: String| IpcError::new(IpcErrorKind::InvalidArgument, m);
    let pt = |k: &str| setup.points.get(k).copied().ok_or_else(|| bad(format!("the {} isn't placed on the photo", k.replace('_', " "))));
    let frame = PhotoFrame { rear_axle_px: pt("rear_axle")?, front_axle_px: pt("front_axle")?, wheelbase_m: setup.wheelbase_m };
    if !(setup.wheelbase_m > 0.3) || frame.px_per_m() < 1.0 {
        return Err(bad("place both axles and give the wheelbase".into()));
    }
    if !(setup.rear_travel_m > 0.0) {
        return Err(bad("give the rear travel".into()));
    }
    let m = |k: &str| pt(k).map(|p| frame.to_bike(p));
    let opt = |k: &str| setup.points.get(k).map(|&p| frame.to_bike(p));
    let points_m = LinkagePoints {
        front_axle: m("front_axle")?,
        rear_axle: [0.0, 0.0],
        main_pivot: m("main_pivot")?,
        horst: m("horst")?,
        ss_rocker: m("ss_rocker")?,
        rocker_frame: m("rocker_frame")?,
        shock_frame: opt("shock_frame"),
        shock_rocker: opt("shock_rocker"),
        imu0: m("imu0")?,
        fork_pod: base.and_then(|b| b.points_m.fork_pod),
        rear_pod: base.and_then(|b| b.points_m.rear_pod),
    };
    let linkage = Linkage {
        updated_at_ms: now,
        points_m,
        wheelbase_m: setup.wheelbase_m,
        rear_travel_m: setup.rear_travel_m,
        front_travel_m: base.and_then(|b| b.front_travel_m),
        shock_eye_to_eye_m: base.and_then(|b| b.shock_eye_to_eye_m),
        source_image: setup.photo_file.clone().or_else(|| base.and_then(|b| b.source_image.clone())),
    };
    let p = &setup.params;
    if p.cassette_teeth.is_empty() {
        return Err(bad("the cassette needs at least one cog".into()));
    }
    let drivetrain = Drivetrain {
        updated_at_ms: now,
        bb_m: m("bb")?,
        chainring_teeth: p.chainring_teeth,
        cassette_teeth: p.cassette_teeth.clone(),
        chain_links: p.chain_links,
        chain_mass_kg: p.chain_mass_kg,
        derailleur: Derailleur {
            cage_pivot_m: m("cage_pivot")?,
            upper_jockey_m: m("upper_jockey")?,
            lower_jockey_m: m("lower_jockey")?,
            jockey_teeth: p.jockey_teeth,
            spring_torque_nm: p.spring_torque_nm.clone(),
            clutch_torque_nm: p.clutch_torque_nm,
            bearing_torque_nm: p.bearing_torque_nm,
            cage_inertia_kgm2: p.cage_inertia_kgm2,
            jockey_inertia_kgm2: p.jockey_inertia_kgm2,
            cage_mass_kg: p.cage_mass_kg,
            photo_gear: p.photo_gear.min(p.cassette_teeth.len() - 1),
        },
        rollers: setup
            .rollers
            .iter()
            .map(|r| Roller {
                name: r.name.clone(),
                body: r.body,
                centre_m: frame.to_bike(r.centre_px),
                teeth: r.teeth,
                radius_m: r.radius_mm / 1000.0,
                span: r.span,
                side: r.side,
                inertia_kgm2: r.inertia_kgm2,
                enabled: r.enabled,
                threaded: r.threaded,
            })
            .collect(),
        contacts: setup.surfaces.iter().map(|s| ContactSurface { name: s.name.clone(), body: s.body, polyline_m: s.polyline_px.iter().map(|&q| frame.to_bike(q)).collect(), side: s.side }).collect(),
        cassette_inertia_kgm2: p.cassette_inertia_kgm2,
        freehub_engagement_deg: p.freehub_engagement_deg,
        freehub_drag_nm: p.freehub_drag_nm,
        wheel_radius_m: p.wheel_radius_m,
        crank_length_m: p.crank_length_m,
        photo: setup.photo_file.clone().map(|file| DrivetrainPhoto { file, frame }),
    };
    Ok((linkage, drivetrain))
}

fn check_bike(bike_id: &str) -> Result<(), IpcError> {
    if bikelog::is_valid_id(bike_id) {
        Ok(())
    } else {
        Err(IpcError::new(IpcErrorKind::InvalidArgument, format!("{bike_id:?} is not a bike id")))
    }
}

/// The bike's setup; with `frame`, in that photo frame (the axles just clicked).
pub fn get_sim_setup_via(data_dir: &Path, bike_id: &str, frame: Option<PhotoFrame>) -> Result<SimSetupView, IpcError> {
    check_bike(bike_id)?;
    let file = bikelog::read_bike_file(data_dir, bike_id)?;
    let stored_frame = file.drivetrain.as_ref().and_then(|d| d.photo.as_ref()).map(|p| p.frame);
    let photo_file = file.drivetrain.as_ref().and_then(|d| d.photo.as_ref()).map(|p| p.file.clone());
    let wheelbase = frame.map(|f| f.wheelbase_m).or(file.linkage.as_ref().map(|l| l.wheelbase_m)).unwrap_or(1.25);
    let linkage = file.linkage.clone().unwrap_or_else(|| starter_linkage(wheelbase, 0.15));
    let drivetrain = file.drivetrain.clone().unwrap_or_else(|| Drivetrain::typical([0.43 * wheelbase / 1.28, -0.02], 0));
    // a frame just clicked re-places the photo; the stored one otherwise
    let frame = frame.or(stored_frame);
    let setup = frame.map(|f| to_px(&linkage, &drivetrain, &f, photo_file.clone()));
    Ok(SimSetupView {
        bike_id: bike_id.to_string(),
        has_linkage: file.linkage.is_some(),
        has_drivetrain: file.drivetrain.is_some(),
        frame,
        setup,
        params: params_of(&drivetrain),
        wheelbase_m: linkage.wheelbase_m,
        rear_travel_m: linkage.rear_travel_m,
        photo_file,
    })
}

/// C3 §3.15 `get_sim_setup(bike_id, frame)`: the bike's linkage and
/// drivetrain in photo pixels. `frame` is the axles just clicked (and the
/// wheelbase); null uses the frame saved with the photo, and with neither
/// `setup` is null.
#[tauri::command(async)]
pub fn get_sim_setup(bike_id: String, frame: Option<PhotoFrame>, data_dir: tauri::State<'_, DataDir>) -> Result<SimSetupView, IpcError> {
    get_sim_setup_via(&data_dir.0, &bike_id, frame)
}

/// Saves the setup into the bike's file (linkage and drivetrain, newer wins).
pub fn save_sim_setup_via(data_dir: &Path, bike_id: &str, setup: &SetupPx) -> Result<SimSetupView, IpcError> {
    check_bike(bike_id)?;
    let file = bikelog::read_bike_file(data_dir, bike_id)?;
    let now = now_ms();
    let (linkage, drivetrain) = from_px(setup, file.linkage.as_ref(), now)?;
    bikelog::save_linkage(data_dir, bike_id, &linkage)?;
    bikelog::save_drivetrain(data_dir, bike_id, &drivetrain)?;
    get_sim_setup_via(data_dir, bike_id, None)
}

/// C3 §3.15 `save_sim_setup(bike_id, setup)`: converts the pixel setup to
/// metres and saves it as the bike's `linkage` and `drivetrain`.
#[tauri::command(async)]
pub fn save_sim_setup(bike_id: String, setup: SetupPx, data_dir: tauri::State<'_, DataDir>) -> Result<SimSetupView, IpcError> {
    save_sim_setup_via(&data_dir.0, &bike_id, &setup)
}

/// C3 §3.15 `set_bike_photo(bike_id, path)`: copies the photo beside the
/// bike's file; returns its file name. Its frame is set by clicking the
/// axles, then saving the setup.
#[tauri::command(async)]
pub fn set_bike_photo(bike_id: String, path: String, data_dir: tauri::State<'_, DataDir>) -> Result<String, IpcError> {
    check_bike(&bike_id)?;
    Ok(bikelog::save_bike_photo(&data_dir.0, &bike_id, Path::new(&path))?)
}

/// C3 §3.15 `get_bike_photo(bike_id, file)`: the photo's bytes.
#[tauri::command(async)]
pub fn get_bike_photo(bike_id: String, file: String, data_dir: tauri::State<'_, DataDir>) -> Result<tauri::ipc::Response, IpcError> {
    Ok(tauri::ipc::Response::new(bikelog::read_bike_photo(&data_dir.0, &bike_id, &file)?))
}

/// `sim_kinematics`'s return.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct KinematicsView {
    /// Every gear's curves through travel.
    pub gears: Vec<GearCurves>,
    /// Gears that don't close the loop, with why.
    pub failed: Vec<(usize, String)>,
    /// The chosen gear drawn at each travel sample, in metres.
    pub snapshots: Vec<Snapshot>,
    /// Chain lengths (links) that fit every gear through travel.
    pub chain_fit: Option<(f64, f64)>,
    /// The photo frame the metres are in (to draw them on the photo).
    pub frame: PhotoFrame,
}

/// The kinematics of an (unsaved) setup.
pub fn sim_kinematics_via(setup: &SetupPx, gear: usize, samples: usize) -> Result<KinematicsView, IpcError> {
    let (linkage, drivetrain) = from_px(setup, None, 0)?;
    let frame = drivetrain.photo.as_ref().map(|p| p.frame).unwrap_or(PhotoFrame {
        rear_axle_px: setup.points["rear_axle"],
        front_axle_px: setup.points["front_axle"],
        wheelbase_m: setup.wheelbase_m,
    });
    let bike = SimBike::new(&linkage, &drivetrain)?;
    let enabled = |i: usize| drivetrain.rollers[i].enabled;
    let samples = samples.clamp(2, 81);
    let mut gears = Vec::new();
    let mut failed = Vec::new();
    for g in 0..drivetrain.cassette_teeth.len() {
        match gear_curves(&bike, g, samples, &enabled) {
            Ok(c) => gears.push(c),
            Err(e) => failed.push((g, e.message)),
        }
    }
    let gear = gear.min(drivetrain.cassette_teeth.len() - 1);
    let mut snapshots = Vec::with_capacity(samples);
    for k in 0..samples {
        let s = bike.travel_max_m * k as f64 / (samples - 1) as f64;
        if let Ok(snap) = snapshot(&bike, s, gear, &enabled) {
            snapshots.push(snap);
        }
    }
    Ok(KinematicsView { gears, failed, snapshots, chain_fit: chain_fit(&bike, &enabled), frame })
}

/// C3 §3.15 `sim_kinematics(setup, gear, samples)` (async): every gear's
/// growth, kickback, cage angle, loop change and clearance through travel,
/// and the chosen gear drawn at each of `samples` travels. Errors:
/// `invalid_argument` (a point missing, a linkage that locks before full
/// travel, a chain that can't close the loop).
#[tauri::command(async)]
pub fn sim_kinematics(setup: SetupPx, gear: usize, samples: usize) -> Result<KinematicsView, IpcError> {
    sim_kinematics_via(&setup, gear, samples)
}

/// A drivetrain run as a sim result's `drivetrain` component and its tracks:
/// `chain` (xy, one per link, m), `points` (xy, labelled with the moving
/// points' names, m), `wheel_angle` (angle, labelled with the wheels' roles,
/// rad), then one scalar track per channel under the channel's name and unit.
/// The component carries the gear, link count, wheels, totals, the bumps and
/// the photo frame the app draws over.
pub fn run_result(r: &DynResult, frame: &PhotoFrame, input: &BumpTrain) -> SimResult {
    let dt = "drivetrain".to_string();
    let mut components = serde_json::Map::new();
    components.insert(
        dt.clone(),
        serde_json::json!({
            "gear": r.gear,
            "nodes": r.nodes,
            "wheels": r.wheels.iter().map(|(role, radius, teeth)| serde_json::json!({"role": role, "radius_m": radius, "teeth": teeth})).collect::<Vec<_>>(),
            "summary": r.summary,
            "frame": frame,
            "input": input,
        }),
    );
    let mut tracks = vec![
        Track { name: "chain".into(), component: dt.clone(), kind: TrackKind::Xy, count: r.nodes, unit: "m".into(), labels: None, values: r.node_xy.clone() },
        Track { name: "points".into(), component: dt.clone(), kind: TrackKind::Xy, count: r.point_names.len(), unit: "m".into(), labels: Some(r.point_names.clone()), values: r.point_xy.clone() },
        Track { name: "wheel_angle".into(), component: dt.clone(), kind: TrackKind::Angle, count: r.wheels.len(), unit: "rad".into(), labels: Some(r.wheels.iter().map(|w| w.0.clone()).collect()), values: r.wheel_angle.clone() },
    ];
    for c in &r.channels {
        tracks.push(Track { name: c.name.clone(), component: dt.clone(), kind: TrackKind::Scalar, count: 1, unit: c.unit.clone(), labels: None, values: c.values.clone() });
    }
    SimResult { frame_t_s: r.frame_t_s.iter().map(|&t| t as f32).collect(), components, tracks }
}

/// A run's bytes: `IDLM` v1 ([`crate::sim_result_wire`]) of [`run_result`].
pub fn encode_run(r: &DynResult, frame: &PhotoFrame, input: &BumpTrain) -> Vec<u8> {
    encode_sim_result(&run_result(r, frame, input))
}

/// Runs the dynamics for an (unsaved) setup and encodes it.
pub fn run_drivetrain_sim_via(setup: &SetupPx, gear: usize, input: &BumpTrain, progress: &mut dyn FnMut(f64)) -> Result<Vec<u8>, IpcError> {
    let (linkage, drivetrain) = from_px(setup, None, 0)?;
    let frame = PhotoFrame { rear_axle_px: setup.points["rear_axle"], front_axle_px: setup.points["front_axle"], wheelbase_m: setup.wheelbase_m };
    let bike = SimBike::new(&linkage, &drivetrain)?;
    let enabled = |i: usize| drivetrain.rollers[i].enabled;
    let bad = |m: &str| IpcError::new(IpcErrorKind::InvalidArgument, m.to_string());
    if !(input.count >= 1 && input.count <= 200 && input.spacing_s > 0.0 && input.compress_s > 0.0 && input.rebound_s > 0.0 && input.depth_m <= linkage.rear_travel_m + 1e-9 && input.sag_m >= 0.0) {
        return Err(bad("the bumps need 1-200 hits, positive times, and a depth within the travel"));
    }
    let exc = input.excitation(1000.0);
    if exc.t_s.last().copied().unwrap_or(0.0) > 120.0 {
        return Err(bad("a run is at most 120 s"));
    }
    let gear = gear.min(drivetrain.cassette_teeth.len() - 1);
    let r = simulate(&bike, gear, &enabled, &exc, &DynConfig::default(), &mut |f| {
        progress(f);
        true
    })?;
    Ok(encode_run(&r, &frame, input))
}

/// C3 §3.15 `run_drivetrain_sim(setup, gear, input, progress)` (async):
/// the chain loop through a bump train, frame by frame, as `IDLM` v1 bytes
/// ([`encode_run`]). Progress: `phase` `"simulating"`, `done` of `total` = 1000.
/// Errors: `invalid_argument` (the setup or the bumps), as `sim_kinematics`.
#[tauri::command(async)]
pub fn run_drivetrain_sim(setup: SetupPx, gear: usize, input: BumpTrain, progress: tauri::ipc::Channel<Progress>) -> Result<tauri::ipc::Response, IpcError> {
    let bytes = run_drivetrain_sim_via(&setup, gear, &input, &mut |f| {
        let _ = progress.send(Progress { done: (f * 1000.0) as u64, total: Some(1000), phase: "simulating".into() });
    })?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("idl1-bridge-sim-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn frame() -> PhotoFrame {
        PhotoFrame { rear_axle_px: [400.0, 900.0], front_axle_px: [2000.0, 900.0], wheelbase_m: 1.28 }
    }

    fn gt_setup(root: &Path) -> SetupPx {
        bikelog::save_bike(root, &bikelog::Bike { bike_id: "gt".into(), name: "GT".into(), name_updated_at_ms: 1, fields: Vec::new(), fields_updated_at_ms: 0 }).unwrap();
        let mut setup = get_sim_setup_via(root, "gt", Some(frame())).unwrap().setup.unwrap();
        setup.rear_travel_m = 0.16;
        setup
    }

    #[test]
    fn get_sim_setup_without_a_frame_has_no_pixels_and_with_one_puts_the_axles_where_clicked() {
        // Arrange
        let root = temp_root();
        let _ = gt_setup(&root);

        // Act
        let none = get_sim_setup_via(&root, "gt", None).unwrap();
        let some = get_sim_setup_via(&root, "gt", Some(frame())).unwrap();

        // Assert
        assert!(none.setup.is_none() && !none.has_linkage);
        let s = some.setup.unwrap();
        assert_eq!(s.points["rear_axle"], [400.0, 900.0]);
        assert!(s.points["main_pivot"][1] < 900.0, "above the axle is up the image");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn save_sim_setup_round_trips_the_pixels_through_metres() {
        // Arrange
        let root = temp_root();
        let setup = gt_setup(&root);

        // Act
        save_sim_setup_via(&root, "gt", &SetupPx { photo_file: Some("gt.photo.jpg".into()), ..setup.clone() }).unwrap();
        let back = get_sim_setup_via(&root, "gt", None).unwrap();

        // Assert
        assert!(back.has_linkage && back.has_drivetrain);
        let b = back.setup.unwrap();
        for (k, v) in &setup.points {
            let w = b.points[k];
            assert!((v[0] - w[0]).abs() < 1e-6 && (v[1] - w[1]).abs() < 1e-6, "{k}");
        }
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn sim_kinematics_gives_every_gear_and_a_snapshot_per_sample() {
        // Arrange
        let root = temp_root();
        let mut setup = gt_setup(&root);
        let fit = sim_kinematics_via(&setup, 5, 3).unwrap().chain_fit.unwrap();
        setup.params.chain_links = (((fit.0 + fit.1) / 4.0).round() * 2.0) as u32;

        // Act
        let k = sim_kinematics_via(&setup, 5, 5).unwrap();

        // Assert
        assert_eq!(k.gears.len() + k.failed.len(), 12);
        assert_eq!(k.snapshots.len(), 5);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn run_drivetrain_sim_encodes_idlm_v1_with_every_track() {
        // Arrange
        let root = temp_root();
        let mut setup = gt_setup(&root);
        let fit = sim_kinematics_via(&setup, 5, 3).unwrap().chain_fit.unwrap();
        setup.params.chain_links = (((fit.0 + fit.1) / 4.0).round() * 2.0) as u32;
        let input = BumpTrain { count: 1, lead_s: 0.05, ..BumpTrain::default() };

        // Act
        let bytes = run_drivetrain_sim_via(&setup, 5, &input, &mut |_| {}).unwrap();

        // Assert
        assert_eq!(&bytes[0..4], b"IDLM");
        let hl = u32::from_le_bytes(bytes[8..12].try_into().unwrap()) as usize;
        let head: serde_json::Value = serde_json::from_slice(&bytes[12..12 + hl]).unwrap();
        let frames = head["frames"].as_u64().unwrap() as usize;
        let nodes = head["components"]["drivetrain"]["nodes"].as_u64().unwrap() as usize;
        let tracks = head["tracks"].as_array().unwrap();
        assert_eq!(tracks[0]["name"], "chain");
        assert_eq!(tracks[0]["count"].as_u64().unwrap() as usize, nodes);
        assert!(tracks.iter().any(|t| t["name"] == "Cage angle" && t["kind"] == "scalar"));
        let per_frame: usize = 1 + tracks.iter().map(|t| t["count"].as_u64().unwrap() as usize * if t["kind"] == "xy" { 2 } else { 1 }).sum::<usize>();
        let body = (12 + hl + 3) / 4 * 4;
        assert_eq!(bytes.len() - body, 4 * frames * per_frame);
        let _ = std::fs::remove_dir_all(&root);
    }
}
