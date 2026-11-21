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
use idl_rs::calibration::drivetrain::{Body, ChainSide, ContactSurface, Derailleur, Drivetrain, DrivetrainPhoto, Roller, Span, SurfaceSide, CHAIN_PITCH_M};
use idl_rs::calibration::linkage::{Linkage, LinkagePoints, PhotoFrame, P2};
use idl_rs::sim::bike::SimBike;
use idl_rs::sim::dynamics::{simulate, DynConfig, DynResult};
use idl_rs::sim::excite::BumpTrain;
use idl_rs::sim::kinematics::{anti_squat_pct, drawn_snapshot, gear_curves, snapshot_near, GearCurves, Snapshot};
use idl_rs::sim::path::{chain_fit, chain_path};
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
    /// Take the chain's length from the photo (the loop round the clicked
    /// points in the photo's gear, the cage as drawn), to the nearest even
    /// link count, instead of `chain_links`. Not saved: on unless turned off.
    #[serde(default = "yes")]
    pub chain_from_photo: bool,
    /// Chain mass, kg.
    pub chain_mass_kg: f64,
    /// Upper and lower jockey teeth.
    pub jockey_teeth: [u32; 2],
    /// The spring's force at the lower jockey's centre, pulled along the
    /// chain (square to the cage), vs cage angle forward from drawn:
    /// `[[deg, N], …]`. What the cage pushes back with as it is let return.
    pub spring_force_n: Vec<[f64; 2]>,
    /// The force to pull the cage forward at the drawn angle, the same way, N:
    /// the spring plus the clutch.
    pub pull_force_n: f64,
    /// How far the lower jockey moves forward along the chain before the
    /// clutch takes hold, mm.
    pub clutch_free_play_mm: f64,
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
    /// How far the parallelogram drops the cage pivot toward the axle as it
    /// shifts, as a fraction of the change in cog radius: 0 for a horizontal
    /// parallelogram (SRAM Eagle), 1 for a slant one. Absent: 0.
    #[serde(default)]
    pub slant: f64,
    /// Cassette and freehub inertia, kg·m².
    pub cassette_inertia_kgm2: f64,
    /// Freehub engagement, degrees.
    pub freehub_engagement_deg: f64,
    /// Freehub drag, N·m.
    pub freehub_drag_nm: f64,
    /// Rear wheel rolling radius, m.
    pub wheel_radius_m: f64,
    /// Height of the rider and bike's centre of mass above the ground, m,
    /// for anti-squat. Not saved: a placeholder until the mass table.
    #[serde(default = "default_cog_height_m")]
    pub cog_height_m: f64,
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

fn yes() -> bool {
    true
}

fn default_cog_height_m() -> f64 {
    DEFAULT_COG_HEIGHT_M
}

/// A rider and trail bike's centre of mass above the ground, m: a typical
/// figure until the mass table gives one.
const DEFAULT_COG_HEIGHT_M: f64 = 1.1;

/// The shortest cage (pivot to lower jockey) the forces convert on, m.
const MIN_CAGE_ARM_M: f64 = 0.01;

fn params_of(d: &Drivetrain) -> DrivetrainParams {
    let r = &d.derailleur;
    let arm = r.lower_jockey_arm_m().max(MIN_CAGE_ARM_M);
    DrivetrainParams {
        chainring_teeth: d.chainring_teeth,
        cassette_teeth: d.cassette_teeth.clone(),
        chain_links: d.chain_links,
        chain_from_photo: true,
        chain_mass_kg: d.chain_mass_kg,
        jockey_teeth: r.jockey_teeth,
        spring_force_n: r.spring_torque_nm.iter().map(|&[deg, nm]| [deg, nm / arm]).collect(),
        pull_force_n: (r.spring_torque(0.0) + r.clutch_torque_nm) / arm,
        clutch_free_play_mm: r.clutch_free_play_deg.to_radians() * arm * 1000.0,
        bearing_torque_nm: r.bearing_torque_nm,
        cage_inertia_kgm2: r.cage_inertia_kgm2,
        cage_mass_kg: r.cage_mass_kg,
        jockey_inertia_kgm2: r.jockey_inertia_kgm2,
        photo_gear: r.photo_gear,
        slant: r.slant,
        cassette_inertia_kgm2: d.cassette_inertia_kgm2,
        freehub_engagement_deg: d.freehub_engagement_deg,
        freehub_drag_nm: d.freehub_drag_nm,
        wheel_radius_m: d.wheel_radius_m,
        crank_length_m: d.crank_length_m,
        cog_height_m: DEFAULT_COG_HEIGHT_M,
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
            centre_of_mass: None,
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
        ("centre_of_mass", p.centre_of_mass),
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
        centre_of_mass: opt("centre_of_mass"),
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
    let (pivot, lower) = (m("cage_pivot")?, m("lower_jockey")?);
    let arm = ((lower[0] - pivot[0]).powi(2) + (lower[1] - pivot[1]).powi(2)).sqrt();
    if arm < MIN_CAGE_ARM_M {
        return Err(bad("the lower jockey is on the cage pivot: drag it to the jockey's centre".into()));
    }
    let mut derailleur = Derailleur {
        cage_pivot_m: pivot,
        upper_jockey_m: m("upper_jockey")?,
        lower_jockey_m: lower,
        jockey_teeth: p.jockey_teeth,
        spring_torque_nm: p.spring_force_n.iter().map(|&[deg, n]| [deg, n * arm]).collect(),
        clutch_torque_nm: 0.0,
        clutch_free_play_deg: (p.clutch_free_play_mm.max(0.0) / 1000.0 / arm).to_degrees(),
        bearing_torque_nm: p.bearing_torque_nm,
        cage_inertia_kgm2: p.cage_inertia_kgm2,
        jockey_inertia_kgm2: p.jockey_inertia_kgm2,
        cage_mass_kg: p.cage_mass_kg,
        photo_gear: p.photo_gear.min(p.cassette_teeth.len() - 1),
        slant: p.slant.clamp(0.0, 1.0),
    };
    // the pull is the spring and the clutch together
    derailleur.clutch_torque_nm = (p.pull_force_n * arm - derailleur.spring_torque(0.0)).max(0.0);
    let drivetrain = Drivetrain {
        updated_at_ms: now,
        bb_m: m("bb")?,
        chainring_teeth: p.chainring_teeth,
        cassette_teeth: p.cassette_teeth.clone(),
        chain_links: p.chain_links,
        chain_mass_kg: p.chain_mass_kg,
        derailleur,
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

/// [`from_px`], with the chain's length taken from the photo when the
/// params say so, and the photo's implied length in links (fractional),
/// when the chain can be drawn round the points as photographed.
pub fn resolve(setup: &SetupPx, base: Option<&Linkage>, now: i64) -> Result<(Linkage, Drivetrain, Option<f64>), IpcError> {
    let (linkage, mut drivetrain) = from_px(setup, base, now)?;
    let photo_links = {
        // the loop as drawn doesn't depend on the chain's length: any valid count builds the bike
        let probe = Drivetrain { chain_links: drivetrain.chain_links.max(100), ..drivetrain.clone() };
        let bike = SimBike::new(&linkage, &probe)?;
        let pose = bike.pose(0.0);
        let enabled = |i: usize| drivetrain.rollers[i].enabled;
        chain_path(&bike, &pose, drivetrain.derailleur.photo_gear, bike.cage_abs(&pose, 0.0), &enabled).ok().map(|p| p.length / CHAIN_PITCH_M)
    };
    if let (true, Some(l)) = (setup.params.chain_from_photo, photo_links) {
        drivetrain.chain_links = ((l / 2.0).round() * 2.0).max(2.0) as u32;
    }
    Ok((linkage, drivetrain, photo_links))
}

/// The centre of mass's height above the ground line (rear to front tyre
/// contact, a wheel radius under each axle, topped out), m, when placed.
fn centre_of_mass_height_m(linkage: &Linkage, r: f64) -> Option<f64> {
    let p = &linkage.points_m;
    let c = p.centre_of_mass?;
    let (a, b) = ([p.rear_axle[0], p.rear_axle[1] - r], [p.front_axle[0], p.front_axle[1] - r]);
    let (dx, dy) = (b[0] - a[0], b[1] - a[1]);
    Some((dx * (c[1] - a[1]) - dy * (c[0] - a[0])) / dx.hypot(dy).max(1e-9))
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
    let (linkage, drivetrain, _) = resolve(setup, file.linkage.as_ref(), now)?;
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
    /// Anti-squat, percent, per gear (as `gears`) and travel sample, at the
    /// params' centre of mass height; null where the squat line is undefined.
    pub anti_squat_pct: Vec<Vec<Option<f64>>>,
    /// The centre of mass height anti-squat used, m: the placed point's, else the params'.
    pub cog_height_m: f64,
    /// The chosen gear drawn at each travel sample where the loop closes, in metres.
    pub snapshots: Vec<Snapshot>,
    /// The travels (mm) where the chosen gear's loop doesn't close, with why.
    pub unclosed: Vec<(f64, String)>,
    /// The chain's links used: the photo's when `chain_from_photo`.
    pub chain_links: u32,
    /// The chain the photo implies, links (fractional), when it can be drawn.
    pub photo_links: Option<f64>,
    /// The bike as photographed (topped out, the photo's gear, the cage at
    /// its drawn angle), for the setup view; null when it can't be drawn.
    pub drawn: Option<Snapshot>,
    /// Chain lengths (links) that fit every gear through travel.
    pub chain_fit: Option<(f64, f64)>,
    /// The photo frame the metres are in (to draw them on the photo).
    pub frame: PhotoFrame,
}

/// The kinematics of an (unsaved) setup.
pub fn sim_kinematics_via(setup: &SetupPx, gear: usize, samples: usize) -> Result<KinematicsView, IpcError> {
    let (linkage, drivetrain, photo_links) = resolve(setup, None, 0)?;
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
    let mut snapshots: Vec<Snapshot> = Vec::with_capacity(samples);
    let mut unclosed = Vec::new();
    for k in 0..samples {
        let s = bike.travel_max_m * k as f64 / (samples - 1) as f64;
        let near = snapshots.last().map(|p| p.cage_deg.to_radians()).unwrap_or(0.0);
        match snapshot_near(&bike, s, gear, near, &enabled) {
            Ok(snap) => snapshots.push(snap),
            Err(e) => unclosed.push((s * 1000.0, e.message)),
        }
    }
    let drawn = drawn_snapshot(&bike, &enabled).ok();
    let cog_height_m = centre_of_mass_height_m(&linkage, drivetrain.wheel_radius_m).unwrap_or(setup.params.cog_height_m);
    let anti_squat_pct = gears.iter().map(|g| g.squat_angle_deg.iter().map(|a| a.map(|a| anti_squat_pct(a, cog_height_m, setup.wheelbase_m))).collect()).collect();
    Ok(KinematicsView {
        gears,
        failed,
        anti_squat_pct,
        cog_height_m,
        snapshots,
        unclosed,
        drawn,
        chain_links: drivetrain.chain_links,
        photo_links,
        chain_fit: chain_fit(&bike, &enabled),
        frame,
    })
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
///
/// A second component, `terrain`, is the ground the rear wheel follows
/// ([`BumpTrain::ground_height`]: a rigid tyre on a level frame) for drawing
/// the wheel rolling over it: `{ wheel_radius_m, window_m }` and the tracks
/// `ground` (xy × [`GROUND_POINTS`], m: the ground under a window of
/// `window_m` centred on the rear axle, in the bike's frame, so it scrolls
/// past as the bike moves) and `distance` (scalar, m travelled).
pub fn run_result(r: &DynResult, bike: &SimBike, frame: &PhotoFrame, input: &BumpTrain, ground_at: &dyn Fn(f64) -> f64, sag_m: f64) -> SimResult {
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

    // the ground, in the bike's frame: flat at the tyre's bottom at sag
    let tr = "terrain".to_string();
    let wheel_r = bike.drivetrain.wheel_radius_m;
    let axle_i = r.point_names.iter().position(|n| n == "rear_axle");
    let base_y = bike.pose(sag_m).seatstay_point(bike.points.rear_axle)[1] - wheel_r;
    let np = r.point_names.len();
    let mut ground = Vec::with_capacity(r.frame_t_s.len() * GROUND_POINTS * 2);
    let mut distance = Vec::with_capacity(r.frame_t_s.len());
    for (f, &t) in r.frame_t_s.iter().enumerate() {
        let d = input.speed_mps * t;
        let axle_x = axle_i.map_or(0.0, |i| r.point_xy[(f * np + i) * 2] as f64);
        for k in 0..GROUND_POINTS {
            let dx = GROUND_WINDOW_M * (k as f64 / (GROUND_POINTS - 1) as f64 - 0.5);
            ground.push((axle_x + dx) as f32);
            ground.push((base_y + ground_at(d + dx)) as f32);
        }
        distance.push(d as f32);
    }
    components.insert(tr.clone(), serde_json::json!({"wheel_radius_m": wheel_r, "window_m": GROUND_WINDOW_M}));
    tracks.push(Track { name: "ground".into(), component: tr.clone(), kind: TrackKind::Xy, count: GROUND_POINTS, unit: "m".into(), labels: None, values: ground });
    tracks.push(Track { name: "distance".into(), component: tr, kind: TrackKind::Scalar, count: 1, unit: "m".into(), labels: None, values: distance });
    SimResult { frame_t_s: r.frame_t_s.iter().map(|&t| t as f32).collect(), components, tracks }
}

/// Points along the drawn ground (a 10 mm step over [`GROUND_WINDOW_M`]).
pub const GROUND_POINTS: usize = 301;
/// Length of ground drawn round the rear axle, metres.
pub const GROUND_WINDOW_M: f64 = 3.0;

/// A run's bytes: `IDLM` v1 ([`crate::sim_result_wire`]) of [`run_result`].
pub fn encode_run(r: &DynResult, bike: &SimBike, frame: &PhotoFrame, input: &BumpTrain) -> Vec<u8> {
    encode_sim_result(&run_result(r, bike, frame, input, &|d| input.ground_height(d), input.sag_m))
}

/// Riding over bumps instead of prescribing the travel (whole-bike sim spec
/// §9, stride 3): the bike whose springs ride, and the bumps' shape. The
/// bump train gives the speed, count, spacing and lead.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct RideRequest {
    /// The bike whose parameters (masses, shock, pressures, clicks, tyre) ride.
    pub bike_id: String,
    /// Each bump's height, m (negative: a step down).
    pub bump_height_m: f64,
    /// Each bump's length along the trail, m.
    pub bump_length_m: f64,
    /// Mean crank torque while riding, N·m; 0 coasts. Absent: 0.
    #[serde(default)]
    pub pedal_torque_nm: f64,
    /// Cadence, rpm. Absent: 80.
    #[serde(default = "default_cadence")]
    pub cadence_rpm: f64,
}

fn default_cadence() -> f64 {
    80.0
}

/// The rear end from a bike's parameters and the drawing, with the
/// defaults that stood in for missing ones, in words.
pub fn rear_end_of(p: &idl_rs::calibration::params::Params, bike: &SimBike, cog_x_m: f64, wheelbase_m: f64) -> Result<(idl_rs::sim::ride::RearEnd, Vec<String>), IpcError> {
    use idl_rs::calibration::params::{mass_table, number};
    use idl_rs::sim::ride::{tyre_stiffness_n_m, Damper, RearEnd};
    use idl_rs::sim::suspension::{air_spring, shock_stroke, wheel_loads_n, End, G, PSI_PA};
    let mut assumed = Vec::new();
    let mut or = |key: &str, default: f64, what: &str| {
        number(p, key).unwrap_or_else(|| {
            assumed.push(format!("{what}: {default}"));
            default
        })
    };
    let st = shock_stroke(bike, bike.travel_max_m).filter(|s| *s > 1e-3).ok_or_else(|| IpcError::new(IpcErrorKind::InvalidArgument, "riding needs the shock: place both shock eyes"))?;
    let mass = or("mass.bike_kg", 16.0, "bike mass (kg)") + or("rider.mass_kg", 75.0, "rider mass in kit (kg)");
    let m = mass_table(p);
    let unsprung = if m.rear_unsprung_kg > 0.5 { m.rear_unsprung_kg } else { or("", 4.5, "rear unsprung mass (kg)") };
    let (_, rear_n) = wheel_loads_n(mass, cog_x_m, wheelbase_m);
    let psi = or("shock.psi", 200.0, "shock pressure (psi)");
    let tyre_psi = or("rear_tyre.psi", 25.0, "rear tyre (psi)");
    // clicks from closed open the damper about 8 % each from twice the
    // default when closed: a placeholder curve until the shock is identified
    let scale = |key: &str| number(p, key).map_or(1.0, |c| 2.0 * 0.92_f64.powf(c.max(0.0)) / (2.0 * 0.92_f64.powf(8.0)));
    let d = Damper::default();
    let damper = Damper { lsc_ns_m: d.lsc_ns_m * scale("shock.lsc"), hsc_ns_m: d.hsc_ns_m * scale("shock.hsc"), lsr_ns_m: d.lsr_ns_m * scale("shock.lsr"), hsr_ns_m: d.hsr_ns_m * scale("shock.hsr"), knee_mps: d.knee_mps };
    assumed.push("damping from clicks: a placeholder curve (8 % per click, 8 clicks = typical)".into());
    let rear = RearEnd {
        sprung_kg: (rear_n / G - unsprung).max(1.0),
        unsprung_kg: unsprung,
        spring: air_spring(p, End::Shock, st),
        gauge_pa: psi * PSI_PA,
        damper,
        tyre_k_n_m: tyre_stiffness_n_m(tyre_psi),
        tyre_c_ns_m: 100.0,
    };
    Ok((rear, assumed))
}

/// Runs the dynamics for an (unsaved) setup and encodes it.
pub fn run_drivetrain_sim_via(setup: &SetupPx, gear: usize, input: &BumpTrain, ride: Option<(&RideRequest, &Path)>, progress: &mut dyn FnMut(f64)) -> Result<Vec<u8>, IpcError> {
    let (linkage, drivetrain, _) = resolve(setup, None, 0)?;
    let frame = PhotoFrame { rear_axle_px: setup.points["rear_axle"], front_axle_px: setup.points["front_axle"], wheelbase_m: setup.wheelbase_m };
    let bike = SimBike::new(&linkage, &drivetrain)?;
    let enabled = |i: usize| drivetrain.rollers[i].enabled;
    let bad = |m: &str| IpcError::new(IpcErrorKind::InvalidArgument, m.to_string());
    if !(input.count >= 1 && input.count <= 200 && input.spacing_s > 0.0 && input.compress_s > 0.0 && input.rebound_s > 0.0 && input.depth_m <= linkage.rear_travel_m + 1e-9 && input.sag_m >= 0.0) {
        return Err(bad("the bumps need 1-200 hits, positive times, and a depth within the travel"));
    }
    if input.duration_s() > 120.0 {
        return Err(bad("a run is at most 120 s"));
    }
    let gear = gear.min(drivetrain.cassette_teeth.len() - 1);
    let Some((req, root)) = ride else {
        let exc = input.excitation(1000.0);
        let r = simulate(&bike, gear, &enabled, &exc, &DynConfig::default(), &mut |f| {
            progress(f);
            true
        })?;
        return Ok(encode_run(&r, &bike, &frame, input));
    };
    // ride the rear end over the bumps; the chain runs on the travel that gives
    use idl_rs::sim::ride::Terrain;
    if !(req.bump_length_m > 0.05 && req.bump_height_m.abs() <= 1.0) {
        return Err(bad("a bump needs a length over 5 cm and a height within a metre"));
    }
    let file = bikelog::read_bike_file(root, &req.bike_id)?;
    let p = bikelog::effective_parameters(&file, now_ms());
    let cog_x = linkage.points_m.centre_of_mass.map_or(0.4 * linkage.wheelbase_m, |c| c[0]);
    let (rear, _) = rear_end_of(&p, &bike, cog_x, linkage.wheelbase_m)?;
    let terrain = Terrain::bumps(input.count, req.bump_height_m, req.bump_length_m, input.spacing_s * input.speed_mps, input.lead_s * input.speed_mps);
    // pedalling: the gear's anti-squat through travel decides how much the drive squats the rear
    let pedal = if req.pedal_torque_nm > 0.0 {
        let cog_h = centre_of_mass_height_m(&linkage, drivetrain.wheel_radius_m).unwrap_or(setup.params.cog_height_m);
        let curves = gear_curves(&bike, gear, 17, &enabled)?;
        let anti_squat = curves.travel_mm.iter().zip(&curves.squat_angle_deg).filter_map(|(t, a)| a.map(|a| (t / 1000.0, anti_squat_pct(a, cog_h, linkage.wheelbase_m)))).collect();
        Some(idl_rs::sim::ride::Pedalling {
            torque_nm: req.pedal_torque_nm,
            cadence_rpm: req.cadence_rpm.clamp(10.0, 200.0),
            chainring_teeth: drivetrain.chainring_teeth,
            cog_teeth: drivetrain.cassette_teeth[gear],
            wheel_radius_m: drivetrain.wheel_radius_m,
            cog_height_m: cog_h,
            wheelbase_m: linkage.wheelbase_m,
            anti_squat,
        })
    } else {
        None
    };
    let out = idl_rs::sim::ride::ride_pedalling(&bike, &rear, &terrain, input.speed_mps, input.duration_s() + 0.3, 1000.0, pedal.as_ref())?;
    let r = simulate(&bike, gear, &enabled, &out.excitation, &DynConfig::default(), &mut |f| {
        progress(f);
        true
    })?;
    let mut result = run_result(&r, &bike, &frame, &BumpTrain { sag_m: out.sag_m, ..*input }, &|d| terrain.height(d), out.sag_m);
    // the ride's own channels, at the run's frames
    let at = |v: &[f64], t: f64| {
        let i = ((t * 1000.0).round() as usize).min(v.len() - 1);
        v[i] as f32
    };
    let ride_tracks = [("Tyre force", &out.tyre_n), ("Shock force", &out.shock_n)];
    for (name, v) in ride_tracks {
        let values = result.frame_t_s.iter().map(|&t| at(v, t as f64)).collect();
        result.tracks.push(Track { name: name.into(), component: "drivetrain".into(), kind: TrackKind::Scalar, count: 1, unit: "N".into(), labels: None, values });
    }
    Ok(encode_sim_result(&result))
}

/// Replaying a recorded ride instead of a bump train (sim spec §5): a
/// stretch of a library session, its rear travel from the physics estimator.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct ReplayRequest {
    /// The session.
    pub session_id: String,
    /// Start of the stretch, s from the session's first sample.
    pub from_s: f64,
    /// End of the stretch, s.
    pub to_s: f64,
    /// IMU0's low-pass cut-off, Hz. Absent: 100.
    #[serde(default)]
    pub cutoff_hz: Option<f64>,
}

fn physics_error(e: idl_library::physics::PhysicsError) -> IpcError {
    use idl_library::physics::PhysicsErrorKind as K;
    let kind = match e.kind {
        K::NotFound => IpcErrorKind::NotFound,
        K::NotCalibrated | K::Unusable => IpcErrorKind::InvalidArgument,
        K::Io => IpcErrorKind::Io,
        K::Solve => IpcErrorKind::Internal,
    };
    IpcError::new(kind, e.message)
}

/// Runs the dynamics for an (unsaved) setup over a recorded stretch and
/// encodes it, with a "Speed" track (m/s). The recorded travel is held
/// within this bike's travel; the ground is drawn flat. `progress` hears
/// the phase and, while simulating, the fraction done.
pub fn run_replay_via(setup: &SetupPx, gear: usize, req: &ReplayRequest, root: &Path, progress: &mut dyn FnMut(&str, Option<f64>)) -> Result<Vec<u8>, IpcError> {
    let (linkage, drivetrain, _) = resolve(setup, None, 0)?;
    let frame = PhotoFrame { rear_axle_px: setup.points["rear_axle"], front_axle_px: setup.points["front_axle"], wheelbase_m: setup.wheelbase_m };
    let bike = SimBike::new(&linkage, &drivetrain)?;
    let enabled = |i: usize| drivetrain.rollers[i].enabled;
    let gear = gear.min(drivetrain.cassette_teeth.len() - 1);
    let cutoff = req.cutoff_hz.unwrap_or(idl_rs::sim::replay::DEFAULT_CUTOFF_HZ);
    let rp = idl_library::replay::replay(root, &req.session_id, req.from_s, req.to_s, cutoff, &mut |p| progress(p, None)).map_err(physics_error)?;
    let mut exc = rp.excitation;
    for s in &mut exc.travel_m {
        *s = s.min(linkage.rear_travel_m);
    }
    let r = simulate(&bike, gear, &enabled, &exc, &DynConfig::default(), &mut |f| {
        progress("simulating", Some(f));
        true
    })?;
    let mut sorted = exc.travel_m.clone();
    sorted.sort_by(f64::total_cmp);
    let sag = sorted[sorted.len() / 2];
    let input = BumpTrain { speed_mps: rp.mean_speed_mps.max(0.1), sag_m: sag, depth_m: sag, count: 1, ..BumpTrain::default() };
    let mut result = run_result(&r, &bike, &frame, &input, &|_| 0.0, sag);
    let speed = result.frame_t_s.iter().map(|&t| exc.at(t as f64).speed_mps as f32).collect();
    result.tracks.push(Track { name: "Speed".into(), component: "drivetrain".into(), kind: TrackKind::Scalar, count: 1, unit: "m/s".into(), labels: None, values: speed });
    Ok(encode_sim_result(&result))
}

/// C3 §3.15 `run_drivetrain_sim(setup, gear, input, ride, replay, progress)` (async):
/// the chain loop through a bump train, frame by frame, as `IDLM` v1 bytes
/// ([`encode_run`]). With `ride`, the bike's rear end rides over bumps of
/// that shape at the train's speed, count and spacing, and the chain runs on
/// the travel that gives (adding the "Tyre force" and "Shock force" tracks).
/// With `replay`, a recorded stretch drives it instead ([`run_replay_via`]);
/// `input` and `ride` are then ignored. Progress: `phase` `"estimating
/// travel"` and `"reading IMU0"` (no total) on a replay, then `"simulating"`,
/// `done` of `total` = 1000.
/// Errors: `invalid_argument` (the setup or the bumps), as `sim_kinematics`.
#[tauri::command(async)]
pub fn run_drivetrain_sim(setup: SetupPx, gear: usize, input: BumpTrain, ride: Option<RideRequest>, replay: Option<ReplayRequest>, progress: tauri::ipc::Channel<Progress>, data_dir: tauri::State<'_, DataDir>) -> Result<tauri::ipc::Response, IpcError> {
    if let Some(req) = replay {
        let bytes = run_replay_via(&setup, gear, &req, data_dir.0.as_path(), &mut |phase, f| {
            let _ = progress.send(Progress { done: f.map_or(0, |f| (f * 1000.0) as u64), total: f.map(|_| 1000), phase: phase.into() });
        })?;
        return Ok(tauri::ipc::Response::new(bytes));
    }
    let bytes = run_drivetrain_sim_via(&setup, gear, &input, ride.as_ref().map(|r| (r, data_dir.0.as_path())), &mut |f| {
        let _ = progress.send(Progress { done: (f * 1000.0) as u64, total: Some(1000), phase: "simulating".into() });
    })?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// One end's spring as fitted to the logged sag measurements.
#[derive(Debug, Clone, serde::Serialize)]
pub struct SpringFitView {
    /// Air piston area, cm².
    pub piston_area_cm2: f64,
    /// Positive chamber at top-out with no spacers, cc.
    pub positive_volume_cc: f64,
    /// Negative chamber at top-out, cc.
    pub negative_volume_cc: f64,
    /// Root-mean-square miss between measured and predicted sag, mm.
    pub rms_mm: f64,
    /// 1: the area only (one measurement); 2: area and positive volume.
    pub unknowns: usize,
    /// The fitted values as parameters, ready for `set_bike_parameters`.
    pub values: idl_rs::calibration::params::Params,
}

/// One logged sag measurement beside what the springs predict for it now.
#[derive(Debug, Clone, serde::Serialize)]
pub struct SagTestView {
    /// When it was measured, UTC ms.
    pub at_ms: i64,
    /// "fork" or "shock".
    pub end: &'static str,
    /// Pressure then, psi.
    pub psi: f64,
    /// Carried mass then, kg.
    pub carried_kg: f64,
    /// Measured sag (stroke), mm.
    pub measured_mm: f64,
    /// Predicted by the current parameters, mm.
    pub predicted_mm: f64,
    /// Predicted by the fit, mm.
    pub fitted_mm: Option<f64>,
}

/// One end's predicted sag.
#[derive(Debug, Clone, serde::Serialize)]
pub struct SagView {
    /// Stroke at sag, mm (the shaft or the stanchion, what a rider measures).
    pub stroke_mm: f64,
    /// As a share of the stroke, %.
    pub pct: f64,
    /// Rear only: the wheel's travel at sag, mm.
    pub wheel_mm: Option<f64>,
}

/// C3 §3.15 `sim_suspension` result: the springs, the static loads and the
/// sag they give, and the springs fitted to the logged sag measurements.
#[derive(Debug, Clone, serde::Serialize)]
pub struct SuspensionView {
    /// Rear wheel travel samples, mm.
    pub travel_mm: Vec<f64>,
    /// Shock stroke at each travel, mm; empty without both shock eyes.
    pub shock_stroke_mm: Vec<f64>,
    /// Leverage ratio at each travel.
    pub leverage: Vec<f64>,
    /// Rear wheel force at each travel, N, static (slow).
    pub rear_force_n: Vec<f64>,
    /// The same over a bump (fast, adiabatic), N.
    pub rear_force_fast_n: Vec<f64>,
    /// Fork stroke samples, mm.
    pub fork_mm: Vec<f64>,
    /// Fork force along its legs at each stroke, N, static.
    pub fork_force_n: Vec<f64>,
    /// The same over a bump, N.
    pub fork_force_fast_n: Vec<f64>,
    /// Rider and bike, kg (no pack: a sag test's pack stays out of the bike as ridden).
    pub mass_kg: f64,
    /// Static load on each wheel less its unsprung weight, N (front, rear).
    pub sprung_load_n: [f64; 2],
    /// The share of the weight on the rear wheel, %.
    pub rear_pct: f64,
    /// Rear sag at the current shock pressure.
    pub rear_sag: Option<SagView>,
    /// Fork sag at the current fork pressure.
    pub fork_sag: Option<SagView>,
    /// Every logged sag measurement.
    pub tests: Vec<SagTestView>,
    /// The fork's spring fitted to its measurements.
    pub fork_fit: Option<SpringFitView>,
    /// The shock's.
    pub shock_fit: Option<SpringFitView>,
    /// Assumptions standing in for missing parameters, in words.
    pub assumed: Vec<String>,
}

/// A logged measurement turned into a fit input, with its psi and carried mass.
type LoggedSag = (i64, idl_rs::sim::suspension::SagTest, f64, f64);

/// The suspension at the drawing `setup` with bike `bike_id`'s parameters
/// and log (see [`sim_suspension`]).
pub fn sim_suspension_via(data_root: &Path, bike_id: &str, setup: &SetupPx, now: i64) -> Result<SuspensionView, IpcError> {
    use idl_rs::calibration::params::{mass_table, number, Params};
    use idl_rs::sim::suspension::{air_spring, fit, fork_axial_share, leverage_ratio, rear_sag_travel_m, rear_wheel_force_n, shock_stroke, wheel_loads_n, AirSpring, End, SagTest, G, N_DYNAMIC, N_STATIC, PSI_PA};

    let file = bikelog::read_bike_file(data_root, bike_id)?;
    let (linkage, drivetrain, _) = resolve(setup, None, now)?;
    let bike = SimBike::new(&linkage, &Drivetrain { chain_links: drivetrain.chain_links.max(100), ..drivetrain })?;
    let p = bikelog::effective_parameters(&file, now);
    let assumed: std::cell::RefCell<Vec<String>> = std::cell::RefCell::new(Vec::new());
    let note = |what: String| {
        let mut a = assumed.borrow_mut();
        if !a.contains(&what) {
            a.push(what);
        }
    };
    let or = |p: &Params, key: &str, default: f64, what: &str| {
        number(p, key).unwrap_or_else(|| {
            note(format!("{what}: {default}"));
            default
        })
    };
    let wb = linkage.wheelbase_m;
    let cog_x = match linkage.points_m.centre_of_mass {
        Some(c) => c[0],
        None => {
            note("centre of mass 40 % of the wheelbase ahead of the rear axle (place the centre of mass point)".into());
            0.4 * wb
        }
    };
    let hta = or(&p, "geometry.head_angle_deg", 64.0, "head angle (°)");
    let fork_stroke = or(&p, "fork.travel_mm", 160.0, "fork travel (mm)") / 1000.0;
    let rear_stroke = shock_stroke(&bike, bike.travel_max_m).filter(|s| *s > 1e-3);
    // the sprung load on each wheel from the parameters of a day, with what
    // the rider carried for a sag test (the log keeps the last test's pack,
    // so the bike as ridden now leaves it out)
    let loads = |p: &Params, carried: bool| {
        let m = mass_table(p);
        let pack = if carried { number(p, "rider.carried_kg").unwrap_or(0.0) } else { 0.0 };
        let mass = or(p, "mass.bike_kg", 16.0, "bike mass (kg)") + or(p, "rider.mass_kg", 75.0, "rider mass in kit (kg)") + pack;
        let (f, r) = wheel_loads_n(mass, cog_x, wb);
        (mass, (f - m.front_unsprung_kg * G).max(0.0), (r - m.rear_unsprung_kg * G).max(0.0))
    };
    let (mass_kg, front_n, rear_n) = loads(&p, false);
    let shock_psi = or(&p, "shock.psi", 200.0, "shock pressure (psi)");
    let fork_psi = or(&p, "fork.psi", 80.0, "fork pressure (psi)");
    let fork = air_spring(&p, End::Fork, fork_stroke);
    let axial = fork_axial_share(hta);

    let n = 41;
    let travel: Vec<f64> = (0..n).map(|i| bike.travel_max_m * i as f64 / (n - 1) as f64).collect();
    let fork_x: Vec<f64> = (0..n).map(|i| fork_stroke * i as f64 / (n - 1) as f64).collect();
    let fx = fork.stroke_under(fork_psi * PSI_PA, front_n * axial);
    let mut view = SuspensionView {
        travel_mm: travel.iter().map(|t| t * 1000.0).collect(),
        shock_stroke_mm: Vec::new(),
        leverage: Vec::new(),
        rear_force_n: Vec::new(),
        rear_force_fast_n: Vec::new(),
        fork_mm: fork_x.iter().map(|x| x * 1000.0).collect(),
        fork_force_n: fork_x.iter().map(|&x| fork.force_n(fork_psi * PSI_PA, x, N_STATIC)).collect(),
        fork_force_fast_n: fork_x.iter().map(|&x| fork.force_n(fork_psi * PSI_PA, x, N_DYNAMIC)).collect(),
        mass_kg,
        sprung_load_n: [front_n, rear_n],
        rear_pct: 100.0 * (1.0 - cog_x / wb).clamp(0.0, 1.0),
        rear_sag: None,
        fork_sag: Some(SagView { stroke_mm: fx * 1000.0, pct: 100.0 * fx / fork_stroke, wheel_mm: None }),
        tests: Vec::new(),
        fork_fit: None,
        shock_fit: None,
        assumed: Vec::new(),
    };

    let shock = rear_stroke.map(|st| air_spring(&p, End::Shock, st));
    if let (Some(shock), Some(st)) = (shock, rear_stroke) {
        for &t in &travel {
            view.shock_stroke_mm.push(shock_stroke(&bike, t).unwrap_or(0.0) * 1000.0);
            view.leverage.push(leverage_ratio(&bike, t).unwrap_or(f64::NAN));
            view.rear_force_n.push(rear_wheel_force_n(&bike, &shock, shock_psi * PSI_PA, t, N_STATIC).unwrap_or(f64::NAN));
            view.rear_force_fast_n.push(rear_wheel_force_n(&bike, &shock, shock_psi * PSI_PA, t, N_DYNAMIC).unwrap_or(f64::NAN));
        }
        if let Some(t) = rear_sag_travel_m(&bike, &shock, shock_psi * PSI_PA, rear_n) {
            let x = shock_stroke(&bike, t).unwrap_or(0.0);
            view.rear_sag = Some(SagView { stroke_mm: x * 1000.0, pct: 100.0 * x / st, wheel_mm: Some(t * 1000.0) });
        }
    }

    // the logged measurements, each with the parameters of its day
    let mut fork_tests: Vec<LoggedSag> = Vec::new();
    let mut shock_tests: Vec<LoggedSag> = Vec::new();
    for m in bikelog::sag_measurements(&file) {
        let (_, f_n, r_n) = loads(&m.params, true);
        let carried = number(&m.params, "rider.carried_kg").unwrap_or(0.0);
        if let (true, Some(sag), Some(psi)) = (m.fork, number(&m.params, "fork.sag_mm"), number(&m.params, "fork.psi")) {
            let spacers = number(&m.params, "fork.volume_reducers").unwrap_or(0.0);
            fork_tests.push((m.at_ms, SagTest { gauge_pa: psi * PSI_PA, load_n: f_n * axial, stroke_m: sag / 1000.0, spacers }, psi, carried));
        }
        if let (true, Some(sag), Some(psi), Some(st)) = (m.shock, number(&m.params, "shock.sag_mm"), number(&m.params, "shock.psi"), rear_stroke) {
            // the wheel's travel at the measured stroke, then the shock's force there through the leverage
            let x = (sag / 1000.0).min(st);
            let (mut a, mut b) = (0.0, bike.travel_max_m);
            for _ in 0..60 {
                let mid = 0.5 * (a + b);
                if shock_stroke(&bike, mid).unwrap_or(0.0) < x {
                    a = mid;
                } else {
                    b = mid;
                }
            }
            let lr = leverage_ratio(&bike, 0.5 * (a + b)).unwrap_or(1.0);
            let spacers = number(&m.params, "shock.volume_spacers").unwrap_or(0.0);
            shock_tests.push((m.at_ms, SagTest { gauge_pa: psi * PSI_PA, load_n: r_n * lr, stroke_m: x, spacers }, psi, carried));
        }
    }

    // fit each end, and set each measurement beside the current and fitted predictions
    let spacer_m3 = |key: &str, default_cc: f64| number(&p, key).unwrap_or(default_cc) * 1e-6;
    let ends: [(End, Option<AirSpring>, &Vec<LoggedSag>, f64, &str); 2] = [
        (End::Fork, Some(fork), &fork_tests, spacer_m3("fork.reducer_cc", 10.0), "fork.volume_reducers"),
        (End::Shock, shock, &shock_tests, spacer_m3("shock.spacer_cc", 3.0), "shock.volume_spacers"),
    ];
    for (end, spring, tests, per, spacers_key) in ends {
        let Some(spring) = spring else { continue };
        let ts: Vec<SagTest> = tests.iter().map(|t| t.1).collect();
        let fitted = fit(&spring, &ts, per);
        let now_spacers = number(&p, spacers_key).unwrap_or(0.0);
        for (at_ms, t, psi, carried) in tests {
            let at = |s: &AirSpring, base: f64| AirSpring { positive_m3: s.positive_m3 - (t.spacers - base) * per, ..*s }.stroke_under(t.gauge_pa, t.load_n) * 1000.0;
            view.tests.push(SagTestView {
                at_ms: *at_ms,
                end: end.prefix(),
                psi: *psi,
                carried_kg: *carried,
                measured_mm: t.stroke_m * 1000.0,
                predicted_mm: at(&spring, now_spacers),
                fitted_mm: fitted.map(|f| at(&f.spring, ts[0].spacers)),
            });
        }
        let Some(f) = fitted else { continue };
        let k = end.prefix();
        let positive = f.spring.positive_m3 + ts[0].spacers * per;
        let round = |v: f64, places: i32| (v * 10f64.powi(places)).round() / 10f64.powi(places);
        let values: Params = [
            (format!("{k}.piston_area_cm2"), serde_json::json!(round(f.spring.area_m2 * 1e4, 2))),
            (format!("{k}.positive_volume_cc"), serde_json::json!(round(positive * 1e6, 1))),
            (format!("{k}.negative_volume_cc"), serde_json::json!(round(f.spring.negative_m3 * 1e6, 1))),
        ]
        .into();
        let v = SpringFitView { piston_area_cm2: f.spring.area_m2 * 1e4, positive_volume_cc: positive * 1e6, negative_volume_cc: f.spring.negative_m3 * 1e6, rms_mm: f.rms_m * 1000.0, unknowns: f.unknowns, values };
        match end {
            End::Fork => view.fork_fit = Some(v),
            End::Shock => view.shock_fit = Some(v),
        }
    }
    if rear_stroke.is_none() {
        note("no rear spring: place both shock eyes".into());
    }
    view.assumed = assumed.into_inner();
    Ok(view)
}

/// C3 §3.15 `sim_suspension(bike_id, setup)` (async): the shock's stroke
/// and leverage through travel from the drawing `setup`, the air springs
/// from bike `bike_id`'s parameters (assumed values listed where one is
/// missing), the static loads from the centre of mass point, the sag those
/// give, and the springs fitted to every sag measurement in the bike's log
/// (`fork.sag_mm`, `shock.sag_mm` notes). Errors: `NotFound` for an
/// unknown bike, `InvalidArgument` for a drawing that isn't a linkage.
#[tauri::command(async)]
pub fn sim_suspension(bike_id: String, setup: SetupPx, data_dir: tauri::State<'_, DataDir>) -> Result<SuspensionView, IpcError> {
    sim_suspension_via(&data_dir.0, &bike_id, &setup, now_ms())
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
        bikelog::save_bike(root, &bikelog::Bike { bike_id: "gt".into(), name: "GT".into(), name_updated_at_ms: 1, fields: Vec::new(), fields_updated_at_ms: 0, ..Default::default() }).unwrap();
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
        // Arrange: the derailleur measured at the lower jockey, 12 N back, 27 N to pull, 1 mm of play
        let root = temp_root();
        let mut setup = gt_setup(&root);
        setup.params.spring_force_n = vec![[0.0, 12.0], [60.0, 18.0]];
        setup.params.pull_force_n = 27.0;
        setup.params.clutch_free_play_mm = 1.0;

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
        let file = bikelog::read_bike_file(&root, "gt").unwrap();
        let (q, dr) = (&b.params, &file.drivetrain.as_ref().unwrap().derailleur);
        assert!((q.pull_force_n - 27.0).abs() < 1e-9 && (q.spring_force_n[1][1] - 18.0).abs() < 1e-9 && (q.clutch_free_play_mm - 1.0).abs() < 1e-9, "{q:?}");
        let arm = dr.lower_jockey_arm_m();
        assert!((dr.clutch_torque_nm - 15.0 * arm).abs() < 1e-9 && (dr.spring_torque(0.0) - 12.0 * arm).abs() < 1e-9);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn sim_kinematics_chain_from_photo_takes_the_photos_loop_to_the_nearest_even_link() {
        // Arrange
        let root = temp_root();
        let mut setup = gt_setup(&root);
        setup.params.chain_from_photo = true;
        setup.params.chain_links = 2;

        // Act
        let k = sim_kinematics_via(&setup, 5, 3).unwrap();

        // Assert
        let l = k.photo_links.unwrap();
        assert_eq!(k.chain_links, ((l / 2.0).round() * 2.0) as u32, "{l}");
        assert!(k.unclosed.len() + k.snapshots.len() == 3);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn sim_kinematics_centre_of_mass_point_sets_the_anti_squat_height() {
        // Arrange: a centre of mass 1.0 m over the ground line
        let root = temp_root();
        let mut setup = gt_setup(&root);
        let fit = sim_kinematics_via(&setup, 5, 3).unwrap().chain_fit.unwrap();
        setup.params.chain_links = (((fit.0 + fit.1) / 4.0).round() * 2.0) as u32;
        setup.params.chain_from_photo = false;
        let f = frame();
        let r = setup.params.wheel_radius_m;
        setup.points.insert("centre_of_mass".into(), f.to_px([0.6, 1.0 - r]));

        // Act
        let k = sim_kinematics_via(&setup, 5, 3).unwrap();

        // Assert
        assert!((k.cog_height_m - 1.0).abs() < 1e-6, "{}", k.cog_height_m);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn sim_kinematics_gives_every_gear_and_a_snapshot_per_sample() {
        // Arrange
        let root = temp_root();
        let mut setup = gt_setup(&root);
        let fit = sim_kinematics_via(&setup, 5, 3).unwrap().chain_fit.unwrap();
        setup.params.chain_links = (((fit.0 + fit.1) / 4.0).round() * 2.0) as u32;
        setup.params.chain_from_photo = false;

        // Act
        let k = sim_kinematics_via(&setup, 5, 5).unwrap();

        // Assert
        assert_eq!(k.gears.len() + k.failed.len(), 12);
        assert_eq!(k.snapshots.len(), 5);
        assert_eq!(k.anti_squat_pct.len(), k.gears.len());
        assert!(k.anti_squat_pct.iter().all(|g| g.len() == 5 && g.iter().all(|v| v.is_some_and(f64::is_finite))));
        let drawn = k.drawn.unwrap();
        assert_eq!(drawn.cage_deg, 0.0);
        assert!(k.snapshots[0].pins.len() as u32 + 1 >= setup.params.chain_links, "{} pins", k.snapshots[0].pins.len());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn run_drivetrain_sim_encodes_idlm_v1_with_every_track() {
        // Arrange
        let root = temp_root();
        let mut setup = gt_setup(&root);
        let fit = sim_kinematics_via(&setup, 5, 3).unwrap().chain_fit.unwrap();
        setup.params.chain_links = (((fit.0 + fit.1) / 4.0).round() * 2.0) as u32;
        setup.params.chain_from_photo = false;
        let input = BumpTrain { count: 1, lead_s: 0.05, ..BumpTrain::default() };

        // Act
        let bytes = run_drivetrain_sim_via(&setup, 5, &input, None, &mut |_| {}).unwrap();

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
        assert!(head["components"]["terrain"]["wheel_radius_m"].as_f64().unwrap() > 0.2);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn run_result_terrain_ground_under_the_rear_axle_is_one_wheel_radius_below_it_every_frame() {
        // Arrange
        let root = temp_root();
        let mut setup = gt_setup(&root);
        let fit = sim_kinematics_via(&setup, 5, 3).unwrap().chain_fit.unwrap();
        setup.params.chain_links = (((fit.0 + fit.1) / 4.0).round() * 2.0) as u32;
        setup.params.chain_from_photo = false;
        let input = BumpTrain { count: 1, lead_s: 0.05, ..BumpTrain::default() };
        let (linkage, drivetrain) = from_px(&setup, None, 0).unwrap();
        let bike = SimBike::new(&linkage, &drivetrain).unwrap();
        let r = simulate(&bike, 5, &|i| drivetrain.rollers[i].enabled, &input.excitation(1000.0), &DynConfig::default(), &mut |_| true).unwrap();

        // Act
        let res = run_result(&r, &bike, &frame(), &input, &|d| input.ground_height(d), input.sag_m);

        // Assert: the middle ground point is under the axle, a wheel radius down
        let ground = res.tracks.iter().find(|t| t.name == "ground").unwrap();
        let (np, ai) = (r.point_names.len(), r.point_names.iter().position(|n| n == "rear_axle").unwrap());
        let mid = GROUND_POINTS / 2;
        let mut worst = 0.0f64;
        for f in 0..r.frame_t_s.len() {
            let g = [ground.values[(f * GROUND_POINTS + mid) * 2] as f64, ground.values[(f * GROUND_POINTS + mid) * 2 + 1] as f64];
            let a = [r.point_xy[(f * np + ai) * 2] as f64, r.point_xy[(f * np + ai) * 2 + 1] as f64];
            assert!((g[0] - a[0]).abs() < 1e-6);
            worst = worst.max((a[1] - g[1] - drivetrain.wheel_radius_m).abs());
        }
        assert!(worst < 1e-3, "the tyre is {:.2} mm off the ground", worst * 1000.0);
        let _ = std::fs::remove_dir_all(&root);
    }
    #[test]
    fn sim_suspension_logged_sag_is_fitted_and_the_fit_predicts_it() {
        // Arrange: a sag test at 220 / 75 psi, then again with a 10 kg pack
        let root = temp_root();
        let setup = gt_setup(&root);
        let set = |v: &[(&str, serde_json::Value)], t: i64| {
            let values = v.iter().map(|(k, v)| (k.to_string(), v.clone())).collect();
            bikelog::set_parameters(&root, "gt", &values, "", "pc", t).unwrap();
        };
        set(&[("mass.bike_kg", serde_json::json!(18.1)), ("rider.mass_kg", serde_json::json!(79.4))], 1);
        set(&[("shock.psi", serde_json::json!(220)), ("fork.psi", serde_json::json!(75))], 2);
        set(&[("shock.sag_mm", serde_json::json!(18.0)), ("fork.sag_mm", serde_json::json!(42.0))], 3);
        set(&[("rider.carried_kg", serde_json::json!(10.0)), ("shock.sag_mm", serde_json::json!(20.5)), ("fork.sag_mm", serde_json::json!(47.0))], 4);

        // Act
        let v = sim_suspension_via(&root, "gt", &setup, 10).unwrap();

        // Assert
        assert_eq!(v.tests.len(), 4);
        let (f, s) = (v.fork_fit.unwrap(), v.shock_fit.unwrap());
        assert_eq!((f.unknowns, s.unknowns), (2, 2));
        assert!(f.rms_mm < 1.0 && s.rms_mm < 1.0, "{} {}", f.rms_mm, s.rms_mm);
        assert!(v.tests.iter().all(|t| (t.fitted_mm.unwrap() - t.measured_mm).abs() < 1.5), "{:?}", v.tests);
        assert!(v.leverage.iter().all(|l| *l > 1.5 && *l < 4.5), "{:?}", v.leverage);
        let _ = std::fs::remove_dir_all(&root);
    }
    #[test]
    fn run_drivetrain_sim_riding_over_bumps_adds_the_ride_tracks() {
        // Arrange
        let root = temp_root();
        let setup = gt_setup(&root);
        let values = [("shock.psi".to_string(), serde_json::json!(220)), ("mass.bike_kg".to_string(), serde_json::json!(18.1)), ("rider.mass_kg".to_string(), serde_json::json!(79.4))].into();
        bikelog::set_parameters(&root, "gt", &values, "", "pc", 1).unwrap();
        let input = BumpTrain { count: 2, lead_s: 0.1, speed_mps: 5.0, ..BumpTrain::default() };
        let ride = RideRequest { bike_id: "gt".into(), bump_height_m: 0.08, bump_length_m: 0.6, pedal_torque_nm: 40.0, cadence_rpm: 80.0 };

        // Act
        let bytes = run_drivetrain_sim_via(&setup, 5, &input, Some((&ride, root.as_path())), &mut |_| {}).unwrap();

        // Assert
        let header_len = u32::from_le_bytes(bytes[8..12].try_into().unwrap()) as usize;
        let header = std::str::from_utf8(&bytes[12..12 + header_len]).unwrap();
        assert!(header.contains(r#""Tyre force""#) && header.contains(r#""Shock force""#), "{header}");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn run_replay_via_a_session_not_in_the_library_is_not_found() {
        // Arrange
        let root = temp_root();
        let setup = gt_setup(&root);
        let req = ReplayRequest { session_id: "0123456789abcdef0123456789abcdef".into(), from_s: 0.0, to_s: 10.0, cutoff_hz: None };

        // Act
        let r = run_replay_via(&setup, 5, &req, &root, &mut |_, _| {});

        // Assert
        assert_eq!(r.unwrap_err().kind, IpcErrorKind::NotFound);
        let _ = std::fs::remove_dir_all(&root);
    }
}
