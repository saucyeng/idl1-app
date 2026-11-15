//! Prepared readout commands (C3 §3.7.1, video overlay spec §7b):
//! `open_readout` resolves names once, `read_readout` reads them per frame,
//! `close_readout` releases them. The store and the read rule live in
//! [`crate::readout`]; this module resolves names to resident arrays.
//!
//! Same idiom as `commands/cursor.rs`: each `#[tauri::command]` is a thin
//! wrapper over a `_via` function the tests call.

use std::path::Path;
use std::sync::Arc;

use idl_rs::math::units::UnitLabel;
use idl_rs::workbook::v3::AxisKind;

use crate::error::{IpcError, IpcErrorKind};
use crate::readout::{ReadoutHandle, ReadoutSource, ReadoutStore, ReadoutValues, TailRequest};
use crate::session_cache::SessionCache;
use crate::session_source::{session_dir, WindowDto};

/// A name that resolves to no time series: `invalid_argument` with `detail.name`.
fn not_a_series(name: &str, why: &str) -> IpcError {
    IpcError::with_detail(IpcErrorKind::InvalidArgument, format!("'{name}' {why}"), serde_json::json!({ "name": name }))
}

/// Resolves `name` the way `channel(name)` does (C2 §5.1): a `math`
/// definition of the workbook, else a channel of the window's session.
fn resolve(cache: &SessionCache, data_dir: &Path, workbook_id: &str, window: &WindowDto, name: &str) -> Result<ReadoutSource, IpcError> {
    if let Some(view) = crate::commands::workbook::definition_view_via(cache, data_dir, workbook_id, Some(window), name)? {
        if view.axis != AxisKind::Time || view.t_len() == 0 {
            return Err(not_a_series(name, "has no time axis (a scalar, or a lap or frequency axis)"));
        }
        let unit = match &view.unit {
            UnitLabel::Known { text } => Some(text.clone()),
            UnitLabel::Dimensionless | UnitLabel::Unknown { .. } => None,
        };
        return Ok(ReadoutSource { t_us: view.t_us.clone(), v: view.v.clone(), unit });
    }
    let dir = session_dir(data_dir, &window.session_id);
    let channel = cache.channel(&dir, &window.session_id, name).map_err(|e| {
        if e.kind == IpcErrorKind::NotFound {
            not_a_series(name, "is neither a definition of this workbook nor a channel of this session")
        } else {
            e
        }
    })?;
    let unit = if channel.unit.is_empty() { None } else { Some(channel.unit.clone()) };
    Ok(ReadoutSource { t_us: channel.t_us.clone(), v: Arc::from(channel.materialize()), unit })
}

/// Core of `open_readout` (C3 §3.7.1): resolves every name in `names` or
/// none (the first that fails rejects the call), then stores them.
///
/// # Errors
/// `not_found` for an unknown workbook or session; `invalid_argument` with
/// `detail.name` for a name that resolves to nothing or to no time series;
/// the workbook's parse kinds, a definition's own `math_*` failure, `io`,
/// `internal`.
pub fn open_readout_via(
    cache: &SessionCache,
    store: &ReadoutStore,
    data_dir: &Path,
    workbook_id: &str,
    window: &WindowDto,
    names: &[String],
) -> Result<ReadoutHandle, IpcError> {
    if !session_dir(data_dir, &window.session_id).join("data.parquet").exists() {
        return Err(IpcError::new(IpcErrorKind::NotFound, format!("session '{}' not found", window.session_id)));
    }
    let mut sources = Vec::with_capacity(names.len());
    for name in names {
        sources.push((name.clone(), resolve(cache, data_dir, workbook_id, window, name)?));
    }
    Ok(store.open(sources))
}

/// C3 §3.7.1 `open_readout(workbook_id, window, names)`. Called on settle
/// (names, primary window or evaluation changed), never per frame.
#[tauri::command(async)]
pub fn open_readout(
    workbook_id: String,
    window: WindowDto,
    names: Vec<String>,
    data_dir: tauri::State<'_, crate::state::DataDir>,
    cache: tauri::State<'_, SessionCache>,
    store: tauri::State<'_, ReadoutStore>,
) -> Result<ReadoutHandle, IpcError> {
    open_readout_via(&cache, &store, &data_dir.0, &workbook_id, &window, &names)
}

/// C3 §3.7.1 `read_readout(handle, t_us, tail?)`. Per frame while playing,
/// under "nothing on the interaction path waits on IPC": the notebook never
/// awaits it in a draw and keeps one call in flight, newest wins.
#[tauri::command(async)]
pub fn read_readout(
    handle: u32,
    t_us: i64,
    tail: Option<TailRequest>,
    store: tauri::State<'_, ReadoutStore>,
) -> Result<ReadoutValues, IpcError> {
    store.read(handle, t_us, tail)
}

/// C3 §3.7.1 `close_readout(handle)`. Closing an unknown handle is not an error.
#[tauri::command(async)]
pub fn close_readout(handle: u32, store: tauri::State<'_, ReadoutStore>) {
    store.close(handle);
}
