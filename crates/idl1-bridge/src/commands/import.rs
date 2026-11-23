//! Import commands (C3 §3.3): `import_file`, `list_importers`. Bridges C3's
//! `importer_id` vocabulary to `idl_library::import`'s extension-keyed
//! `import_idl0`/`import_file` entry points (L2 Task 6, L2-R13) and
//! `idl_rs::import::importers()`'s FIT/GPX/CSV registry (L2 Task 7, R51 Q2).
//!
//! Same `_via`-function idiom as every other module in this directory: each
//! `#[tauri::command]` is a thin wrapper over a plain function this module's
//! own tests exercise directly (`tauri::State`/`tauri::ipc::Channel` cannot
//! be constructed outside a running app).

use std::path::Path;

use idl_library::import as core_import;

use crate::commands::catalog::SessionSummary;
use crate::commands::device::Progress;
use crate::error::{IpcError, IpcErrorKind};
use crate::state::DataDir;

/// C3 §3.3 `ImporterInfo` — one importer `list_importers` advertises and
/// `import_file`'s `importer_id` argument accepts. `extensions` are
/// dot-prefixed on the wire (e.g. `".gpx"`), matching C3's own worked
/// example, even though core's `idl_rs::import::ImporterInfo::extensions`
/// stores them bare (matching `idl_rs::import::importer_for_extension`'s own
/// `ext` convention) — this `From` impl is the one place that mismatch is
/// resolved.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ImporterInfo {
    /// Stable id (e.g. `"gpx"`) — what `import_file`'s `importer_id` forces.
    pub id: String,
    /// Human-readable label (e.g. `"GPX track"`).
    pub label: String,
    /// Dot-prefixed lowercase extensions (e.g. `[".gpx"]`).
    pub extensions: Vec<String>,
}

impl From<&idl_rs::import::ImporterInfo> for ImporterInfo {
    fn from(i: &idl_rs::import::ImporterInfo) -> Self {
        Self {
            id: i.id.to_string(),
            label: i.label.to_string(),
            extensions: i.extensions.iter().map(|e| format!(".{e}")).collect(),
        }
    }
}

/// C3 §3.3 `import_file`'s return (lead ruling R60, 2026-09-05): wraps the
/// catalog row with the importer's own recovered warnings (a dropped
/// duplicate GPX timestamp, a `.idl0` truncation recovery) — a
/// `SessionSummary` alone (a fixed catalog-row shape) has no field to carry
/// a per-import advisory, and dropping one would violate CLAUDE.md §5.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ImportOutcome {
    /// The freshly-imported session's catalog row.
    pub session: SessionSummary,
    /// Non-fatal advisory messages raised while importing (never silently
    /// dropped) — empty on a clean import.
    pub warnings: Vec<String>,
}

/// Transport-agnostic core of `list_importers` (C3 §3.3): the `"idl0"` row
/// (`idl_rs::import::importers()` deliberately excludes it, R51 Q1/Q2 —
/// `.idl0` has its own entry point outside that registry's scope) plus every
/// row `idl_rs::import::importers()` enumerates, with extensions
/// dot-prefixed for the wire.
fn list_importers_via() -> Vec<ImporterInfo> {
    let mut out = vec![
        ImporterInfo { id: "idl0".to_string(), label: "IDL0 log".to_string(), extensions: vec![".idl0".to_string()] },
        ImporterInfo { id: "idl1".to_string(), label: "IDL1 session".to_string(), extensions: vec![".idl1".to_string()] },
    ];
    out.extend(idl_rs::import::importers().iter().map(ImporterInfo::from));
    out
}

/// C3 §3.3 `list_importers()`.
#[tauri::command]
pub fn list_importers() -> Vec<ImporterInfo> {
    list_importers_via()
}

/// Resolves `path`/`importer_id` to the lowercase, dot-free extension string
/// `idl_library::import::{import_idl0, import_file}` dispatch on (C3 §3.3:
/// `importer_id` is `null` for extension-based auto-detection, or one of the
/// ids `list_importers` returns to "force a specific importer"). Every id in
/// this vocabulary (`"idl0"` plus every `idl_rs::import::importers()` id —
/// `"fit"`/`"gpx"`/`"csv"`) is already spelled identically to the extension
/// `import_idl0`/`import_file` expect, so forcing by id needs no separate
/// translation table; forcing ignores the file's own actual extension
/// entirely, by design.
fn resolve_extension(path: &str, importer_id: Option<&str>) -> Result<String, IpcError> {
    match importer_id {
        Some(id) => {
            if id == "idl0" || id == "idl1" || idl_rs::import::importers().iter().any(|i| i.id == id) {
                Ok(id.to_string())
            } else {
                Err(IpcError::new(IpcErrorKind::InvalidArgument, format!("unrecognised importer_id '{id}'")))
            }
        }
        None => {
            let ext = Path::new(path).extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase());
            ext.ok_or_else(|| {
                IpcError::new(IpcErrorKind::InvalidArgument, format!("'{path}' has no file extension to auto-detect an importer from"))
            })
        }
    }
}

/// Transport-agnostic core of `import_file` (C3 §3.3). Reads `path` from
/// disk — the user's own pasted path (ledger R55), never resolved against
/// `data_dir` — dispatches to `import_idl0` (the `"idl0"` branch) or
/// `import_file` (every other resolved extension; core's own `import_file`
/// refuses `"idl0"` by design, L2-R13) by [`resolve_extension`]'s result,
/// rebuilds the catalog (C4 §5's rebuild is cheap and idempotent —
/// incremental catalog indexing does not exist yet), and reads the
/// freshly-imported row back from `catalog_read::list_sessions` by
/// `session_id`. `on_progress` is called with `"reading"` before the file
/// is sized and mapped, `"decoding"` before the importer call, and
/// `"materializing"` after a successful import and before the catalog
/// rebuild — never called again once a call has failed.
fn import_file_via(
    data_dir: &Path,
    path: &str,
    importer_id: Option<&str>,
    on_progress: impl FnMut(&str),
) -> Result<ImportOutcome, IpcError> {
    import_file_with(&ImportRunner::InProcess, data_dir, path, importer_id, on_progress)
}

/// The flag that starts the app's own executable as an import worker
/// (2026-11-23): `<exe> --idl1-import-worker <data_dir> <ext> <path>`.
pub const IMPORT_WORKER_FLAG: &str = "--idl1-import-worker";

/// Where an import runs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ImportRunner {
    /// In this process (tests, and phones, which cannot start one).
    InProcess,
    /// In a child: this executable started with [`IMPORT_WORKER_FLAG`]. An
    /// import that runs out of memory then ends the child, not the app
    /// (Rust aborts a process whose allocation fails; 2026-11-22 the app was
    /// killed twice importing a 271 MB log on a machine short of memory).
    Worker(std::path::PathBuf),
}

/// An import's heap peak, bytes, for a log of `file_len` bytes: about 8×
/// (measured 2026-11-22: a 271 MB `.idl1` reached 1.96 GB before the
/// allocation failed, 7.2×).
pub fn import_peak_estimate(file_len: u64) -> u64 {
    file_len.saturating_mul(8)
}

/// The error for an import that cannot fit, or that died for lack of memory.
fn out_of_memory(needed_bytes: u64, free_bytes: u64, path: &str, died: bool) -> IpcError {
    let gb = |b: u64| b as f64 / 1e9;
    let what = if died { "The import ran out of memory" } else { "Not enough memory to import this log" };
    IpcError::with_detail(
        IpcErrorKind::ResourceExhausted,
        format!(
            "{what}: it needs about {:.1} GB and {:.1} GB is free. Close some apps and import it again; the downloaded log is kept.",
            gb(needed_bytes),
            gb(free_bytes)
        ),
        serde_json::json!({ "needed_bytes": needed_bytes, "budget_bytes": free_bytes, "hint": format!("import '{path}'"), "died": died }),
    )
}

/// What a worker prints, one JSON line on stdout.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "result", rename_all = "snake_case")]
pub enum WorkerAnswer {
    /// Imported: the session id and the import's warnings.
    Imported { session_id: String, warnings: Vec<String> },
    /// Refused: the typed error, as the C3 shape.
    Failed { error: IpcError },
}

/// The import itself: the logger entry point for `.idl0`/`.idl1`, the
/// importer registry otherwise. Session id and warnings.
fn import_in_process(data_dir: &Path, path: &str, ext: &str) -> Result<(String, Vec<String>), IpcError> {
    // The path forms map the file rather than copying it onto the heap
    // (ruling R203.3). Logger files (`.idl0`, `.idl1`) share one entry
    // point; the parser tells them apart by their magic bytes.
    let report = if ext == "idl0" || ext == "idl1" {
        core_import::import_idl0_path(data_dir, Path::new(path))
    } else {
        core_import::import_file_path(data_dir, ext, Path::new(path))
    }
    .map_err(IpcError::from)?;
    let mut warnings = report.import_warnings;
    if let Some(truncation) = report.truncation_warning {
        warnings.push(truncation);
    }
    Ok((report.session_id, warnings))
}

/// The worker's whole run, from its arguments after the flag
/// (`<data_dir> <ext> <path>`): imports and returns the line to print.
pub fn run_import_worker(args: &[String]) -> WorkerAnswer {
    let [data_dir, ext, path] = args else {
        return WorkerAnswer::Failed { error: IpcError::new(IpcErrorKind::InvalidArgument, "the import worker takes <data_dir> <ext> <path>") };
    };
    match import_in_process(Path::new(data_dir), path, ext) {
        Ok((session_id, warnings)) => WorkerAnswer::Imported { session_id, warnings },
        Err(error) => WorkerAnswer::Failed { error },
    }
}

/// When this process was started as an import worker, runs it, prints the
/// answer and returns the exit code; `None` otherwise. Called first thing in
/// the app's `main`, before Tauri starts.
pub fn maybe_run_import_worker() -> Option<i32> {
    let args: Vec<String> = std::env::args().collect();
    let at = args.iter().position(|a| a == IMPORT_WORKER_FLAG)?;
    let answer = run_import_worker(&args[at + 1..]);
    let ok = matches!(answer, WorkerAnswer::Imported { .. });
    println!("{}", serde_json::to_string(&answer).unwrap_or_default());
    Some(if ok { 0 } else { 1 })
}

/// Reads a worker's stdout: its answer line, or `None` when it printed none
/// (it died, almost always for lack of memory).
pub fn parse_worker_output(stdout: &str) -> Option<WorkerAnswer> {
    stdout.lines().rev().find_map(|l| serde_json::from_str::<WorkerAnswer>(l.trim()).ok())
}

/// [`import_file_via`] with the import run by `runner`.
fn import_file_with(
    runner: &ImportRunner,
    data_dir: &Path,
    path: &str,
    importer_id: Option<&str>,
    mut on_progress: impl FnMut(&str),
) -> Result<ImportOutcome, IpcError> {
    let ext = resolve_extension(path, importer_id)?;

    on_progress("reading");
    // Sized before anything is read (ruling R203.4). An import's heap peak
    // is the parsed `Session` plus one channel's Arrow column plus the
    // encoded output — the raw log itself is a memory map, not heap, since
    // R203.3 — so twice the file size is a conservative ceiling for it.
    let file_len = std::fs::metadata(path)
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                IpcError::new(IpcErrorKind::NotFound, format!("'{path}' does not exist"))
            } else {
                IpcError::new(IpcErrorKind::Io, format!("reading {path}: {e}"))
            }
        })?
        .len();
    let needed = import_peak_estimate(file_len);
    let free = available_bytes();
    if needed > free {
        return Err(out_of_memory(needed, free, path, false));
    }

    on_progress("decoding");
    let (session_id, warnings) = match runner {
        ImportRunner::InProcess => import_in_process(data_dir, path, &ext)?,
        ImportRunner::Worker(exe) => {
            let mut cmd = std::process::Command::new(exe);
            cmd.arg(IMPORT_WORKER_FLAG).arg(data_dir).arg(&ext).arg(path);
            cmd.stdin(std::process::Stdio::null()).stderr(std::process::Stdio::null());
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
            }
            let out = cmd.output().map_err(|e| IpcError::new(IpcErrorKind::Io, format!("starting the import worker: {e}")))?;
            match parse_worker_output(&String::from_utf8_lossy(&out.stdout)) {
                Some(WorkerAnswer::Imported { session_id, warnings }) => (session_id, warnings),
                Some(WorkerAnswer::Failed { error }) => return Err(error),
                None => return Err(out_of_memory(needed, available_bytes(), path, true)),
            }
        }
    };

    on_progress("materializing");
    idl_library::catalog_read::rebuild_catalog_report(data_dir)?;
    let session = idl_library::catalog_read::list_sessions(data_dir)?
        .into_iter()
        .find(|s| s.session_id == session_id)
        .ok_or_else(|| {
            IpcError::new(IpcErrorKind::Internal, format!("session {session_id} missing from the catalog immediately after import"))
        })?;

    Ok(ImportOutcome { session: SessionSummary::from(session), warnings })
}

/// C3 §3.3 `import_file(path, importer_id, progress)`.
#[tauri::command(async)]
pub fn import_file(
    path: String,
    importer_id: Option<String>,
    progress: tauri::ipc::Channel<Progress>,
    data_dir: tauri::State<'_, DataDir>,
    cache: tauri::State<'_, crate::session_cache::SessionCache>,
) -> Result<ImportOutcome, IpcError> {
    // Desktop runs the import in a child, so running out of memory ends the
    // child with a message rather than the app; phones cannot start one.
    let runner = if cfg!(any(target_os = "android", target_os = "ios")) {
        ImportRunner::InProcess
    } else {
        std::env::current_exe().map(ImportRunner::Worker).unwrap_or(ImportRunner::InProcess)
    };
    let outcome = import_file_with(&runner, &data_dir.0, &path, importer_id.as_deref(), |phase| {
        let _ = progress.send(Progress { done: 0, total: None, phase: phase.to_string() });
    })?;
    // A re-import under an existing `session_id` rewrites that session's
    // `data.parquet`, so any channel decoded from the old one is stale
    // (ruling R203.2). Harmless on a first import — nothing is resident
    // under a session id that did not exist a moment ago.
    cache.invalidate_session(&outcome.session.session_id);
    Ok(outcome)
}

/// Memory the machine can still grant, bytes, less the headroom the app
/// keeps (`crate::memory`): what an import may use, measured now.
fn available_bytes() -> u64 {
    use crate::memory::MemoryProbe;
    let probe = crate::memory::SystemProbe;
    let headroom = crate::memory::headroom_for(probe.physical_bytes());
    probe.commit().available_commit_bytes.saturating_sub(headroom)
}

#[cfg(test)]
mod worker_tests {
    use super::*;

    #[test]
    fn parse_worker_output_an_answer_line_after_other_output_the_answer() {
        // Arrange
        let answer = WorkerAnswer::Imported { session_id: "s1".to_string(), warnings: vec!["FIFO overrun".to_string()] };
        let stdout = format!("some log line\n{}\n", serde_json::to_string(&answer).unwrap());

        // Act
        let parsed = parse_worker_output(&stdout);

        // Assert
        assert_eq!(parsed, Some(answer));
    }

    #[test]
    fn parse_worker_output_nothing_printed_none_the_worker_died() {
        // Arrange + Act + Assert
        assert_eq!(parse_worker_output(""), None);
        assert_eq!(parse_worker_output("memory allocation of 36966792 bytes failed\n"), None);
    }

    #[test]
    fn run_import_worker_wrong_arguments_a_typed_failure() {
        // Arrange + Act
        let answer = run_import_worker(&["only-one".to_string()]);

        // Assert
        assert!(matches!(answer, WorkerAnswer::Failed { error } if error.kind == IpcErrorKind::InvalidArgument));
    }

    #[test]
    fn out_of_memory_died_names_both_figures_and_that_the_log_is_kept() {
        // Arrange + Act
        let e = out_of_memory(2_170_000_000, 500_000_000, "x.idl1", true);

        // Assert
        assert_eq!(e.kind, IpcErrorKind::ResourceExhausted);
        assert!(e.message.contains("2.2 GB") && e.message.contains("0.5 GB") && e.message.contains("log is kept"), "{}", e.message);
        assert_eq!(e.detail.unwrap()["died"], true);
    }

    #[test]
    fn import_peak_estimate_the_271_mb_log_about_2_2_gb() {
        // Arrange + Act + Assert
        assert_eq!(import_peak_estimate(271_512_953), 2_172_103_624);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use idl_rs::parse::test_buffers::{frame, session_end, v3_registry_entry, Header};
    use uuid::Uuid;

    fn temp_root() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("idl1-bridge-import-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Writes `contents` to a fresh temp file named `name` and returns its
    /// path as a `String` (the shape `import_file`'s `path` argument takes).
    fn temp_file(name: &str, contents: &[u8]) -> String {
        let dir = std::env::temp_dir().join(format!("idl1-bridge-import-src-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(name);
        std::fs::write(&path, contents).unwrap();
        path.to_str().unwrap().to_string()
    }

    const GPX_TWO_POINTS: &str = r#"<gpx><trk><trkseg><trkpt lat="45.0" lon="-90.0"><time>2026-01-01T00:00:00Z</time></trkpt><trkpt lat="45.001" lon="-90.001"><time>2026-01-01T00:00:01Z</time></trkpt></trkseg></trk></gpx>"#;

    /// A minimal valid `.idl0` schema-3 buffer: one IMU axis, one sample of
    /// `axis_value`, then `SESSION_END` — same construction as
    /// `parse::mod`'s own `auto_detects_v3_and_applies_scaling` dispatch
    /// test. Two calls with different `axis_value`s share the same header
    /// (hence the same `session_id`, taken from the header's own UUID field
    /// — see `parse::v3`) but hash to different `blob_sha256`s, exercising
    /// [`idl_library::import::ImportPlan::Collision`].
    fn minimal_idl0_buffer(axis_value: i16) -> Vec<u8> {
        let accel_scale: f32 = 32.0 / 32768.0;
        let mut buf = Header { schema_version: 3, imu_mask: 0x01, ..Default::default() }
            .build(&[v3_registry_entry(0, 4, 800, accel_scale, 0.0, "IMU0_AccelX", "g")]);
        // IMU_SAMPLE payload: [imu_index:u8][ts_us:i64][axis i16 ...].
        let mut payload = vec![0u8];
        payload.extend_from_slice(&1_250_i64.to_le_bytes());
        payload.extend_from_slice(&axis_value.to_le_bytes());
        buf.extend(frame(0x01, &payload));
        buf.extend(session_end());
        buf
    }

    #[test]
    fn list_importers_via_includes_idl0_and_every_core_importer_with_dotted_extensions() {
        // Arrange
        let core_count = idl_rs::import::importers().len();

        // Act
        let out = list_importers_via();

        // Assert
        assert_eq!(out.len(), 2 + core_count);
        let idl0 = out.iter().find(|i| i.id == "idl0").unwrap();
        assert_eq!(idl0.extensions, vec![".idl0".to_string()]);
        let idl1 = out.iter().find(|i| i.id == "idl1").unwrap();
        assert_eq!(idl1.extensions, vec![".idl1".to_string()]);
        for info in out.iter().filter(|i| i.id != "idl0" && i.id != "idl1") {
            for ext in &info.extensions {
                assert!(ext.starts_with('.'), "extension {ext} was not dot-prefixed");
            }
        }
    }

    #[test]
    fn import_file_via_gpx_happy_path_returns_a_session_summary() {
        // Arrange
        let data_root = temp_root();
        let path = temp_file("track.gpx", GPX_TWO_POINTS.as_bytes());
        let mut phases = Vec::new();

        // Act
        let outcome = import_file_via(&data_root, &path, None, |p| phases.push(p.to_string())).unwrap();

        // Assert
        assert_eq!(outcome.session.source_format, "gpx");
        assert_eq!(phases, vec!["reading", "decoding", "materializing"]);
        let sessions = idl_library::catalog_read::list_sessions(&data_root).unwrap();
        assert_eq!(sessions.len(), 1);

        let _ = std::fs::remove_dir_all(&data_root);
    }

    #[test]
    fn import_file_via_forced_importer_id_ignores_the_actual_extension() {
        // Arrange — a GPX fixture saved with a `.txt` extension.
        let data_root = temp_root();
        let path = temp_file("track.txt", GPX_TWO_POINTS.as_bytes());

        // Act
        let outcome = import_file_via(&data_root, &path, Some("gpx"), |_| {}).unwrap();

        // Assert
        assert_eq!(outcome.session.source_format, "gpx");

        let _ = std::fs::remove_dir_all(&data_root);
    }

    #[test]
    fn import_file_via_unrecognised_importer_id_is_invalid_argument() {
        // Arrange — a path that would raise `NotFound` if validation ran
        // after the read, proving validation happens first.
        let data_root = temp_root();

        // Act
        let err = import_file_via(&data_root, "/nonexistent/x.xml", Some("xml"), |_| {}).unwrap_err();

        // Assert
        assert_eq!(err.kind, IpcErrorKind::InvalidArgument);

        let _ = std::fs::remove_dir_all(&data_root);
    }

    #[test]
    fn import_file_via_missing_path_is_not_found() {
        // Arrange
        let data_root = temp_root();

        // Act
        let err = import_file_via(&data_root, "/nonexistent/x.gpx", None, |_| {}).unwrap_err();

        // Assert
        assert_eq!(err.kind, IpcErrorKind::NotFound);

        let _ = std::fs::remove_dir_all(&data_root);
    }

    #[test]
    fn import_file_via_malformed_gpx_maps_to_import_gpx_malformed_xml() {
        // Arrange — `</gpx>` closes `<trk>` while it's still open; quick-xml's
        // `check_end_names` rejects this (same fixture as core's own
        // `gpx_importer_malformed_xml_returns_typed_error`).
        let data_root = temp_root();
        let path = temp_file("bad.gpx", b"<gpx><trk></gpx>");

        // Act
        let err = import_file_via(&data_root, &path, None, |_| {}).unwrap_err();

        // Assert
        assert_eq!(err.kind, IpcErrorKind::ImportGpxMalformedXml);

        let _ = std::fs::remove_dir_all(&data_root);
    }

    #[test]
    fn import_file_via_idl0_source_routes_to_import_idl0_not_import_file() {
        // Arrange — core's own `import_file` refuses the extension "idl0"
        // (L2-R13); this proves the idl0 branch is actually taken instead.
        let data_root = temp_root();
        let path = temp_file("session.idl0", &minimal_idl0_buffer(16_384));
        let mut phases = Vec::new();

        // Act
        let outcome = import_file_via(&data_root, &path, None, |p| phases.push(p.to_string())).unwrap();

        // Assert
        assert_eq!(outcome.session.source_format, "idl0");
        assert_eq!(phases, vec!["reading", "decoding", "materializing"]);

        let _ = std::fs::remove_dir_all(&data_root);
    }

    #[test]
    fn import_file_via_bad_magic_idl0_maps_to_parse_invalid_magic_bytes() {
        // Arrange
        let data_root = temp_root();
        let path = temp_file("bad.idl0", b"NOPE not an idl0 file at all, but long enough");

        // Act
        let err = import_file_via(&data_root, &path, None, |_| {}).unwrap_err();

        // Assert
        assert_eq!(err.kind, IpcErrorKind::ParseInvalidMagicBytes);

        let _ = std::fs::remove_dir_all(&data_root);
    }

    #[test]
    fn import_file_via_unrecognised_extension_with_no_forced_id_is_invalid_argument() {
        // Arrange — `UnknownExtension` (core's own registry has no `.xyz`
        // importer) maps to the cross-cutting `InvalidArgument`, not a new
        // `IpcErrorKind` (L2's own brief-task6 anticipated this mapping).
        let data_root = temp_root();
        let path = temp_file("mystery.xyz", b"anything");

        // Act
        let err = import_file_via(&data_root, &path, None, |_| {}).unwrap_err();

        // Assert
        assert_eq!(err.kind, IpcErrorKind::InvalidArgument);

        let _ = std::fs::remove_dir_all(&data_root);
    }

    #[test]
    fn import_file_via_collision_maps_to_import_collision() {
        // Arrange — for `.idl0`, `session_id` comes from the header's own
        // 16-byte UUID field (`parse::v3`), not the blob hash — so two
        // buffers sharing one header but differing only in their sample data
        // share a `session_id` while hashing to different `blob_sha256`s,
        // the real-world condition this error exists for (C4 §3: a
        // truncated download and the full file share the device UUID).
        let data_root = temp_root();
        let path1 = temp_file("s1.idl0", &minimal_idl0_buffer(16_384));
        import_file_via(&data_root, &path1, None, |_| {}).unwrap();

        let path2 = temp_file("s1.idl0", &minimal_idl0_buffer(16_385));

        // Act
        let err = import_file_via(&data_root, &path2, None, |_| {}).unwrap_err();

        // Assert
        assert_eq!(err.kind, IpcErrorKind::ImportCollision);

        let _ = std::fs::remove_dir_all(&data_root);
    }
}
