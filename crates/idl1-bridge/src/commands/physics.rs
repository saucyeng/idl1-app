//! C3 §3.16 `solve_physics` / `cancel_solve_physics`: the physics solver over
//! a stretch of a ride, from the app (2026-11-23). The outputs land in the
//! ride's derived files and read back as plain channels
//! (`idl_library::estimated`), so a workbook re-evaluated after a solve sees
//! them. One solve at a time; the webview never waits on it (R201).

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use idl_library::physics::{estimate_physics_with, PhysicsError, PhysicsErrorKind, PhysicsOptions, SolveProgress};

use crate::commands::device::Progress;
use crate::error::{IpcError, IpcErrorKind};
use crate::state::DataDir;

/// The running solve's cancel flag, `None` when none is running. Managed
/// state: one solve at a time, machine-wide (each one wants every core).
#[derive(Default)]
pub struct PhysicsSolves(pub Mutex<Option<Arc<AtomicBool>>>);

/// `solve_physics`'s return.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct SolveSummary {
    /// The ride.
    pub session_id: String,
    /// Seconds of riding solved, s.
    pub solved_s: f64,
    /// Solve windows planned.
    pub windows: usize,
    /// Of those, how many failed (their stretch stays unsolved).
    pub failed_windows: usize,
    /// Median front travel over the solved samples, mm.
    pub front_median_mm: f64,
    /// Median rear travel over the solved samples, mm.
    pub rear_median_mm: f64,
    /// Whether this solve also fitted the bike's geometry (a first solve).
    pub fitted_geometry: bool,
    /// Wall time, s.
    pub seconds: f64,
}

/// The solver's typed failure as the C3 error shape.
fn solve_error(e: PhysicsError) -> IpcError {
    let kind = match e.kind {
        PhysicsErrorKind::NotFound => IpcErrorKind::NotFound,
        PhysicsErrorKind::NotCalibrated | PhysicsErrorKind::Unusable => IpcErrorKind::InvalidArgument,
        PhysicsErrorKind::Io => IpcErrorKind::Io,
        PhysicsErrorKind::Solve | PhysicsErrorKind::Cancelled => IpcErrorKind::Internal,
    };
    let cancelled = e.kind == PhysicsErrorKind::Cancelled;
    IpcError::with_detail(kind, e.message, serde_json::json!({ "cancelled": cancelled }))
}

/// Transport-agnostic core of `solve_physics`: solves `session_id` from
/// `from_us` to `to_us` (µs since its first sample), telling `on_window`
/// (windows done, windows planned) as it goes and stopping when `cancel` is
/// set. A first solve of a bike fits its geometry from the whole ride first.
pub fn solve_physics_via(
    data_dir: &Path,
    session_id: &str,
    from_us: i64,
    to_us: i64,
    cancel: &AtomicBool,
    on_window: &(dyn Fn(usize, usize) + Sync),
) -> Result<SolveSummary, IpcError> {
    if !(from_us >= 0 && from_us < to_us) {
        return Err(IpcError::new(IpcErrorKind::InvalidArgument, format!("solve span {from_us}..{to_us} µs is empty or before the ride")));
    }
    let opts = PhysicsOptions { span_ms: Some((from_us / 1000, (to_us + 999) / 1000)), fit_whole_session: true, ..PhysicsOptions::default() };
    let progress = SolveProgress { on_window, cancel };
    let report = estimate_physics_with(data_dir, session_id, &opts, Some(&progress)).map_err(solve_error)?;
    Ok(SolveSummary {
        session_id: report.session_id,
        solved_s: report.solved_s,
        windows: report.windows.0,
        failed_windows: report.windows.1,
        front_median_mm: report.travel[0].median,
        rear_median_mm: report.travel[1].median,
        fitted_geometry: report.new_fit.is_some(),
        seconds: report.seconds,
    })
}

/// C3 §3.16 `solve_physics(session_id, from_us, to_us, progress)`: solves a
/// stretch of a ride (a lap, a selected range). `progress` hears phase
/// `"solving"` with windows done of planned. Refused with `Conflict` while
/// another solve runs; `cancel_solve_physics` stops it (`Internal`,
/// `detail.cancelled: true`, nothing written).
#[tauri::command(async)]
pub fn solve_physics(
    session_id: String,
    from_us: i64,
    to_us: i64,
    progress: tauri::ipc::Channel<Progress>,
    solves: tauri::State<'_, PhysicsSolves>,
    data_dir: tauri::State<'_, DataDir>,
) -> Result<SolveSummary, IpcError> {
    let flag = Arc::new(AtomicBool::new(false));
    {
        let mut running = solves.0.lock().unwrap();
        if running.is_some() {
            return Err(IpcError::new(IpcErrorKind::Conflict, "a physics solve is already running"));
        }
        *running = Some(flag.clone());
    }
    let _ = progress.send(Progress { done: 0, total: None, phase: "solving".to_string() });
    let on_window = |done: usize, total: usize| {
        let _ = progress.send(Progress { done: done as u64, total: Some(total as u64), phase: "solving".to_string() });
    };
    let result = solve_physics_via(&data_dir.0, &session_id, from_us, to_us, &flag, &on_window);
    *solves.0.lock().unwrap() = None;
    result
}

/// C3 §3.16 `cancel_solve_physics()`: asks the running solve to stop after
/// the windows already under way. `true` when one was running.
#[tauri::command]
pub fn cancel_solve_physics(solves: tauri::State<'_, PhysicsSolves>) -> bool {
    match solves.0.lock().unwrap().as_ref() {
        Some(flag) => {
            flag.store(true, Ordering::Relaxed);
            true
        }
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn solve_physics_via_empty_span_invalid_argument_before_any_work() {
        // Arrange
        let root = std::env::temp_dir().join(format!("idl1-solve-{}", std::process::id()));
        let cancel = AtomicBool::new(false);

        // Act
        let result = solve_physics_via(&root, "s1", 5_000_000, 5_000_000, &cancel, &|_, _| {});

        // Assert
        assert_eq!(result.unwrap_err().kind, IpcErrorKind::InvalidArgument);
    }

    #[test]
    fn solve_physics_via_unknown_session_not_found() {
        // Arrange
        let root = std::env::temp_dir().join(format!("idl1-solve-missing-{}", std::process::id()));
        let cancel = AtomicBool::new(false);

        // Act
        let result = solve_physics_via(&root, "nope", 0, 1_000_000, &cancel, &|_, _| {});

        // Assert
        assert_eq!(result.unwrap_err().kind, IpcErrorKind::NotFound);
    }

    #[test]
    fn solve_error_cancelled_carries_the_cancelled_detail() {
        // Arrange
        let e = PhysicsError { kind: PhysicsErrorKind::Cancelled, message: "stopped".to_string() };

        // Act
        let ipc = solve_error(e);

        // Assert
        assert_eq!(ipc.detail.unwrap()["cancelled"], true);
    }
}
