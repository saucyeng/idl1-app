//! Prepared readouts (C3 §3.7.1, video overlay spec §7b): the arrays a
//! notebook's readouts read, resolved once by `open_readout` and read per
//! frame by `read_readout`. No file read, parse or evaluation happens on a
//! read: each source is an `Arc` pair already resident (a session column or a
//! kept evaluation's buffers), and holding it here keeps it alive.
//!
//! The per-sample rule is C3 §3.7's, from [`crate::cursor::cursor_readout`]:
//! nearest recorded sample, a tie to the earlier, `None` outside the span.

use std::collections::{BTreeMap, HashMap};
use std::sync::{Arc, Mutex};

use crate::error::{IpcError, IpcErrorKind};

/// The most handles kept open at once (C3 §3.7.1); opening one more closes
/// the oldest, so a reloaded webview cannot leak them.
pub const MAX_OPEN_READOUTS: usize = 16;

/// The most tail points one read may ask for (C3 §3.7.1).
pub const MAX_TAIL_COUNT: u32 = 1024;

/// One resolved name: its recorded time axis (µs on the window's session
/// clock) and values, and its display unit.
#[derive(Debug, Clone)]
pub struct ReadoutSource {
    /// Per-sample time, µs, strictly increasing.
    pub t_us: Arc<[i64]>,
    /// Per-sample value, in `unit`.
    pub v: Arc<[f64]>,
    /// Unit label, `None` when unknown or dimensionless.
    pub unit: Option<String>,
}

impl ReadoutSource {
    /// Exact `[min, max]` over every finite sample, `None` with none.
    pub fn extent(&self) -> Option<[f64; 2]> {
        let n = self.t_us.len().min(self.v.len());
        let mut out: Option<[f64; 2]> = None;
        for &x in self.v[..n].iter().filter(|x| x.is_finite()) {
            out = Some(match out {
                None => [x, x],
                Some([lo, hi]) => [lo.min(x), hi.max(x)],
            });
        }
        out
    }

    /// The nearest recorded sample at `t_us` (C3 §3.7's rule).
    fn at(&self, name: &str, t_us: i64) -> Option<f64> {
        let triple = [(name, &self.t_us[..], &self.v[..])];
        crate::cursor::cursor_readout(&triple, t_us).pop().and_then(|(_, v)| v)
    }
}

/// `open_readout`'s return (C3 §3.7.1).
#[derive(Debug, Clone, serde::Serialize)]
pub struct ReadoutHandle {
    /// Opaque, valid until closed or replaced.
    pub handle: u32,
    /// name -> unit label, `null` when unknown.
    pub units: HashMap<String, Option<String>>,
    /// name -> exact `[min, max]` over the window, `null` with no finite sample.
    pub extent: HashMap<String, Option<[f64; 2]>>,
}

/// `read_readout`'s optional tail request (C3 §3.7.1).
#[derive(Debug, Clone, Copy, serde::Deserialize)]
pub struct TailRequest {
    /// Points back from the cursor, `1..=MAX_TAIL_COUNT`.
    pub count: u32,
    /// Spacing, µs, `> 0` (one video frame).
    pub step_us: i64,
}

/// `read_readout`'s return (C3 §3.7.1).
#[derive(Debug, Clone, serde::Serialize, PartialEq)]
pub struct ReadoutValues {
    /// Echoes the request, µs.
    pub t_us: i64,
    /// name -> nearest recorded sample at `t_us`.
    pub values: HashMap<String, Option<f64>>,
    /// name -> `[k-1]` is the sample at `t_us - k * step_us`, present only when asked for.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tail: Option<HashMap<String, Vec<Option<f64>>>>,
}

/// The open handles, oldest first by id (ids only grow).
#[derive(Debug, Default)]
pub struct ReadoutStore {
    inner: Mutex<StoreInner>,
}

#[derive(Debug, Default)]
struct StoreInner {
    next: u32,
    open: BTreeMap<u32, Arc<Vec<(String, ReadoutSource)>>>,
}

impl ReadoutStore {
    /// Stores `sources` (in request order) under a new handle, closing the
    /// oldest when [`MAX_OPEN_READOUTS`] are already open.
    pub fn open(&self, sources: Vec<(String, ReadoutSource)>) -> ReadoutHandle {
        let units = sources.iter().map(|(n, s)| (n.clone(), s.unit.clone())).collect();
        let extent = sources.iter().map(|(n, s)| (n.clone(), s.extent())).collect();
        let mut inner = self.inner.lock().unwrap_or_else(|p| p.into_inner());
        while inner.open.len() >= MAX_OPEN_READOUTS {
            let oldest = *inner.open.keys().next().expect("non-empty");
            inner.open.remove(&oldest);
        }
        inner.next = inner.next.wrapping_add(1);
        let handle = inner.next;
        inner.open.insert(handle, Arc::new(sources));
        ReadoutHandle { handle, units, extent }
    }

    /// Reads every name of `handle` at `t_us`, with the tail when asked.
    ///
    /// # Errors
    /// [`IpcErrorKind::NotFound`] for a closed or replaced handle;
    /// [`IpcErrorKind::InvalidArgument`] for a tail `count` outside
    /// `1..=MAX_TAIL_COUNT` or a `step_us` that is not positive.
    pub fn read(&self, handle: u32, t_us: i64, tail: Option<TailRequest>) -> Result<ReadoutValues, IpcError> {
        if let Some(t) = tail {
            if !(1..=MAX_TAIL_COUNT).contains(&t.count) || t.step_us <= 0 {
                return Err(IpcError::with_detail(
                    IpcErrorKind::InvalidArgument,
                    format!("tail needs count in 1..={MAX_TAIL_COUNT} and step_us > 0, got {} and {}", t.count, t.step_us),
                    serde_json::json!({ "count": t.count, "step_us": t.step_us }),
                ));
            }
        }
        // Clone the Arc out so the lock is not held while reading.
        let sources = {
            let inner = self.inner.lock().unwrap_or_else(|p| p.into_inner());
            inner.open.get(&handle).cloned()
        }
        .ok_or_else(|| IpcError::new(IpcErrorKind::NotFound, format!("readout handle {handle} is not open")))?;

        let values = sources.iter().map(|(n, s)| (n.clone(), s.at(n, t_us))).collect();
        let tail = tail.map(|t| {
            sources
                .iter()
                .map(|(n, s)| {
                    let points = (1..=i64::from(t.count))
                        .map(|k| s.at(n, t_us.saturating_sub(k.saturating_mul(t.step_us))))
                        .collect();
                    (n.clone(), points)
                })
                .collect()
        });
        Ok(ReadoutValues { t_us, values, tail })
    }

    /// Releases `handle`; an unknown handle is not an error.
    pub fn close(&self, handle: u32) {
        let mut inner = self.inner.lock().unwrap_or_else(|p| p.into_inner());
        inner.open.remove(&handle);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn src(t: &[i64], v: &[f64]) -> ReadoutSource {
        ReadoutSource { t_us: Arc::from(t), v: Arc::from(v), unit: Some("km/h".into()) }
    }

    #[test]
    fn read_at_a_recorded_sample_returns_it() {
        // Arrange
        let store = ReadoutStore::default();
        let h = store.open(vec![("speed".into(), src(&[0, 1_000_000, 2_000_000], &[10.0, 20.0, 30.0]))]);

        // Act
        let out = store.read(h.handle, 1_000_000, None).unwrap();

        // Assert
        assert_eq!(out.values["speed"], Some(20.0));
        assert!(out.tail.is_none());
    }

    #[test]
    fn read_outside_the_span_is_none() {
        // Arrange
        let store = ReadoutStore::default();
        let h = store.open(vec![("hr".into(), src(&[1_000_000, 2_000_000], &[100.0, 110.0]))]);

        // Act
        let out = store.read(h.handle, 3_000_000, None).unwrap();

        // Assert
        assert_eq!(out.values["hr"], None);
    }

    #[test]
    fn read_tail_steps_back_by_step_us_newest_first() {
        // Arrange
        let t: Vec<i64> = (0..10).map(|i| i * 100_000).collect();
        let v: Vec<f64> = (0..10).map(f64::from).collect();
        let store = ReadoutStore::default();
        let h = store.open(vec![("ax".into(), src(&t, &v))]);

        // Act
        let out = store.read(h.handle, 900_000, Some(TailRequest { count: 3, step_us: 200_000 })).unwrap();

        // Assert
        assert_eq!(out.tail.unwrap()["ax"], vec![Some(7.0), Some(5.0), Some(3.0)]);
    }

    #[test]
    fn read_tail_reaching_before_the_span_is_none_there() {
        // Arrange
        let store = ReadoutStore::default();
        let h = store.open(vec![("ax".into(), src(&[0, 100_000], &[1.0, 2.0]))]);

        // Act
        let out = store.read(h.handle, 100_000, Some(TailRequest { count: 2, step_us: 100_000 })).unwrap();

        // Assert
        assert_eq!(out.tail.unwrap()["ax"], vec![Some(1.0), None]);
    }

    #[test]
    fn read_tail_count_out_of_range_is_invalid_argument() {
        // Arrange
        let store = ReadoutStore::default();
        let h = store.open(vec![("ax".into(), src(&[0], &[1.0]))]);

        // Act
        let err = store.read(h.handle, 0, Some(TailRequest { count: 0, step_us: 1 })).unwrap_err();

        // Assert
        assert_eq!(err.kind, IpcErrorKind::InvalidArgument);
    }

    #[test]
    fn read_closed_handle_is_not_found() {
        // Arrange
        let store = ReadoutStore::default();
        let h = store.open(vec![("ax".into(), src(&[0], &[1.0]))]);
        store.close(h.handle);

        // Act
        let err = store.read(h.handle, 0, None).unwrap_err();

        // Assert
        assert_eq!(err.kind, IpcErrorKind::NotFound);
    }

    #[test]
    fn open_past_the_cap_closes_the_oldest() {
        // Arrange
        let store = ReadoutStore::default();
        let first = store.open(vec![]);
        for _ in 0..MAX_OPEN_READOUTS {
            store.open(vec![]);
        }

        // Act
        let err = store.read(first.handle, 0, None).unwrap_err();

        // Assert
        assert_eq!(err.kind, IpcErrorKind::NotFound);
    }

    #[test]
    fn open_reports_unit_and_exact_extent_skipping_non_finite() {
        // Arrange
        let store = ReadoutStore::default();

        // Act
        let h = store.open(vec![("speed".into(), src(&[0, 1, 2, 3], &[5.0, f64::NAN, -2.0, 40.0]))]);

        // Assert
        assert_eq!(h.units["speed"].as_deref(), Some("km/h"));
        assert_eq!(h.extent["speed"], Some([-2.0, 40.0]));
    }

    #[test]
    fn open_extent_with_no_finite_sample_is_none() {
        // Arrange
        let store = ReadoutStore::default();

        // Act
        let h = store.open(vec![("x".into(), src(&[0], &[f64::NAN]))]);

        // Assert
        assert_eq!(h.extent["x"], None);
    }
}
