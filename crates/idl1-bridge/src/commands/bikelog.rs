//! Bike log and setup sheet commands (C3 §3.11, bike-log spec
//! `2026-10-16-idl1-bike-log-DRAFT.md`): thin glue over
//! `idl_library::bikelog`. Every number the screens show (the running
//! sheet, which version is current, which notes are in conflict) is worked
//! out here, never in JavaScript.

use idl_rs::time::now_ms;
use std::path::Path;

use idl_library::bikelog::{self, Bike, BikeLogError, BikeLogErrorKind, Entry, EntryVersion, RunningSheet, SessionBikeLog};

use crate::error::{IpcError, IpcErrorKind};
use crate::state::DataDir;

impl From<BikeLogError> for IpcError {
    fn from(e: BikeLogError) -> Self {
        let kind = match e.kind {
            BikeLogErrorKind::Io => IpcErrorKind::Io,
            BikeLogErrorKind::Encode => IpcErrorKind::Internal,
            BikeLogErrorKind::Parse => IpcErrorKind::Io,
            BikeLogErrorKind::InvalidId => IpcErrorKind::InvalidArgument,
            BikeLogErrorKind::Conflict => IpcErrorKind::Conflict,
        };
        IpcError::new(kind, e.message)
    }
}

/// One log entry as the screens need it: the stored entry plus what core
/// works out from its versions.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct BikeLogEntryView {
    /// The entry with every version.
    pub entry: Entry,
    /// The version to show (the newest head).
    pub current: Option<EntryVersion>,
    /// Edited on two devices and not yet resolved: [`Self::heads`] holds
    /// each side's text to pick from.
    pub in_conflict: bool,
    /// The versions nothing was edited from, newest first.
    pub heads: Vec<EntryVersion>,
    /// Deleted (by its current version).
    pub deleted: bool,
}

/// `get_bike_log`'s return.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct BikeLogView {
    /// Live entries and deleted ones, sorted by entry id.
    pub entries: Vec<BikeLogEntryView>,
    /// The running sheet now.
    pub running_sheet: RunningSheet,
    /// Files in the log folder that didn't parse, as paths.
    pub skipped: Vec<String>,
}

fn get_bike_log_via(data_dir: &Path, bike_id: &str, at_ms: i64) -> Result<BikeLogView, IpcError> {
    if !bikelog::is_valid_id(bike_id) {
        return Err(IpcError::new(IpcErrorKind::InvalidArgument, format!("{bike_id:?} is not a bike id")));
    }
    let load = bikelog::load_log(data_dir, bike_id);
    let running_sheet = bikelog::running_sheet(&load.entries, at_ms);
    let entries = load
        .entries
        .into_iter()
        .map(|e| BikeLogEntryView {
            current: e.current().cloned(),
            in_conflict: e.in_conflict(),
            heads: e.heads().into_iter().cloned().collect(),
            deleted: e.is_deleted(),
            entry: e,
        })
        .collect();
    Ok(BikeLogView { entries, running_sheet, skipped: load.skipped.into_iter().map(|(p, _)| p.display().to_string()).collect() })
}

/// C3 §3.11 `list_bikes()`: every bike, sorted by name.
#[tauri::command(async)]
pub fn list_bikes(data_dir: tauri::State<'_, DataDir>) -> Result<Vec<Bike>, IpcError> {
    Ok(bikelog::load_bikes(&data_dir.0).bikes)
}

/// C3 §3.11 `bike_for_name(name)`: the bike with that name (case ignored),
/// created when there is none. The logger's bike name comes in here.
#[tauri::command(async)]
pub fn bike_for_name(name: String, data_dir: tauri::State<'_, DataDir>) -> Result<Bike, IpcError> {
    Ok(bikelog::bike_for_name(&data_dir.0, &name, now_ms())?)
}

/// `create_bike`'s and `copy_bike`'s naming: the parts of a bike's id and
/// name (whole-bike sim spec §12).
#[derive(Debug, Clone, PartialEq, serde::Deserialize)]
pub struct BikeNaming {
    /// The owner's initials ("IA").
    pub initials: String,
    /// Model year (2023).
    pub year: Option<u32>,
    /// Make ("GT").
    pub make: String,
    /// Model ("Force").
    pub model: String,
    /// Frame size ("LG").
    pub size: Option<String>,
    /// The variant's name ("lower idler"), for a variant.
    pub variant: Option<String>,
}

impl BikeNaming {
    fn id(&self) -> String {
        bikelog::bike_id_for(&self.initials, self.year, &self.make, &self.model, self.variant.as_deref())
    }

    fn name(&self) -> String {
        let mut parts: Vec<String> = vec![self.initials.trim().to_string()];
        if let Some(y) = self.year {
            parts.push(format!("{:02}", y % 100));
        }
        parts.push(self.make.trim().to_string());
        parts.push(self.model.trim().to_string());
        let mut name = parts.into_iter().filter(|p| !p.is_empty()).collect::<Vec<_>>().join(" ");
        if let Some(v) = self.variant.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
            name = format!("{name} - {v}");
        }
        name
    }

    fn model(&self) -> Option<bikelog::BikeModel> {
        (!self.make.trim().is_empty() || !self.model.trim().is_empty()).then(|| bikelog::BikeModel {
            make: self.make.trim().to_string(),
            model: self.model.trim().to_string(),
            year: self.year,
            size: self.size.clone().filter(|s| !s.trim().is_empty()),
        })
    }
}

/// How `copy_bike` copies.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CopyKindWire {
    /// An idea for the same bike.
    Variant,
    /// Another real bike from these numbers.
    Copy,
}

fn create_bike_via(data_dir: &Path, naming: &BikeNaming, now: i64) -> Result<Bike, IpcError> {
    Ok(bikelog::create_bike(data_dir, &naming.id(), &naming.name(), naming.model(), now)?)
}

fn copy_bike_via(data_dir: &Path, from_id: &str, naming: &BikeNaming, kind: CopyKindWire, now: i64) -> Result<Bike, IpcError> {
    let kind = match kind {
        CopyKindWire::Variant => bikelog::CopyKind::Variant,
        CopyKindWire::Copy => bikelog::CopyKind::Copy,
    };
    Ok(bikelog::copy_bike(data_dir, from_id, &naming.id(), &naming.name(), kind, now)?.bike)
}

/// C3 §3.11 `create_bike(naming)`: a new bike named and id'd from its
/// owner's initials, year, make and model ("IA 23 GT Force",
/// `IA-23-GT-Force`), never overwriting one (a taken id gets `-2`).
#[tauri::command(async)]
pub fn create_bike(naming: BikeNaming, data_dir: tauri::State<'_, DataDir>) -> Result<Bike, IpcError> {
    create_bike_via(&data_dir.0, &naming, now_ms())
}

/// C3 §3.11 `copy_bike(from_id, naming, kind)`: a variant of the bike, or a
/// new real bike started from its numbers: its linkage, drivetrain, photo
/// and model, no log or calibrations.
#[tauri::command(async)]
pub fn copy_bike(from_id: String, naming: BikeNaming, kind: CopyKindWire, data_dir: tauri::State<'_, DataDir>) -> Result<Bike, IpcError> {
    copy_bike_via(&data_dir.0, &from_id, &naming, kind, now_ms())
}

/// C3 §3.11 `get_bike_log(bike_id)`: the bike's log and its running sheet
/// now.
#[tauri::command(async)]
pub fn get_bike_log(bike_id: String, data_dir: tauri::State<'_, DataDir>) -> Result<BikeLogView, IpcError> {
    get_bike_log_via(&data_dir.0, &bike_id, now_ms())
}

/// C3 §3.11 `save_bike_log_entry(entry)`: saves an entry (a new one, or new
/// versions of one), merged with the copy on disk so no version is lost;
/// returns what was written.
#[tauri::command(async)]
pub fn save_bike_log_entry(entry: Entry, data_dir: tauri::State<'_, DataDir>) -> Result<Entry, IpcError> {
    Ok(bikelog::save_entry(&data_dir.0, &entry)?)
}

/// C3 §3.11 `attach_bike_log(session_id, bike_id)`: records that the
/// session was ridden on the bike and gives it the log entries since that
/// bike's previous session plus the running sheet at its start. The
/// session's start and end come from the catalog.
#[tauri::command(async)]
pub fn attach_bike_log(session_id: String, bike_id: String, data_dir: tauri::State<'_, DataDir>) -> Result<SessionBikeLog, IpcError> {
    let summary = idl_library::catalog_read::list_sessions(&data_dir.0)?
        .into_iter()
        .find(|s| s.session_id == session_id)
        .ok_or_else(|| IpcError::new(IpcErrorKind::NotFound, format!("session {session_id} not found")))?;
    let start_ms = summary.timestamp_utc_ms;
    let end_ms = start_ms + summary.duration_ms.unwrap_or(0);
    let doc = bikelog::attach_session(&data_dir.0, &session_id, &bike_id, start_ms, end_ms)?;
    Ok(doc.bike_log.unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;
    use idl_library::bikelog::EntryKind;

    fn version(id: &str, parents: &[&str], updated_at_ms: i64, text: &str) -> EntryVersion {
        EntryVersion {
            version_id: id.to_string(),
            parents: parents.iter().map(|p| p.to_string()).collect(),
            at_ms: 10,
            updated_at_ms,
            device: "phone".to_string(),
            text: text.to_string(),
            changes: Default::default(),
            sheet: Default::default(),
            deleted: false,
        }
    }

    #[test]
    fn get_bike_log_via_reports_current_version_and_conflicts() {
        // Arrange
        let root = std::env::temp_dir().join(format!("idl-tauri-bikelog-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let entry = Entry {
            entry_id: "e1".into(),
            bike_id: "gt".into(),
            kind: EntryKind::Note,
            versions: vec![version("v1", &[], 1, "a"), version("p", &["v1"], 2, "phone"), version("d", &["v1"], 3, "desk")],
        };
        bikelog::save_bike(&root, &bikelog::Bike { bike_id: "gt".into(), name: "GT".into(), name_updated_at_ms: 1, fields: Vec::new(), fields_updated_at_ms: 0, ..Default::default() }).unwrap();
        bikelog::save_entry(&root, &entry).unwrap();

        // Act
        let view = get_bike_log_via(&root, "gt", 100).unwrap();

        // Assert
        assert_eq!(view.entries.len(), 1);
        assert!(view.entries[0].in_conflict);
        assert_eq!(view.entries[0].current.as_ref().unwrap().text, "desk");
        assert_eq!(view.entries[0].heads.iter().map(|v| v.text.as_str()).collect::<Vec<_>>(), vec!["desk", "phone"]);
        assert_eq!(view.running_sheet.since, vec!["e1"]);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn get_bike_log_via_an_unsafe_bike_id_is_invalid_argument() {
        // Arrange
        let root = std::env::temp_dir();

        // Act
        let err = get_bike_log_via(&root, "../x", 0).unwrap_err();

        // Assert
        assert_eq!(err.kind, IpcErrorKind::InvalidArgument);
    }

    #[test]
    fn create_and_copy_bike_name_ids_and_variants_from_the_naming() {
        // Arrange
        let root = std::env::temp_dir().join(format!("idl1-bridge-bikes-{}", uuid::Uuid::new_v4()));
        let naming = BikeNaming { initials: "IA".into(), year: Some(2023), make: "GT".into(), model: "Force".into(), size: Some("LG".into()), variant: None };

        // Act
        let bike = create_bike_via(&root, &naming, 1).unwrap();
        let v = copy_bike_via(&root, &bike.bike_id, &BikeNaming { variant: Some("lower idler".into()), ..naming.clone() }, CopyKindWire::Variant, 2).unwrap();
        let again = create_bike_via(&root, &naming, 3).unwrap();

        // Assert
        assert_eq!((bike.bike_id.as_str(), bike.name.as_str()), ("IA-23-GT-Force", "IA 23 GT Force"));
        assert_eq!((v.bike_id.as_str(), v.name.as_str()), ("IA-23-GT-Force--lower-idler", "IA 23 GT Force - lower idler"));
        assert_eq!(v.variant_of.as_deref(), Some("IA-23-GT-Force"));
        assert_eq!(again.bike_id, "IA-23-GT-Force-2");
        assert_eq!(bike.model.unwrap().size.as_deref(), Some("LG"));
        let _ = std::fs::remove_dir_all(&root);
    }
}
