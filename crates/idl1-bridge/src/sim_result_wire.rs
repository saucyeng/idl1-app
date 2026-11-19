//! `IDLM` v1: a simulation's result over IPC (C3 §3.15; whole-bike sim loop
//! spec §6, D1). One layout for every component the simulator grows
//! (drivetrain now; suspension, tyres, rider later): a new component adds
//! tracks, not a version.
//!
//! Bytes, little-endian: `"IDLM"`, `u32` version (1), `u32` header length,
//! the header (UTF-8 JSON), zero padding to a multiple of 4, then `f32`
//! frame times `[frame]` (seconds), then each track's values in header order,
//! `[frame][count][dims]` where `dims` is 2 for `xy`, 3 for `xyz` and 1 for
//! `angle` and `scalar`.
//!
//! Header: `{"format": "sim-result", "frames": n, "components": {<name>:
//! {...}}, "tracks": [{"name", "component", "kind", "count", "unit",
//! "labels"?}]}`. A component's object is its own metadata (the drivetrain's
//! gear, wheels and totals); its tracks name it in `component`.

use serde::Serialize;
use serde_json::{Map, Value};

/// Magic of a sim result's bytes.
pub const SIM_RESULT_MAGIC: &[u8; 4] = b"IDLM";
/// Version of a sim result's bytes.
pub const SIM_RESULT_VERSION: u32 = 1;

/// What one sample of a track is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TrackKind {
    /// A point in the bike's side plane: x, y.
    Xy,
    /// A point in 3-D: x, y, z.
    Xyz,
    /// An angle.
    Angle,
    /// One number.
    Scalar,
}

impl TrackKind {
    /// Numbers per sample.
    pub fn dims(self) -> usize {
        match self {
            TrackKind::Xy => 2,
            TrackKind::Xyz => 3,
            TrackKind::Angle | TrackKind::Scalar => 1,
        }
    }
}

/// One track: `count` samples of `kind` per frame.
#[derive(Debug, Clone)]
pub struct Track {
    /// Name, unique in the result ("chain", "Top span tension").
    pub name: String,
    /// The component it belongs to (a key of [`SimResult::components`]).
    pub component: String,
    /// What each sample is.
    pub kind: TrackKind,
    /// Samples per frame (links in the chain, wheels; 1 for a channel).
    pub count: usize,
    /// Unit of every number ("m", "rad", "N"; "" for a count or a flag).
    pub unit: String,
    /// A name per sample, when the samples are named (points, wheels).
    pub labels: Option<Vec<String>>,
    /// `[frame][count][dims]`: frames × count × kind.dims() values.
    pub values: Vec<f32>,
}

/// A simulation's result: frame times, each component's metadata, and its tracks.
#[derive(Debug, Clone)]
pub struct SimResult {
    /// Frame times, seconds.
    pub frame_t_s: Vec<f32>,
    /// Each component's metadata, by name.
    pub components: Map<String, Value>,
    /// Every track, in the order their values follow the frame times.
    pub tracks: Vec<Track>,
}

/// Encodes `r` as `IDLM` v1 bytes.
///
/// # Panics
/// When a track's values are not frames × count × dims long: a bug in the
/// caller, not bad data.
pub fn encode_sim_result(r: &SimResult) -> Vec<u8> {
    let frames = r.frame_t_s.len();
    for t in &r.tracks {
        assert_eq!(t.values.len(), frames * t.count * t.kind.dims(), "track {} has the wrong length", t.name);
    }
    let tracks: Vec<Value> = r
        .tracks
        .iter()
        .map(|t| {
            let mut o = serde_json::json!({"name": t.name, "component": t.component, "kind": t.kind, "count": t.count, "unit": t.unit});
            if let Some(l) = &t.labels {
                o["labels"] = serde_json::json!(l);
            }
            o
        })
        .collect();
    let header = serde_json::json!({"format": "sim-result", "frames": frames, "components": r.components, "tracks": tracks});
    let head = serde_json::to_vec(&header).expect("a sim result header serializes");
    let body: usize = frames + r.tracks.iter().map(|t| t.values.len()).sum::<usize>();
    let mut out = Vec::with_capacity(16 + head.len() + 4 * body);
    out.extend_from_slice(SIM_RESULT_MAGIC);
    out.extend_from_slice(&SIM_RESULT_VERSION.to_le_bytes());
    out.extend_from_slice(&(head.len() as u32).to_le_bytes());
    out.extend_from_slice(&head);
    while out.len() % 4 != 0 {
        out.push(0);
    }
    for v in std::iter::once(&r.frame_t_s).chain(r.tracks.iter().map(|t| &t.values)) {
        for x in v {
            out.extend_from_slice(&x.to_le_bytes());
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn two_frames() -> SimResult {
        let mut components = Map::new();
        components.insert("drivetrain".into(), serde_json::json!({"gear": 3}));
        SimResult {
            frame_t_s: vec![0.0, 0.5],
            components,
            tracks: vec![
                Track { name: "chain".into(), component: "drivetrain".into(), kind: TrackKind::Xy, count: 2, unit: "m".into(), labels: None, values: vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0] },
                Track { name: "Cage angle".into(), component: "drivetrain".into(), kind: TrackKind::Scalar, count: 1, unit: "deg".into(), labels: Some(vec!["cage".into()]), values: vec![9.0, 10.0] },
            ],
        }
    }

    #[test]
    fn encode_sim_result_two_tracks_lays_out_magic_header_times_then_each_track() {
        // Arrange
        let r = two_frames();

        // Act
        let b = encode_sim_result(&r);

        // Assert
        assert_eq!(&b[0..4], b"IDLM");
        assert_eq!(u32::from_le_bytes(b[4..8].try_into().unwrap()), 1);
        let hl = u32::from_le_bytes(b[8..12].try_into().unwrap()) as usize;
        let head: Value = serde_json::from_slice(&b[12..12 + hl]).unwrap();
        assert_eq!(head["format"], "sim-result");
        assert_eq!(head["tracks"][0]["kind"], "xy");
        assert_eq!(head["tracks"][1]["labels"][0], "cage");
        assert!(head["tracks"][0].get("labels").is_none());
        let at = (12 + hl + 3) / 4 * 4;
        let f: Vec<f32> = b[at..].chunks(4).map(|c| f32::from_le_bytes(c.try_into().unwrap())).collect();
        assert_eq!(f, vec![0.0, 0.5, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0]);
    }

    #[test]
    #[should_panic(expected = "wrong length")]
    fn encode_sim_result_short_track_panics() {
        // Arrange
        let mut r = two_frames();
        r.tracks[0].values.pop();

        // Act
        encode_sim_result(&r);
    }
}
