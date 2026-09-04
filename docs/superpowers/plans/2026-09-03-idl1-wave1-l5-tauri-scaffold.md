# idl1 Wave 1 — L5: Tauri Scaffold Hardening

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the M0 Tauri scaffold into the real glue layer C3 specifies: every
`#[tauri::command]` C3 defines, wired to its owning lane's logic; the typed
`IpcError` shape; the `<data>` directory bootstrap (C4 §1); the workbook file
watcher with self-write suppression (C4 §4); a routing/state skeleton for
`app/src`; and the C3 §1 `app/src/ipc/` module layer, fully typed against the
signed contract. Wave 1's other lanes (L1–L4) supply the logic; L5 supplies
every wire between it and the screen.

**Architecture:** Two repos change together, exactly like M0 Task 5:
`idl-rs-tauri` (`rust/tauri/`, the submodule) grows an `error` module (the C3
§2 `IpcError`/`IpcErrorKind` shape, extended incrementally as each lane's
error enum lands), a `paths` module (C4 §1 `<data>` resolution), a `watcher`
module (C4 §4 file-watch plumbing), a `state` module (Tauri-managed shared
state), and one command per C3 §3 group, gated on that group's owning lane.
`app/src-tauri` wires `.setup()` to resolve `<data>` and register it as
managed state. `app/src` grows `src/ipc/*.ts` (C3 §1, one module per command
group, the only files allowed to import `@tauri-apps/api/core`), `src/routes/`
(a routing skeleton) and `src/state/` (app-shell state).

**Tech Stack:** Rust 2021, Tauri v2 (`2.11.5`), `notify` `8.2.0`,
`serde`/`serde_json`/`thiserror` at the M0 ecosystem report's pins. React 19 +
TypeScript + Vite + vitest, all at the M0 ecosystem report's pins — **no new
npm dependency is added by this plan** (routing and state management are
built on React's own APIs; see §"Open questions" for why).

**Spec:** `docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md` (design,
read in full; §6 interaction rules, §7 file watcher, §10 L5 row are load-
bearing), `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md` (C3, the
primary contract — every task below implements or scaffolds part of it),
`docs/superpowers/specs/2026-09-03-idl1-c4-data-directory.md` §1/§4 (C4, data
directory and watcher scope), `docs/superpowers/specs/2026-09-02-idl1-m0-
ecosystem.md` (version pins), `CLAUDE.md` (standing orders), `CONTRIBUTING.md`
(state management is explicitly an L5/L6 decision, recorded here).

**Spec discipline:** spec-during (CLAUDE.md §6). Task 6 rewrites
`docs/IDL0_SPEC.md` §11 (App Architecture) in the same PR as the code it
documents. This section currently describes idl0's Flutter/Dart layering and
is stale (CLAUDE.md's own framing). **L5's rewrite is a first draft, not the
final word**: L10's plan does a cross-lane consistency pass over §11 once
L1–L4/L6/L7 have also landed, since those lanes' own SPEC sections may name
details (e.g. exact catalog module paths) that only exist after they merge.
Every other task below is "no spec change needed" — it implements C3/C4,
which already are the spec for this lane.

## Global Constraints

- **Two repos, two worktrees**, exactly like M0 Task 5 but in **isolated worktrees, never the
  shared checkouts** (L4's Task 1 checked out its branch directly in the shared `rust/` checkout
  instead of a separate worktree, corrected post-hoc — see `runs/2026-09-03/decisions.md`; do not
  repeat that here). Setup, before Task 1's first step:
  ```bash
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app/rust"
  git worktree add -b wave1-l5-tauri "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l5-tauri" main
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
  git worktree add -b wave1-l5-tauri "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave1-l5-tauri" main
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave1-l5-tauri"
  git submodule update --init -- rust
  git -C rust remote add local-wave1 "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l5-tauri"
  git -C rust fetch local-wave1 wave1-l5-tauri
  git -C rust checkout -B wave1-l5-tauri FETCH_HEAD
  ```
  Working directories for every task below: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l5-tauri`
  (every `rust/tauri` change) and `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave1-l5-tauri`
  (every `app/` change). A task that touches both repos ends with **two separate commits**, one
  per repo, in that order (rust worktree first, then the app worktree, matching M0 Task 5 Step 7)
  — never one commit spanning both.
- **Branch:** `wave1-l5-tauri`, created in both worktrees by the setup above, before Task 1's
  first step.
- **idl-rs is not rustfmt-formatted.** Never run `cargo fmt` on anything under `rust/`. Match surrounding style by hand. This does **not** apply to `app/`'s TypeScript — Prettier/ESLint use there is the implementer's call; this plan does not mandate either (no formatter is configured in `app/package.json` today, and adding one is out of this plan's scope — an implementer may add Prettier with default config if it speeds review, but is not required to).
- **No AI attribution trailers** in any commit. **Never `git push`** — Isaac pushes.
- Every `#[tauri::command]` returns `Result<T, IpcError>` (or `Result<tauri::ipc::Response, IpcError>` for binary commands) per C3 §2 — never `Err(String)`, never a bare panic on bad *input* data. (Setup-time failures before any window exists are a narrower case — see Task 2's own note; not every panic in the whole crate is retroactively forbidden, only the command-boundary contract C3 fixes.)
- Doc comment on every public symbol; units on every numeric value; `// TODO(idl0):` never bare `// TODO`.
- TDD: Arrange/Act/Assert with blank lines between; Rust tests inline `#[cfg(test)]`; TypeScript tests beside the module as `*.test.ts` (vitest); test names `thing — condition — result`.
- Every task ends with a **CHANGELOG.md** step (a bullet under `[Unreleased]`); **TASKS.md**'s `- [ ] L5 Tauri scaffold hardening` line is ticked only by the last task (Task 15), once the lane's done-criteria both hold.
- Lanes touch only their own crate/directory (CLAUDE.md §7). This plan's Group B tasks call into functions other lanes export — it never reimplements their logic, and it never edits `rust/core/` or `rust/transport/` source.
- **Command naming, transport-per-payload-shape, JSON snake_case fields**: exactly C3 §1 — not restated per task below, assumed read.

---

## Group A — no dependency, start immediately, parallel with L1–L4

Tasks 1–7. Nothing here calls into another lane's code. Task order matters
only where a later Group A task uses an earlier one's output (noted per task).

### Task 1: `IpcError` — the C3 §2 error shape

**Files:**
- Create: `rust/tauri/src/error.rs`
- Modify: `rust/tauri/src/lib.rs` (add `pub mod error; pub use error::{IpcError, IpcErrorKind};`), `rust/tauri/Cargo.toml` (add `serde_json` dependency)

**Interfaces:**
- Produces: `IpcError { kind: IpcErrorKind, message: String, detail: Option<serde_json::Value> }`, `#[derive(Serialize)]`, `#[serde(rename_all = "snake_case")]` on `IpcErrorKind`; `impl From<idl_transport::TransportError> for IpcError`. Every Group B task adds that group's own prefixed variants (`parse_*`, `math_*`, `config_*`) and a `From<CoreEnum>` impl when it lands — this task seeds only the variants nothing else gates on: the four cross-cutting kinds and the four `TransportErrorKind`-sourced ones (transport already exists, M0 Task 2).

- [ ] **Step 1: Write the failing test**

`rust/tauri/src/error.rs`:
```rust
//! The single typed error every `idl-rs-tauri` command returns (C3 §2).
//! `IpcErrorKind` grows additively as each lane's core error enum lands
//! (C3 §5, "IpcError.kind values are additive-only") — this file seeds the
//! four cross-cutting kinds and the four kinds sourced from
//! `idl_transport::TransportErrorKind` (already shipped, M0 Task 2); L1–L4
//! each add their own prefixed variants (`parse_*`, `math_*`, `config_*`,
//! `export_*`) in their own Group B task here, never editing another lane's
//! variant.

/// Machine-readable failure class. Frontend code routes on the serialized
/// string, never on `IpcError::message`. Variants are additive-only once
/// shipped (C3 §5) — never renamed or removed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum IpcErrorKind {
    /// `TransportErrorKind::Ble` — device: `ble_scan`, `ble_connect`, `list_device_files`, `download_file`, `push_config`.
    Ble,
    /// `TransportErrorKind::Wifi` — device: `list_device_files`, `download_file`, `push_config`.
    Wifi,
    /// `TransportErrorKind::Config` — device rejected or malformed a pushed config over the wire.
    Config,
    /// `TransportErrorKind::Sync` — LAN sync (L11, wave 2; no command uses this kind yet).
    Sync,
    /// Cross-cutting: the named entity (session, workbook, channel, peer…) does not exist.
    NotFound,
    /// Cross-cutting: a caller-supplied argument fails local validation.
    InvalidArgument,
    /// Cross-cutting: a filesystem read/write failed. Folds every core `Io(...)` variant (C3 §2 folding rule).
    Io,
    /// Cross-cutting: an unexpected/programmer-error condition, not the caller's fault. Folds `ExportError::Json`.
    Internal,
}

/// One JSON error crossing every fallible command (C3 §2). `detail`'s shape
/// depends on `kind`; absent when there is nothing structured to add.
#[derive(Debug, Clone, serde::Serialize)]
pub struct IpcError {
    pub kind: IpcErrorKind,
    /// Human-readable text. No stack traces (CLAUDE.md §5).
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<serde_json::Value>,
}

impl IpcError {
    /// Builds an `IpcError` with no structured detail.
    pub fn new(kind: IpcErrorKind, message: impl Into<String>) -> Self {
        Self { kind, message: message.into(), detail: None }
    }

    /// Builds an `IpcError` carrying structured `detail`.
    pub fn with_detail(kind: IpcErrorKind, message: impl Into<String>, detail: serde_json::Value) -> Self {
        Self { kind, message: message.into(), detail: Some(detail) }
    }
}

impl From<idl_transport::TransportError> for IpcError {
    fn from(e: idl_transport::TransportError) -> Self {
        let kind = match e.kind {
            idl_transport::TransportErrorKind::Ble => IpcErrorKind::Ble,
            idl_transport::TransportErrorKind::Wifi => IpcErrorKind::Wifi,
            idl_transport::TransportErrorKind::Config => IpcErrorKind::Config,
            idl_transport::TransportErrorKind::Sync => IpcErrorKind::Sync,
        };
        IpcError::new(kind, e.message)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ipc_error_kind_serialises_snake_case_matching_c3() {
        // Arrange
        let err = IpcError::new(IpcErrorKind::NotFound, "no such session");

        // Act
        let json = serde_json::to_string(&err).unwrap();

        // Assert
        assert_eq!(json, r#"{"kind":"not_found","message":"no such session"}"#);
    }

    #[test]
    fn ipc_error_with_detail_serialises_the_detail_object() {
        // Arrange
        let err = IpcError::with_detail(
            IpcErrorKind::InvalidArgument,
            "unknown channel",
            serde_json::json!({ "channel": "fork_travel" }),
        );

        // Act
        let json = serde_json::to_string(&err).unwrap();

        // Assert
        assert_eq!(
            json,
            r#"{"kind":"invalid_argument","message":"unknown channel","detail":{"channel":"fork_travel"}}"#
        );
    }

    #[test]
    fn transport_error_converts_kind_preserving_message() {
        // Arrange
        let te = idl_transport::TransportError::new(idl_transport::TransportErrorKind::Wifi, "timeout");

        // Act
        let ie: IpcError = te.into();

        // Assert
        assert_eq!(ie.kind, IpcErrorKind::Wifi);
        assert_eq!(ie.message, "timeout");
    }
}
```

- [ ] **Step 2: Wire the module and dependency**

`rust/tauri/Cargo.toml` — add under `[dependencies]`: `serde_json = "1.0.151"` (pin from the ecosystem report). Add under `[dev-dependencies]`: nothing new (tests use `serde_json` directly, already a normal dependency here since `IpcError` carries a `serde_json::Value`).

`rust/tauri/src/lib.rs` — add `pub mod error;` and `pub use error::{IpcError, IpcErrorKind};` near the top, after the module doc comment.

- [ ] **Step 3: Run the tests**

Run (working dir `rust/`): `cargo test -p idl-rs-tauri 2>&1 | grep -E "^test |^test result"`
Expected: 3 new tests `ok` plus the 2 existing M0 tests, `0 failed`.

- [ ] **Step 4: CHANGELOG**

Append under `[Unreleased] / ### Added` in `CHANGELOG.md` (app repo): `- **idl-rs-tauri: typed IpcError (C3 §2).** Cross-cutting and transport-sourced kinds seeded; each lane adds its own prefixed kinds when its command lands.`

- [ ] **Step 5: Commit (rust submodule)**

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l5-tauri" && git add -A && git commit -m "tauri: IpcError/IpcErrorKind (C3 §2), transport conversion"
```

---

### Task 2: `<data>` resolution and `settings.json` bootstrap (C4 §1)

**Files:**
- Create: `rust/tauri/src/paths.rs`, `rust/tauri/src/state.rs`
- Modify: `rust/tauri/src/lib.rs` (add both modules to `handler`-adjacent exports), `app/src-tauri/src/lib.rs` (`.setup()` hook), `app/src-tauri/Cargo.toml` (no new dependency — `tauri`'s `Manager`/`path` API is already in the pin)

**Interfaces:**
- Produces: `idl_rs_tauri::paths::resolve_data_dir(app_data_dir: &Path, app_config_dir: &Path) -> Result<PathBuf, IpcError>` (pure `std::fs`, unit-testable without a Tauri runtime); `idl_rs_tauri::state::DataDir(pub PathBuf)`, a `Send + Sync` newtype registered via `app.manage(...)` so every Group B command can take `tauri::State<DataDir>`.

- [ ] **Step 1: Write the failing test**

`rust/tauri/src/paths.rs`:
```rust
//! Resolves `<data>` (C4 §1: `app_data_dir()/data`, with an optional
//! `settings.json` override at `app_config_dir()/settings.json`) and creates
//! the C4 §2 directory tree. Pure `std::fs` — the two inputs are plain
//! `Path`s, not Tauri's `AppHandle`, so this is testable with temp
//! directories standing in for `app_data_dir()`/`app_config_dir()`; the
//! Tauri-specific part (calling `app.path().app_data_dir()`) lives in
//! `app/src-tauri`'s `.setup()` hook, which is one line calling this.

use std::path::{Path, PathBuf};

use crate::error::{IpcError, IpcErrorKind};

/// `settings.json`'s shape (C4 §1). Deserialised leniently: a missing or
/// unparsable file, or a missing/empty `data_dir` key, all mean "use the
/// platform default" — this bootstrap file's own corruption must never
/// block the app from opening at all.
#[derive(Debug, Default, serde::Deserialize)]
struct Settings {
    data_dir: Option<String>,
}

/// Resolves `<data>` and ensures the C4 §2 tree exists under it
/// (`blobs/sha256/`, `sessions/`, `workbooks/`, `tracks/`, `tmp/quarantine/`).
/// Idempotent — safe to call on every launch.
pub fn resolve_data_dir(app_data_dir: &Path, app_config_dir: &Path) -> Result<PathBuf, IpcError> {
    let settings_path = app_config_dir.join("settings.json");
    let data_root = match std::fs::read_to_string(&settings_path) {
        Ok(text) => {
            let settings: Settings = serde_json::from_str(&text).unwrap_or_default();
            match settings.data_dir.filter(|d| !d.is_empty()) {
                Some(d) => PathBuf::from(d),
                None => app_data_dir.to_path_buf(),
            }
        }
        Err(_) => app_data_dir.to_path_buf(), // absent file, or unreadable — platform default (C4 §1)
    };
    let data = data_root.join("data");
    for sub in ["blobs/sha256", "sessions", "workbooks", "tracks", "tmp/quarantine"] {
        std::fs::create_dir_all(data.join(sub))
            .map_err(|e| IpcError::new(IpcErrorKind::Io, format!("creating {sub}: {e}")))?;
    }
    Ok(data)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_settings_file_present_resolves_to_app_data_dir_slash_data() {
        // Arrange
        let app_data = tempfile::tempdir().unwrap();
        let app_config = tempfile::tempdir().unwrap();

        // Act
        let data = resolve_data_dir(app_data.path(), app_config.path()).unwrap();

        // Assert
        assert_eq!(data, app_data.path().join("data"));
        assert!(data.join("blobs/sha256").is_dir());
        assert!(data.join("tmp/quarantine").is_dir());
    }

    #[test]
    fn settings_json_data_dir_override_is_honoured() {
        // Arrange
        let app_data = tempfile::tempdir().unwrap();
        let app_config = tempfile::tempdir().unwrap();
        let override_root = tempfile::tempdir().unwrap();
        std::fs::write(
            app_config.path().join("settings.json"),
            format!(r#"{{"data_dir":"{}"}}"#, override_root.path().display().to_string().replace('\\', "\\\\")),
        ).unwrap();

        // Act
        let data = resolve_data_dir(app_data.path(), app_config.path()).unwrap();

        // Assert
        assert_eq!(data, override_root.path().join("data"));
    }

    #[test]
    fn corrupt_settings_json_falls_back_to_platform_default() {
        // Arrange
        let app_data = tempfile::tempdir().unwrap();
        let app_config = tempfile::tempdir().unwrap();
        std::fs::write(app_config.path().join("settings.json"), "{ not json").unwrap();

        // Act
        let data = resolve_data_dir(app_data.path(), app_config.path()).unwrap();

        // Assert
        assert_eq!(data, app_data.path().join("data"));
    }
}
```
Add `tempfile = "3"` under `[dev-dependencies]` in `rust/tauri/Cargo.toml` (no crate in the ecosystem report pins `tempfile`; it is a dev-only, test-only dependency of a kind the ecosystem report's scope did not cover — flagged in Open Questions rather than guessed at a specific pin; use whatever `cargo add tempfile --dev` resolves and record the resolved version in the commit message).

`rust/tauri/src/state.rs`:
```rust
//! Tauri-managed shared state (`app.manage(...)`), read by commands via
//! `tauri::State<T>`.

use std::path::PathBuf;

/// The resolved `<data>` root (C4 §1), computed once at startup by
/// `paths::resolve_data_dir` and managed for the app's lifetime.
pub struct DataDir(pub PathBuf);
```

- [ ] **Step 2: Wire modules and run tests**

`rust/tauri/src/lib.rs` — add `pub mod paths; pub mod state;`.

Run: `cargo test -p idl-rs-tauri 2>&1 | grep -E "^test |^test result"`
Expected: 3 new tests `ok`, everything else still `ok`, `0 failed`.

- [ ] **Step 3: Wire the setup hook**

`app/src-tauri/src/lib.rs`:
```rust
//! Tauri app crate. Thin by design: registers the engine's commands, resolves
//! `<data>` once at startup (C4 §1), and — in later lanes — the mobile
//! plugins. Nothing else lives here.

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let app_config_dir = app.path().app_config_dir()?;
            // Resolution failure here is a launch-time condition, not a
            // command-boundary one — C3's typed-error contract governs
            // command results, not `.setup()`. Panicking before any window
            // exists is the current behaviour; showing a native error
            // dialog instead is tracked as an open question (this plan,
            // "Open questions").
            let data_dir = idl_rs_tauri::paths::resolve_data_dir(&app_data_dir, &app_config_dir)
                .unwrap_or_else(|e| panic!("resolving <data>: {e:?}"));
            app.manage(idl_rs_tauri::state::DataDir(data_dir));
            Ok(())
        })
        .invoke_handler(idl_rs_tauri::handler())
        .run(tauri::generate_context!())
        .expect("error while running idl1");
}
```

- [ ] **Step 4: Build**

Run: `cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app/app/src-tauri" && cargo build 2>&1 | tail -5`
Expected: `Finished`.

- [ ] **Step 5: CHANGELOG**

`- **<data> resolution and settings.json bootstrap (C4 §1).** Resolved once at startup, directory tree created idempotently; overridable via app_config_dir()/settings.json.**`

- [ ] **Step 6: Commit (both repos)**

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l5-tauri" && git add -A && git commit -m "tauri: resolve <data> from app_data_dir + settings.json override (C4 §1)"
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave1-l5-tauri" && git add -A && git commit -m "app: wire <data> resolution into Tauri setup, managed as DataDir state"
```

---

### Task 3: Workbook file-watcher plumbing (C4 §4)

**Files:**
- Create: `rust/tauri/src/watcher.rs`
- Modify: `rust/tauri/Cargo.toml` (add `notify`), `rust/tauri/src/lib.rs`

**Interfaces:**
- Produces: `ExpectedHashSet` (insert/check-and-consume with a 5s TTL, C4 §4's self-write-suppression primitive — also needed verbatim by every atomic-write path L1 implements, but this task only builds the *watcher's* consumer of it, not a shared crate-spanning writer utility — that generalisation is out of scope, flagged in Open Questions) and `WorkbookWatcher::new(workbooks_dir: &Path, on_external_change: impl Fn(&Path) + Send + 'static) -> notify::Result<Self>`, debounced ~100 ms per C4 §4. **Not wired to `watch_workbook` yet** — that command (Task 11, gated on L3) calls this watcher and translates external-change paths into `WorkbookEvent`s with real `cell_ids`, which needs L3's parser. This task proves the mechanism stands alone, tested against a hand-created dummy `.idl1wb` file.

- [ ] **Step 1: Write the failing test**

`rust/tauri/src/watcher.rs`:
```rust
//! `<data>/workbooks` file watching (C4 §4, design §7). Distinguishes the
//! app's own writes (temp-file + rename, hash pre-registered before the
//! rename — C4 §4 step 3) from external edits, debounces ~100 ms, and calls
//! back with the changed path. Cell-level diffing and re-evaluation are the
//! caller's job (`watch_workbook`, gated on L3) — this module only answers
//! "did this path just change, and was it us."

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use notify::{RecursiveMode, Watcher};

const EXPECTED_HASH_TTL: Duration = Duration::from_secs(5);
const DEBOUNCE: Duration = Duration::from_millis(100);

/// The C4 §4 self-write-suppression primitive: `(path -> (hex sha256,
/// inserted_at))`, entries expiring after `EXPECTED_HASH_TTL` so a stale
/// entry can never misclassify a later, genuinely external write.
#[derive(Default)]
pub struct ExpectedHashSet(Mutex<HashMap<PathBuf, (String, Instant)>>);

impl ExpectedHashSet {
    pub fn new() -> Self {
        Self::default()
    }

    /// Registers the hash the app is about to write to `path`, **before**
    /// the atomic rename (C4 §4 step 3 — this ordering is load-bearing).
    pub fn expect(&self, path: PathBuf, sha256_hex: String) {
        self.0.lock().unwrap().insert(path, (sha256_hex, Instant::now()));
    }

    /// True and consumes the entry iff `path` has a live, matching expected
    /// hash — meaning this change was the app's own write. False (entry left
    /// alone if merely stale/mismatched — expiry handles cleanup) otherwise.
    pub fn check_and_consume(&self, path: &Path, actual_sha256_hex: &str) -> bool {
        let mut map = self.0.lock().unwrap();
        match map.get(path) {
            Some((expected, at)) if at.elapsed() < EXPECTED_HASH_TTL && expected == actual_sha256_hex => {
                map.remove(path);
                true
            }
            _ => false,
        }
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

/// Watches `workbooks_dir` (non-recursive — C4 §2's `workbooks/` is flat) for
/// create/rename events, filters out the app's own writes via `hashes`, and
/// calls `on_external_change(path)` after a ~100 ms debounce per path.
pub struct WorkbookWatcher {
    _inner: notify::RecommendedWatcher, // kept alive for the watcher's lifetime
}

impl WorkbookWatcher {
    pub fn new(
        workbooks_dir: &Path,
        hashes: Arc<ExpectedHashSet>,
        on_external_change: impl Fn(&Path) + Send + Sync + 'static,
    ) -> notify::Result<Self> {
        let pending: Arc<Mutex<HashMap<PathBuf, Instant>>> = Arc::new(Mutex::new(HashMap::new()));
        let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            let Ok(event) = res else { return };
            use notify::EventKind::*;
            if !matches!(event.kind, Create(_) | Modify(_)) {
                return;
            }
            for path in event.paths {
                let Ok(bytes) = std::fs::read(&path) else { continue }; // gone again before we read it
                let hash = sha256_hex(&bytes);
                if hashes.check_and_consume(&path, &hash) {
                    continue; // our own write — consumed, do not re-parse (C4 §4)
                }
                pending.lock().unwrap().insert(path.clone(), Instant::now());
                let pending = Arc::clone(&pending);
                let on_external_change = &on_external_change as *const _; // debounced on a short-lived thread
                let path_for_thread = path.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(DEBOUNCE);
                    let mut map = pending.lock().unwrap();
                    if let Some(&t) = map.get(&path_for_thread) {
                        if t.elapsed() >= DEBOUNCE {
                            map.remove(&path_for_thread);
                            // SAFETY: the watcher (and this closure's captures) outlives every
                            // spawned debounce thread — `WorkbookWatcher` is dropped only after
                            // its notify::Watcher stops delivering events.
                            unsafe { (*(on_external_change as *const (dyn Fn(&Path) + Send + Sync))) (&path_for_thread) };
                        }
                    }
                });
            }
        })?;
        watcher.watch(workbooks_dir, RecursiveMode::NonRecursive)?;
        Ok(Self { _inner: watcher })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    #[test]
    fn external_write_to_workbooks_dir_fires_callback_with_the_path() {
        // Arrange
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path()).unwrap();
        let (tx, rx) = mpsc::channel::<PathBuf>();
        let hashes = Arc::new(ExpectedHashSet::new());
        let _watcher = WorkbookWatcher::new(dir.path(), hashes, move |p| { let _ = tx.send(p.to_path_buf()); }).unwrap();
        let target = dir.path().join("dummy.idl1wb");

        // Act
        std::fs::write(&target, "---\nid: test\n---\n# Dummy\n").unwrap();

        // Assert
        let seen = rx.recv_timeout(Duration::from_millis(500)).expect("callback fired");
        assert_eq!(seen, target);
    }

    #[test]
    fn self_write_with_pre_registered_hash_never_fires_callback() {
        // Arrange
        let dir = tempfile::tempdir().unwrap();
        let (tx, rx) = mpsc::channel::<PathBuf>();
        let hashes = Arc::new(ExpectedHashSet::new());
        let target = dir.path().join("dummy.idl1wb");
        let content = b"---\nid: test\n---\n# Dummy\n";
        hashes.expect(target.clone(), sha256_hex(content)); // registered before the write, per C4 §4 step 3
        let _watcher = WorkbookWatcher::new(dir.path(), Arc::clone(&hashes), move |p| { let _ = tx.send(p.to_path_buf()); }).unwrap();

        // Act
        std::fs::write(&target, content).unwrap();

        // Assert
        assert!(rx.recv_timeout(Duration::from_millis(500)).is_err(), "callback must not fire for a self-write");
    }
}
```

**Note on the `unsafe` cast above:** this is a plan, not a merge-ready diff —
the implementer should prefer `Arc<dyn Fn(&Path) + Send + Sync>` for
`on_external_change` (cloned into the spawned thread) over the raw-pointer
cast sketched here, which exists only to keep this listing short. Whichever
shape lands, the two tests above are the acceptance bar, and the
`unsafe`-free `Arc<dyn Fn...>` version is the actual requirement — treat the
above as pseudocode for the debounce *logic*, not as code to paste verbatim.

Add to `rust/tauri/Cargo.toml`: `notify = "8.2.0"` (pin), `sha2 = "0.10"`,
`hex = "0.4"` under `[dependencies]` (versions for `sha2`/`hex` are not in
the ecosystem report — flagged in Open Questions, same as `tempfile`; use
whatever `cargo add` resolves and record it).

- [ ] **Step 2: Run the tests**

Run: `cargo test -p idl-rs-tauri watcher 2>&1 | grep -E "^test |^test result"`
Expected: both new tests `ok`, `0 failed`.

- [ ] **Step 3: CHANGELOG**

`- **Workbook file-watcher plumbing (C4 §4).** notify on <data>/workbooks, ~100ms debounce, expected-hash-set self-write suppression. Not yet wired to watch_workbook — gated on L3 (Task 11).`

- [ ] **Step 4: Commit (rust submodule)**

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l5-tauri" && git add -A && git commit -m "tauri: workbook watcher with expected-hash self-write suppression (C4 §4)"
```

---

### Task 4: `app/src/ipc/tiles.ts` and `rasters.ts` — the real C3 binary layouts

**Files:**
- Create: `app/src/ipc/tiles.ts`, `app/src/ipc/tiles.test.ts` (replaced), `app/src/ipc/rasters.ts`, `app/src/ipc/rasters.test.ts`
- Create: `app/src/ipc/_m0_smoke.ts` (the old `decodeTile`/`fetchSmokeTile`, renamed and kept only until Task 15 retires `smoke_tile` for good — see that task)
- Modify: `app/src/App.tsx` (import path only, for now)

**Interfaces:**
- Consumes: C3 §3.5 (tile binary layout), §3.6 (raster binary layout) — both fully fixed already, zero dependency on any other lane.
- Produces: `decodeTile(buf: ArrayBuffer): DecodedTile`, `decodeRaster(buf: ArrayBuffer): DecodedRaster` — pure, fully tested against C3's own worked examples. `fetchTile`/`fetchRaster` (the `invoke()`-calling wrappers) are also written here since C3 §1 assigns all of `app/src/ipc/` to L5 regardless of backing lane — they simply reject until Task 14/12 land the Rust side, which is expected and fine (not a Group B blocker for *this* task).

- [ ] **Step 1: Write the failing tests**

`app/src/ipc/tiles.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { decodeTile } from "./tiles";

/** Builds a tile buffer matching C3 §3.5's worked example: tier 3, 512
 *  samples, 256 columns — total 7200 bytes. */
function buildWorkedExampleTile(): ArrayBuffer {
  const sampleCount = 512;
  const columnCount = 256;
  const total = 32 + sampleCount * 8 + columnCount * 12;
  const buf = new ArrayBuffer(total);
  const view = new DataView(buf);
  view.setUint8(0, 0x49); view.setUint8(1, 0x44); view.setUint8(2, 0x4c); view.setUint8(3, 0x54); // "IDLT"
  view.setUint16(4, 1, true);   // version
  view.setUint16(6, 3, true);   // tier
  view.setUint32(8, 0, true);   // tile_index
  view.setUint32(12, sampleCount, true);
  view.setUint32(16, columnCount, true);
  view.setUint32(20, 0, true);  // flags
  for (let i = 0; i < sampleCount; i++) {
    view.setFloat32(32 + i * 8, i, true);
    view.setFloat32(32 + i * 8 + 4, i + 0.5, true);
  }
  const colOffset = 32 + sampleCount * 8;
  for (let j = 0; j < columnCount; j++) {
    view.setFloat32(colOffset + j * 12, j, true);
    view.setFloat32(colOffset + j * 12 + 4, j + 1, true);
    view.setFloat32(colOffset + j * 12 + 8, j + 0.5, true);
  }
  return buf;
}

describe("decodeTile", () => {
  it("C3 §3.5 worked example (tier 3, 512 samples, 256 columns) — decodes — header and both regions match", () => {
    // Arrange
    const buf = buildWorkedExampleTile();

    // Act
    const tile = decodeTile(buf);

    // Assert
    expect(tile.tier).toBe(3);
    expect(tile.tileIndex).toBe(0);
    expect(tile.sampleMin.length).toBe(512);
    expect(tile.sampleMax.length).toBe(512);
    expect(tile.columnMin.length).toBe(256);
    expect(tile.columnMean.length).toBe(256);
    expect(tile.sampleMin[10]).toBeCloseTo(10);
    expect(tile.sampleMax[10]).toBeCloseTo(10.5);
    expect(tile.columnMean[10]).toBeCloseTo(10.5);
  });

  it("wrong magic bytes — throws — typed error naming the mismatch", () => {
    // Arrange
    const buf = buildWorkedExampleTile();
    new DataView(buf).setUint8(0, 0x00);

    // Act / Assert
    expect(() => decodeTile(buf)).toThrowError(/magic/i);
  });

  it("buffer shorter than the header — throws — typed error", () => {
    // Arrange
    const buf = new ArrayBuffer(10);

    // Act / Assert
    expect(() => decodeTile(buf)).toThrowError(/32 bytes/);
  });
});
```

`app/src/ipc/rasters.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { decodeRaster } from "./rasters";

/** Builds a raster buffer matching C3 §3.6's worked example: 64×32, format 0. */
function buildWorkedExampleRaster(): ArrayBuffer {
  const width = 64, height = 32;
  const buf = new ArrayBuffer(16 + width * height * 4);
  const view = new DataView(buf);
  view.setUint8(0, 0x49); view.setUint8(1, 0x44); view.setUint8(2, 0x4c); view.setUint8(3, 0x52); // "IDLR"
  view.setUint16(4, 1, true);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  view.setUint16(10, 0, true); // format = RGBA8
  const pixels = new Uint8Array(buf, 16);
  pixels[0] = 255; pixels[1] = 0; pixels[2] = 0; pixels[3] = 255; // first pixel red-opaque
  return buf;
}

describe("decodeRaster", () => {
  it("C3 §3.6 worked example (64x32, format 0) — decodes — dimensions and pixel region match", () => {
    // Arrange
    const buf = buildWorkedExampleRaster();

    // Act
    const raster = decodeRaster(buf);

    // Assert
    expect(raster.width).toBe(64);
    expect(raster.height).toBe(32);
    expect(raster.pixels.length).toBe(64 * 32 * 4);
    expect(Array.from(raster.pixels.slice(0, 4))).toEqual([255, 0, 0, 255]);
  });

  it("unsupported format value — throws — typed error", () => {
    // Arrange
    const buf = buildWorkedExampleRaster();
    new DataView(buf).setUint16(10, 7, true);

    // Act / Assert
    expect(() => decodeRaster(buf)).toThrowError(/format/i);
  });
});
```

Run: `cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave1-l5-tauri/app" && npm test`
Expected: FAIL — `Cannot find module './tiles'` / `./rasters` (the old smoke-layout `tiles.ts` is about to be replaced).

- [ ] **Step 2: Retire the M0 smoke module**

`app/src/ipc/_m0_smoke.ts` (verbatim move of the current `tiles.ts` content, renamed):
```ts
import { invoke } from "@tauri-apps/api/core";

/**
 * M0-only smoke layout: bare little-endian f32s over `smoke_tile`. Superseded
 * by the real tile layout in `./tiles.ts` (C3 §3.5). Kept only so the App
 * shell still proves binary IPC before Task 14 wires `fetch_tile` for real;
 * deleted in Task 15 along with the Rust `smoke_tile` command.
 */
export function decodeSmokeTile(buf: ArrayBuffer): Float32Array {
  if (buf.byteLength % 4 !== 0) {
    throw new Error(`tile byte length ${buf.byteLength} is not a multiple of 4`);
  }
  return new Float32Array(buf);
}

export async function fetchSmokeTile(n: number): Promise<Float32Array> {
  const buf = await invoke<ArrayBuffer>("smoke_tile", { n });
  return decodeSmokeTile(buf);
}
```
Delete the old `app/src/ipc/tiles.test.ts` content (it tested the smoke layout under the name `decodeTile`, which now means something else) — its two cases are superseded by this task's new `tiles.test.ts` above testing the real layout, and by keeping `_m0_smoke.ts` untested (M0-only, deleted in Task 15, not worth a parallel test file).

Update `app/src/App.tsx`'s import of `fetchSmokeTile` from `./ipc/tiles` to `./ipc/_m0_smoke`; leave `fetchEngineVersion`'s import pointing at `./ipc/tiles` for now — it moves to the new `engine.ts` in Task 5.

- [ ] **Step 3: Implement `tiles.ts`**

```ts
import { invoke } from "@tauri-apps/api/core";

/** Decoded tile (C3 §3.5): the bucket min/max pairs (`sampleMin`/`sampleMax`,
 *  length `sample_count`) plus the coarser per-pixel-column stats
 *  (`columnMin`/`columnMax`/`columnMean`, length `column_count`) hover reads
 *  use without IPC (design §6). */
export interface DecodedTile {
  tier: number;
  tileIndex: number;
  sampleMin: Float32Array;
  sampleMax: Float32Array;
  columnMin: Float32Array;
  columnMax: Float32Array;
  columnMean: Float32Array;
}

const MAGIC = "IDLT";

/** Decodes a `fetch_tile` response per C3 §3.5's fixed 32-byte header, the
 *  `sample_count`-pair sample region, and the `column_count`-triple column
 *  region. Views into `buf` with no copy.
 *
 *  @throws Error if the buffer is too short for the header, the magic bytes
 *  don't match, or the buffer is shorter than the header declares.
 */
export function decodeTile(buf: ArrayBuffer): DecodedTile {
  if (buf.byteLength < 32) {
    throw new Error(`tile buffer ${buf.byteLength} bytes, header needs 32 bytes`);
  }
  const view = new DataView(buf);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== MAGIC) {
    throw new Error(`tile magic bytes "${magic}" != "${MAGIC}"`);
  }
  const tier = view.getUint16(6, true);
  const tileIndex = view.getUint32(8, true);
  const sampleCount = view.getUint32(12, true);
  const columnCount = view.getUint32(16, true);

  const sampleOffset = 32;
  const sampleLen = sampleCount * 8;
  const columnOffset = sampleOffset + sampleLen;
  const columnLen = columnCount * 12;
  if (buf.byteLength < columnOffset + columnLen) {
    throw new Error(
      `tile buffer ${buf.byteLength} bytes too short for sample_count=${sampleCount}, column_count=${columnCount}`
    );
  }

  const sampleMin = new Float32Array(sampleCount);
  const sampleMax = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    sampleMin[i] = view.getFloat32(sampleOffset + i * 8, true);
    sampleMax[i] = view.getFloat32(sampleOffset + i * 8 + 4, true);
  }
  const columnMin = new Float32Array(columnCount);
  const columnMax = new Float32Array(columnCount);
  const columnMean = new Float32Array(columnCount);
  for (let j = 0; j < columnCount; j++) {
    columnMin[j] = view.getFloat32(columnOffset + j * 12, true);
    columnMax[j] = view.getFloat32(columnOffset + j * 12 + 4, true);
    columnMean[j] = view.getFloat32(columnOffset + j * 12 + 8, true);
  }
  return { tier, tileIndex, sampleMin, sampleMax, columnMin, columnMax, columnMean };
}

/** Fetches and decodes one tile (C3 §3.5). Settle-bound only (design §6,
 *  C3 §4) — never call from a hover/pan/zoom gesture-frame handler. */
export async function fetchTile(
  sessionId: string,
  channel: string,
  tier: number,
  tileIndex: number
): Promise<DecodedTile> {
  const buf = await invoke<ArrayBuffer>("fetch_tile", { sessionId, channel, tier, tileIndex });
  return decodeTile(buf);
}
```

- [ ] **Step 4: Implement `rasters.ts`**

```ts
import { invoke } from "@tauri-apps/api/core";

/** Decoded raster (C3 §3.6): row-major top-down RGBA8 pixel data. */
export interface DecodedRaster {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

const MAGIC = "IDLR";
const FORMAT_RGBA8 = 0;

/** Decodes a `fetch_raster` response per C3 §3.6's fixed 16-byte header.
 *  @throws Error on bad magic, an unsupported `format` value, or a buffer
 *  too short for `width * height * 4` pixel bytes. */
export function decodeRaster(buf: ArrayBuffer): DecodedRaster {
  if (buf.byteLength < 16) {
    throw new Error(`raster buffer ${buf.byteLength} bytes, header needs 16 bytes`);
  }
  const view = new DataView(buf);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== MAGIC) {
    throw new Error(`raster magic bytes "${magic}" != "${MAGIC}"`);
  }
  const width = view.getUint16(6, true);
  const height = view.getUint16(8, true);
  const format = view.getUint16(10, true);
  if (format !== FORMAT_RGBA8) {
    throw new Error(`raster format ${format} not supported (only RGBA8 = 0 is defined, C3 §3.6)`);
  }
  const pixelLen = width * height * 4;
  if (buf.byteLength < 16 + pixelLen) {
    throw new Error(`raster buffer ${buf.byteLength} bytes too short for ${width}x${height} RGBA8`);
  }
  return { width, height, pixels: new Uint8ClampedArray(buf, 16, pixelLen) };
}

/** Raster kind and its numeric parameter bag (C3 §3.6 — `params`' generic
 *  shape is provisional per C3 open question 6.4; kept as-is here). */
export type RasterKind = "spectrogram" | "histogram2d";

/** Fetches and decodes one raster. Settle-bound only, same rule as `fetchTile` (C3 §4). */
export async function fetchRaster(
  sessionId: string,
  channel: string,
  kind: RasterKind,
  width: number,
  height: number,
  params: Record<string, number>
): Promise<DecodedRaster> {
  const buf = await invoke<ArrayBuffer>("fetch_raster", { sessionId, channel, kind, width, height, params });
  return decodeRaster(buf);
}
```

- [ ] **Step 5: Run tests, typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all tests pass (smoke test + old M0 IPC tests via `_m0_smoke` path, if any remain wired in App.tsx — see Step 2 — plus this task's 5 new tests); `tsc` prints nothing.

- [ ] **Step 6: CHANGELOG**

`- **app/src/ipc/tiles.ts, rasters.ts: real C3 §3.5/§3.6 binary decoders.** Pure, tested against C3's own worked examples; fetchTile/fetchRaster reject until Task 14/12 land the Rust commands.`

- [ ] **Step 7: Commit (app repo)**

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app" && git add -A && git commit -m "app: real C3 tile/raster binary decoders; retire M0 smoke layout to _m0_smoke.ts"
```

---

### Task 5: `app/src/ipc/` — the remaining C3 §1 module scaffolding

**Files:**
- Create: `app/src/ipc/engine.ts`, `engine.test.ts`, `catalog.ts`, `catalog.test.ts`, `import.ts`, `workbook.ts`, `cursor.ts`, `device.ts`, `sync.ts`
- Modify: `app/src/App.tsx` (import `fetchEngineVersion` from `./ipc/engine`)

**Interfaces:**
- Produces: one TS module per remaining C3 §3 command group, each exporting the typed interfaces and `invoke()`-wrapping functions for that group's commands, matching C3 §3 field-for-field. `sync.ts` is included per C3 §1's module list even though its backing lane (L11) is wave 2 — see this task's note.

- [ ] **Step 1: `engine.ts`, fully implemented and tested (it has no backing-lane dependency at all)**

```ts
import { invoke } from "@tauri-apps/api/core";

/** The engine crate version, from `idl_rs::VERSION`. Never fails (C3 §3.1). */
export async function fetchEngineVersion(): Promise<string> {
  return invoke<string>("engine_version");
}
```

`engine.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("fetchEngineVersion", () => {
  it("engine_version resolves — returns the string unchanged", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue("0.1.0");
    const { fetchEngineVersion } = await import("./engine");

    // Act
    const version = await fetchEngineVersion();

    // Assert
    expect(version).toBe("0.1.0");
    expect(invoke).toHaveBeenCalledWith("engine_version");
  });
});
```

- [ ] **Step 2: `catalog.ts`, fully worked as the pattern for the rest — every interface field copied verbatim from C3 §3.2**

```ts
import { invoke } from "@tauri-apps/api/core";

export interface SessionSummary {
  session_id: string;
  blob_sha256: string;
  source_format: "idl0" | "fit" | "gpx" | "csv";
  device_id: string | null;
  config_checksum: string | null;
  importer_version: string;
  seam_correction_version: string;
  engine_version: string;
  timestamp_utc_ms: number;
  created_at_ms: number;
  rider: string;
  bike: string;
  venue_name: string;
  event_name: string;
  event_session: string;
  short_comment: string;
  tag: string;
  lap_count: number | null;
  duration_ms: number | null;
}

// ChannelSummary, LapDetail, TrackVisitSummary, SessionDetail, LapSummary,
// LapChannelStat, WorkbookSummary, TrackSummary, TrackDetail, RebuildReport:
// copied field-for-field from C3 §3.2 — omitted here for length, not because
// they are optional. The implementer transcribes every interface in C3 §3.2
// exactly, including every comment noting units/nullability, before writing
// the functions below.

export async function listSessions(): Promise<SessionSummary[]> {
  return invoke<SessionSummary[]>("list_sessions");
}
// get_session, list_laps, rebuild_catalog, list_workbooks, list_tracks,
// get_track: same pattern — one exported async function per C3 §3.2 command,
// argument names matching the Rust `fn` signature C3 §1 fixes (named params,
// not one wrapped object).
```

`catalog.test.ts` — one test per exported function is not required (this module is a thin pass-through); at minimum, one test proving `listSessions()` calls `invoke("list_sessions")` with no arguments and returns its resolved value unchanged, following `engine.test.ts`'s mock pattern above.

- [ ] **Step 3: `import.ts`, `workbook.ts`, `cursor.ts`, `device.ts` — same pattern, full C3 §3.3/§3.4/§3.7/§3.8 field lists**

Each module: transcribe every `interface` from its C3 §3.x subsection verbatim
(field names, types, nullability, units in comments), then one exported
async function per command in that subsection, named by converting the
command's `snake_case` to `camelCase` (`import_file` → `importFile`,
`open_workbook` → `openWorkbook`, etc. — this is this plan's naming
convention for the TS side; C3 itself only fixes the Rust command's
`snake_case` name, passed as the `invoke()` string literal unchanged).
Commands taking a `Channel<Progress>`/`Channel<DeviceDiscovered>`/
`Channel<WorkbookEvent>` argument (`import_file`, `download_file`,
`ble_scan`, `watch_workbook`) construct a `@tauri-apps/api/core` `Channel`
and pass an `onEvent` callback parameter through it — e.g.:
```ts
import { Channel, invoke } from "@tauri-apps/api/core";

export async function importFile(
  path: string,
  importerId: string | null,
  onProgress: (p: Progress) => void
): Promise<SessionSummary> {
  const channel = new Channel<Progress>();
  channel.onmessage = onProgress;
  return invoke<SessionSummary>("import_file", { path, importerId, progress: channel });
}
```
One test per module, minimum, proving the `invoke()` call and argument
shape for its simplest command (mirroring `catalog.test.ts`'s minimum).

- [ ] **Step 4: `sync.ts` — scaffolded, not load-bearing this wave**

```ts
import { invoke } from "@tauri-apps/api/core";

// L11 (LAN sync) is wave 2 — no Rust command backs this module yet. Typed
// per C3 §3.9 so the shape is fixed and L11 has nothing to design here, only
// to make these calls succeed.

export interface SyncStatus {
  paired_peers: PeerStatus[];
  last_sync_utc_ms: number | null;
}
export interface PeerStatus {
  peer_id: string;
  name: string;
  online: boolean;
}

export async function syncStatus(): Promise<SyncStatus> {
  return invoke<SyncStatus>("sync_status");
}
// sync_now, pair_peer: same pattern, C3 §3.9.
```
No test required for `sync.ts` this wave (nothing calls it; a test would only
assert the same trivial `invoke()` pass-through already covered by the
pattern proven in Steps 1–3) — noted, not silently skipped.

- [ ] **Step 5: Wire `App.tsx`, run tests, typecheck**

`App.tsx`: change `fetchEngineVersion` import from `./ipc/tiles` to `./ipc/engine`.

Run: `npm test && npx tsc --noEmit`
Expected: all green, `tsc` clean.

- [ ] **Step 6: CHANGELOG**

`- **app/src/ipc/: full C3 §1 module scaffolding.** engine, catalog, import, workbook, cursor, device, sync — typed per C3 §3, invoke()-wrapped; commands not yet backed reject until their owning lane's Group B task lands.`

- [ ] **Step 7: Commit (app repo)**

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app" && git add -A && git commit -m "app: complete app/src/ipc/ module scaffolding per C3 §1"
```

---

### Task 6: React routing skeleton and app-level state management

**Files:**
- Create: `app/src/routes/types.ts`, `app/src/routes/pages/NotebookPage.tsx`, `DevicePage.tsx`, `DataPage.tsx`, `SettingsPage.tsx`, `app/src/state/AppState.tsx`, `app/src/state/AppState.test.ts`
- Modify: `app/src/App.tsx`

**Interfaces:**
- Produces: `RouteId = "notebook" | "device" | "data" | "settings"` (the four tabs L7's scope names: Notebook/Device/Data/Settings); `appStateReducer(state, action) -> AppState` (pure, tested without rendering — "UI rendering is not unit-tested," CLAUDE.md §4); `<AppStateProvider>`/`useAppState()` React Context wiring it up; four placeholder page components L6/L7 replace.

- [ ] **Step 1: Route types and placeholder pages**

`app/src/routes/types.ts`:
```ts
/** The app's four top-level tabs (design §10 L6/L7 scope: notebook viewer,
 *  device connection, data/catalog browser, settings). No nested routing in
 *  v1 — a flat tab switch is sufficient for a four-screen desktop/mobile
 *  shell and needs no routing library (see this plan's Open Questions). */
export type RouteId = "notebook" | "device" | "data" | "settings";

export const ROUTES: readonly { id: RouteId; label: string }[] = [
  { id: "notebook", label: "Notebook" },
  { id: "device", label: "Device" },
  { id: "data", label: "Data" },
  { id: "settings", label: "Settings" },
];
```

`app/src/routes/pages/NotebookPage.tsx` (and `Device`/`Data`/`Settings` the same shape):
```tsx
/** Placeholder — L6 (notebook UI) replaces this with the sandboxed-iframe
 *  cell viewer. */
export default function NotebookPage() {
  return <p>Notebook — built by L6.</p>;
}
```

- [ ] **Step 2: App-level state — write the failing test first**

`app/src/state/AppState.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { appStateReducer, initialAppState } from "./AppState";

describe("appStateReducer", () => {
  it("NAVIGATE action — changes only the route field", () => {
    // Arrange
    const state = { ...initialAppState, engineVersion: "0.1.0" };

    // Act
    const next = appStateReducer(state, { type: "NAVIGATE", route: "device" });

    // Assert
    expect(next.route).toBe("device");
    expect(next.engineVersion).toBe("0.1.0");
  });

  it("SET_ENGINE_VERSION action — sets the field, leaves route unchanged", () => {
    // Arrange
    const state = { ...initialAppState, route: "data" as const };

    // Act
    const next = appStateReducer(state, { type: "SET_ENGINE_VERSION", version: "0.2.0" });

    // Assert
    expect(next.engineVersion).toBe("0.2.0");
    expect(next.route).toBe("data");
  });
});
```

- [ ] **Step 3: Implement**

`app/src/state/AppState.tsx`:
```tsx
import { createContext, useContext, useReducer, type ReactNode } from "react";
import type { RouteId } from "../routes/types";

/** App-shell state: the current tab plus the two values every tab may need
 *  (engine version, for a footer/about display; resolved <data> path, for
 *  Settings). L6/L7 extend this shape with their own slices (workbook
 *  handle, selection model, …) rather than inventing a second store — see
 *  this plan's Open Questions on when a heavier state library is justified. */
export interface AppState {
  route: RouteId;
  engineVersion: string | null;
}

export const initialAppState: AppState = { route: "notebook", engineVersion: null };

export type AppAction =
  | { type: "NAVIGATE"; route: RouteId }
  | { type: "SET_ENGINE_VERSION"; version: string };

/** Pure reducer — the unit-tested half of this module (CLAUDE.md §4: UI
 *  rendering is not unit-tested; this is not rendering). */
export function appStateReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "NAVIGATE":
      return { ...state, route: action.route };
    case "SET_ENGINE_VERSION":
      return { ...state, engineVersion: action.version };
  }
}

const AppStateContext = createContext<[AppState, React.Dispatch<AppAction>] | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const value = useReducer(appStateReducer, initialAppState);
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

/** @throws Error if called outside `<AppStateProvider>`. */
export function useAppState(): [AppState, React.Dispatch<AppAction>] {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used inside <AppStateProvider>");
  return ctx;
}
```

- [ ] **Step 4: Wire `App.tsx` as the routing shell**

```tsx
import { useEffect } from "react";
import "./App.css";
import { fetchEngineVersion } from "./ipc/engine";
import { AppStateProvider, useAppState } from "./state/AppState";
import { ROUTES } from "./routes/types";
import NotebookPage from "./routes/pages/NotebookPage";
import DevicePage from "./routes/pages/DevicePage";
import DataPage from "./routes/pages/DataPage";
import SettingsPage from "./routes/pages/SettingsPage";

function Shell() {
  const [state, dispatch] = useAppState();

  useEffect(() => {
    fetchEngineVersion().then((v) => dispatch({ type: "SET_ENGINE_VERSION", version: v }));
  }, [dispatch]);

  const page = {
    notebook: <NotebookPage />,
    device: <DevicePage />,
    data: <DataPage />,
    settings: <SettingsPage />,
  }[state.route];

  return (
    <main className="idl1-root">
      <nav>
        {ROUTES.map((r) => (
          <button key={r.id} onClick={() => dispatch({ type: "NAVIGATE", route: r.id })} disabled={state.route === r.id}>
            {r.label}
          </button>
        ))}
      </nav>
      <p>Engine {state.engineVersion ?? "…"}</p>
      {page}
    </main>
  );
}

/** Root of the idl1 UI: state provider + the four-tab shell. */
export default function App() {
  return (
    <AppStateProvider>
      <Shell />
    </AppStateProvider>
  );
}
```
This drops the M0 smoke-tile display from the default screen — the binary
IPC proof moves to a dedicated debug affordance kept only through Task 15
(e.g. a small always-visible line on `SettingsPage` calling `_m0_smoke`'s
`fetchSmokeTile`, deleted in that task along with `_m0_smoke.ts` itself).

- [ ] **Step 5: Run tests, typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 6: CHANGELOG**

`- **React routing skeleton + app-level state (no new dependency).** Four-tab shell (Notebook/Device/Data/Settings) over a Context+useReducer AppState; placeholder pages for L6/L7.`

- [ ] **Step 7: Commit (app repo)**

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app" && git add -A && git commit -m "app: routing skeleton (four-tab shell) and app-level state (Context+useReducer)"
```

---

### Task 7: SPEC §11 rewrite (spec-during) + Group A checkpoint

**Files:**
- Modify: `docs/IDL0_SPEC.md` §11 (lines 869–921 as read at plan-drafting time — an implementer re-locates the section by heading, not by line number, since earlier tasks in this plan don't touch it but other concurrent lane work might shift line numbers)
- Modify: `TASKS.md` (no line ticked yet — L5 isn't done), `CHANGELOG.md`

**Interfaces:**
- Produces: a rewritten §11 describing the Tauri/Rust-core/TS architecture, summarizing/cross-referencing CLAUDE.md §2 rather than duplicating it, per the task brief's instruction. **First draft only** — L10's plan does the cross-lane consistency pass once L1–L4/L6/L7 land (this is stated in the new §11 text itself, not just this plan, so a reader of SPEC in isolation knows the section is still settling).

- [ ] **Step 1: Replace §11's content**

Replace everything from `## 11. App Architecture` through (not including) `## 12. State Management` with:

```markdown
## 11. App Architecture

> **Status note (2026-09-03):** this section is L5's first draft, written
> alongside `docs/superpowers/plans/2026-09-03-idl1-wave1-l5-tauri-scaffold.md`.
> L10's plan does a cross-lane consistency pass once L1–L4, L6 and L7 have
> also landed and named their own module paths — treat any Rust module path
> below as illustrative until then.

### 11.1 Layers

The authoritative layer table and decision rule live in `CLAUDE.md` §2 —
this section does not repeat them. In one line: `rust/core` is the pure
engine (no Tauri, no async runtime, no network); `rust/transport` is device
and LAN I/O; `rust/tauri` (`idl-rs-tauri`) is thin `#[tauri::command]` glue
over both and the only crate the frontend sees; `app/src-tauri` is the Tauri
app crate (builder, plugin registration, mobile plugins); `app/src` is the
TypeScript UI, which talks only to `idl-rs-tauri` commands.

This replaces idl0's Dart/Rust split (`flutter_rust_bridge`, Riverpod
providers, `sqflite`) in full — Flutter is not part of idl1 (design doc D1).

### 11.2 IPC

Every command, its argument/return shapes, the binary tile/raster layouts,
the typed error shape, and the interaction budget (which commands may never
run on a hot path) are fixed by contract C3
(`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`) — not restated
here. `app/src/ipc/*.ts` (one module per C3 §3 command group) is the only
place `app/src` is allowed to import `@tauri-apps/api/core` (C3 §1).

### 11.3 Platform targets

Desktop (Windows/macOS/Linux) and mobile (Android/iOS) both run the same
Tauri v2 shell and the same `idl-rs-tauri` command set — there is no separate
web/PWA target (unlike idl0's Flutter web lane, which idl1 does not carry
forward). Mobile BLE and WiFi-network binding are Tauri mobile plugins over
the same Rust transport traits desktop uses (design §7; lane L9, wave 2–3).

### 11.4 State management

React (design D12). The app-shell state (current tab, resolved `<data>` path,
engine version) is a `Context` + `useReducer` store with no external
dependency (`app/src/state/AppState.tsx`, lane L5). Riverpod, Provider and
Bloc are idl0-only and do not apply (`CONTRIBUTING.md`). Whether the notebook
view's reactive cross-runtime DAG (design §4, "one graph, two schedulers")
needs a heavier state library is L6's decision, recorded here when made — see
this plan's Open Questions.

### 11.5 File model and local database

Superseded by contracts C1 (session schema) and C4 (data directory) in full
— `docs/superpowers/specs/2026-09-03-idl1-c1-session-schema.md` and
`…-c4-data-directory.md`. In one line: raw sources are immutable,
content-addressed blobs; `data.parquet`/`derived/*.parquet` are functions of
those blobs; `session.json` replaces `.idl0w`; `.idl1wb` (C2) replaces
`.idl0wb`; `catalog.sqlite` is a rebuildable index that is never synced (C4
§5) — nothing reads it for truth.

### 11.6 File watcher

`notify` on `<data>/workbooks` only, self-write suppression via an
expected-hash set, ~100 ms debounce (C4 §4, design §7). Built in
`rust/tauri/src/watcher.rs` (lane L5); wired to per-cell diffing once L3's
workbook parser lands (C3 §3.4 `watch_workbook`).
```

- [ ] **Step 2: Verify no stray references**

Run (Git Bash): `grep -n "flutter_rust_bridge\|Riverpod\|sqflite" "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app/docs/IDL0_SPEC.md"`
Expected: zero matches inside the new §11 (matches elsewhere in the document, if any, belong to sections this task does not touch and are out of scope).

- [ ] **Step 3: Group A checkpoint — both repos green**

Run: `cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l5-tauri" && cargo test -p idl-rs-tauri 2>&1 | grep -E "^test result"`
Expected: every line `0 failed`.

Run: `cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave1-l5-tauri/app" && npm test && npx tsc --noEmit`
Expected: all green, `tsc` clean. This is the point at which Group A is
complete and Group B's gated tasks may start (per-task, as each gate
becomes true — not all at once).

- [ ] **Step 4: CHANGELOG**

`- **docs/IDL0_SPEC.md §11 rewritten for the Tauri/Rust-core/TS architecture (spec-during).** First draft by L5; L10 does the cross-lane consistency pass.`

- [ ] **Step 5: Commit (app repo)**

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app" && git add -A && git commit -m "docs: rewrite SPEC §11 App Architecture for idl1 (spec-during, L5 first draft)"
```

---

## Group B — gated on other lanes, in dependency order, tile task last

Each task below states its own gate. **None of these may start until the
stated gate is true** — check it explicitly (a `git log`/file-content check
against the named lane's plan or `BRIEF.md`, not a time-based assumption,
matching R3's mitigation in `runs/2026-09-03/decisions.md`). As of this
plan's drafting, no `runs/2026-09-03/lanes/l{1,2,3,4}-*/BRIEF.md` exists yet
for any lane — every gate below is therefore unresolved at plan-drafting
time and is re-checked at execution time.

**Sync commands (C3 §3.9) are out of scope for this plan.** L11 (LAN sync)
is a wave-2 lane (design §10/§11); no wave-1 lane produces logic for
`sync_status`/`sync_now`/`pair_peer` to call into. `app/src/ipc/sync.ts`
(Task 5) is typed and ready; the Rust command wrappers are a wave-2 L5 task,
not this plan's.

### Task 8: Catalog commands (L1)

**Gate:** L1's plan `docs/superpowers/plans/2026-09-03-idl1-wave1-l1-store.md`
(exact filename to confirm — L1 is planned by a concurrent agent this same
session) has landed a catalog read module in `rust/core` exporting, at
minimum, functions equivalent to `list_sessions`/`get_session`/`list_laps`/
`rebuild_catalog`/`list_workbooks`/`list_tracks`/`get_track` over the C4 §5
SQLite schema. **Exact module path and function names are an open question**
to confirm against L1's `runs/2026-09-03/lanes/l1-store/BRIEF.md` once it
exists — do not guess a path now.

**Files:**
- Create: `rust/tauri/src/commands/catalog.rs`
- Modify: `rust/tauri/src/lib.rs` (register the seven commands in `handler()`), `rust/tauri/src/error.rs` (add `From<L1's catalog error type>` if L1's functions return their own typed error rather than `IpcError` directly — confirm L1's error type at execution time)

**Interfaces:**
- Consumes: L1's catalog read functions (exact signatures TBD at execution).
- Produces: `#[tauri::command] list_sessions() -> Result<Vec<SessionSummary>, IpcError>` and the other six, matching C3 §3.2's Rust-side argument/return shapes exactly (the JSON field names in C3 §3.2 are `snake_case` and match L1's own struct field names verbatim per C3 §1's "no camelCase rename layer" rule, so `#[derive(Serialize)]` on L1's structs directly, re-exported or wrapped, is expected to need no field renaming — confirm this holds once L1's actual struct exists).

- [ ] **Step 1: Confirm the gate**

Run: `ls "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app/runs/2026-09-03/lanes/l1-store/BRIEF.md" 2>&1` and read it if present; otherwise `git -C rust log --oneline main | grep -i "store\|catalog"` to confirm L1's catalog module has actually landed on `rust`'s `main` (not merely planned). Do not proceed past this step until one of these confirms landed code.

- [ ] **Step 2: Write the failing Rust tests**

One test per command, each: arrange a temp `<data>` directory with a
minimal catalog (reusing whatever test-fixture helper L1's own tests use, if
exported — check L1's module for a `#[cfg(test)]`-only public helper before
writing a new one), act by calling the `#[tauri::command]` function
directly (not through a Tauri runtime — these are plain functions annotated
with the macro, callable in tests exactly like M0's `engine_version`/
`smoke_tile` tests), assert the returned `Vec`/struct matches what was
seeded. Name each `list_sessions_empty_catalog_returns_empty_vec`,
`get_session_unknown_id_returns_not_found`, etc. — `thing — condition —
result` per CLAUDE.md §4.

- [ ] **Step 3: Implement, using `tauri::State<DataDir>` (Task 2) for the `<data>` root**

```rust
#[tauri::command]
pub fn list_sessions(data_dir: tauri::State<idl_rs_tauri::state::DataDir>) -> Result<Vec<idl_core::catalog::SessionSummary>, IpcError> {
    idl_core::catalog::list_sessions(&data_dir.0).map_err(IpcError::from)
}
```
(Illustrative — `idl_core::catalog::list_sessions`'s real path/name/error
type is confirmed at Step 1, not guessed here.)

- [ ] **Step 4: Register and test**

`rust/tauri/src/lib.rs` — add `commands::catalog::{list_sessions, get_session, list_laps, rebuild_catalog, list_workbooks, list_tracks, get_track}` to `generate_handler!`.

Run: `cargo test -p idl-rs-tauri catalog 2>&1 | grep -E "^test result"`
Expected: `0 failed`.

- [ ] **Step 5: Wire the TS side's happy path smoke-check**

`app/src/ipc/catalog.ts` already has the right shape (Task 5) — no code
change expected here unless Step 1's confirmed L1 shape disagrees with C3
§3.2 in a way C3 itself hasn't already reconciled (C3 §6 item 3 documents
that this reconciliation already happened once, signed) — if a genuine new
mismatch appears, stop and report it as a contract question, do not silently
adjust either side.

- [ ] **Step 6: CHANGELOG, commit (both repos)**

`- **Catalog commands (C3 §3.2) wired to L1's store.** list_sessions, get_session, list_laps, rebuild_catalog, list_workbooks, list_tracks, get_track.`

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l5-tauri" && git add -A && git commit -m "tauri: catalog commands (C3 §3.2) over L1's store"
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave1-l5-tauri" && git add -A && git commit -m "docs: changelog for catalog commands"
```

---

### Task 9: Import commands (L2)

**Gate:** L2's plan (`docs/superpowers/plans/2026-09-03-idl1-wave1-l2-importers.md`,
filename to confirm) has landed an `Importer` trait implementation reachable
from `rust/core` producing a `SessionSummary`-shaped result per C1/C3 §3.2,
plus a way to enumerate importer ids/labels/extensions for `list_importers`.
Exact function names: open question, confirm against L2's
`runs/2026-09-03/lanes/l2-importers/BRIEF.md` when it exists.

**Files:**
- Create: `rust/tauri/src/commands/import.rs`
- Modify: `rust/tauri/src/lib.rs`, `rust/tauri/src/error.rs` (add `parse_invalid_magic_bytes`/`parse_unsupported_schema_version`/`parse_truncated_record` `IpcErrorKind` variants and `From<ParseError>` — the first Group B task to need `ParseError`, so this task adds those three variants; L2's SPEC section is the authority on whether `parse_truncated_record` is ever actually raised by `import_file` as a rejection vs. a warning field on success, per C3 open question 6.2, assigned to L2 — read L2's resolution before implementing this command's error mapping, do not assume "always reject")

**Interfaces:**
- Consumes: L2's `Importer` trait / dispatch function (exact path TBD).
- Produces: `#[tauri::command] import_file(path: String, importer_id: Option<String>, progress: Channel<Progress>) -> Result<SessionSummary, IpcError>` streaming `Progress` per C3 §3.3; `list_importers() -> Result<Vec<ImporterInfo>, IpcError>`.

- [ ] **Step 1: Confirm the gate** (same pattern as Task 8 Step 1, against L2's BRIEF/plan)

- [ ] **Step 2: Write the failing Rust tests** — `import_file` against a fixture file per format L2 ships tests for (reuse L2's own fixtures, don't invent new ones); assert `Progress` messages arrive in an expected order via a test `Channel`-equivalent (or, if L2's dispatch function takes a plain progress callback rather than a Tauri `Channel`, assert on that callback directly — the `#[tauri::command]` wrapper's only job is adapting L2's callback shape to `tauri::ipc::Channel<Progress>`, so the callback-adaptation itself is what this layer tests, not import correctness, which is L2's own test suite's job).

- [ ] **Step 3: Implement, following the C3 open question 6.2 resolution confirmed in Step 1**

- [ ] **Step 4: Register and test**

Run: `cargo test -p idl-rs-tauri import 2>&1 | grep -E "^test result"`
Expected: `0 failed`.

- [ ] **Step 5: CHANGELOG, commit (both repos)** — same shape as Task 8 Step 6, message: `- **Import commands (C3 §3.3) wired to L2's importers.** import_file (streams Progress), list_importers.`

---

### Task 10: Device commands (L4)

**Gate:** L4's plan (`docs/superpowers/plans/2026-09-03-idl1-wave1-l4-transport.md`,
filename to confirm) has landed `idl-transport`'s desktop BLE (`btleplug`)
and WiFi transfer/config-push implementations behind concrete functions
(not just the `TransportError` stub from M0). Per C3 open question 6.6,
`ble_scan`'s exact shape (stream-only vs. also a snapshot) is L4's call —
this task follows whatever shape L4's landed code actually exposes, not a
guess made here.

**Files:**
- Create: `rust/tauri/src/commands/device.rs`
- Modify: `rust/tauri/src/lib.rs` (`error.rs` needs no new variants — `ble`/`wifi`/`config` already exist from Task 1's `TransportError` conversion)

**Interfaces:**
- Consumes: L4's BLE/WiFi/config-push functions (exact path TBD).
- Produces: `ble_scan`, `ble_connect`, `list_device_files`, `download_file` (streams `Progress`), `push_config` — C3 §3.8, each `Result<_, IpcError>` via the existing `From<TransportError>` conversion (Task 1) — this task should need **no new error-mapping code**, only argument/return adaptation, since transport errors already convert.

- [ ] **Step 1: Confirm the gate** (against L4's BRIEF/plan/`git log` on `rust` `main`)

- [ ] **Step 2: Write the failing Rust tests** — against L4's own test doubles/mocks if it ships any (a real BLE device is not available in CI; follow whatever fixture strategy L4's own SPEC section documents — read it before inventing one here), or, if L4 tests only against real hardware (plausible for BLE per the design doc's "proven at M2" risk note), this task's tests are limited to argument-shape/error-mapping unit tests with a stubbed transport function, and the real device round-trip is a manual check noted in this task's own CHANGELOG entry rather than an automated test — decide which applies once L4's actual test strategy is visible, don't assume either now.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Register and test**

- [ ] **Step 5: CHANGELOG, commit (both repos)** — message: `- **Device commands (C3 §3.8) wired to L4's idl-transport.** ble_scan, ble_connect, list_device_files, download_file (streams Progress), push_config.`

---

### Task 11: Workbook commands, including full `watch_workbook` wiring (L3)

**Gate:** L3's plan `docs/superpowers/plans/2026-09-03-idl1-wave1-l3-workbook.md`
has landed the `.idl1wb` parser (`pulldown-cmark`-based, C2), cell-id
assignment, and a per-cell evaluator producing `CellOutput`-shaped results
(C3 §3.4), plus a cell-diff function `watch_workbook` needs to turn a raw
external-change path (from Task 3's watcher) into the `cell_ids` a
`WorkbookEvent` names. Exact function names/module: open question, confirm
against L3's `runs/2026-09-03/lanes/l3-workbook/BRIEF.md` when it exists —
until then, treat "L3's plan's workbook-parse/eval task landed" as the
checkable gate (a `git log` on `rust`'s `main` for the commit L3's plan
names as that task's own commit).

**Files:**
- Create: `rust/tauri/src/commands/workbook.rs`
- Modify: `rust/tauri/src/lib.rs`, `rust/tauri/src/error.rs` (add `math_*` `IpcErrorKind` variants — nine, per C3 §2's table — and `From<MathEvalErrorKind>`; add `invalid_argument` usage for `save_workbook`'s malformed-markdown case, already a seeded variant from Task 1)

**Interfaces:**
- Consumes: L3's parse/eval/diff functions (exact path TBD).
- Produces: `open_workbook`, `eval_workbook` (per-cell `CellOutput[]`, command-level rejection only for "no cell evaluable" per C3 §3.4), `save_workbook`, `watch_workbook` (subscribes Task 3's `WorkbookWatcher` for one workbook's path, translates each external-change callback into a `WorkbookEvent` via L3's diff function, sends over the caller's `Channel<WorkbookEvent>`).

- [ ] **Step 1: Confirm the gate**

- [ ] **Step 2: Write the failing Rust tests** for `open_workbook`/`eval_workbook`/`save_workbook` against a fixture `.idl1wb` (reuse L3's own fixture if one is exported for cross-crate tests; otherwise write a minimal one matching C2's grammar, front matter + one math cell + one js cell).

- [ ] **Step 3: Implement `open_workbook`/`eval_workbook`/`save_workbook`**

Per-cell math errors (`math_*` kinds) go into `CellOutput.error`, never the
command's own `Err` — only "no cell evaluable at all" (unknown workbook id,
I/O failure) rejects the command (C3 §3.4). Get this distinction right; it
is the one place in C3 where CLAUDE.md §5's "don't block other channels"
rule has direct command-level shape.

- [ ] **Step 4: Implement `watch_workbook`**

```rust
#[tauri::command]
pub fn watch_workbook(
    id: String,
    channel: tauri::ipc::Channel<WorkbookEvent>,
    data_dir: tauri::State<idl_rs_tauri::state::DataDir>,
    hashes: tauri::State<std::sync::Arc<idl_rs_tauri::watcher::ExpectedHashSet>>,
) -> Result<(), IpcError> {
    let path = /* resolve id -> workbooks/<file_name>.idl1wb, per L3's lookup */;
    if !path.exists() {
        return Err(IpcError::new(IpcErrorKind::NotFound, format!("workbook {id} not found")));
    }
    let workbooks_dir = data_dir.0.join("workbooks");
    let hashes = std::sync::Arc::clone(&hashes);
    let path_for_closure = path.clone();
    let _watcher = idl_rs_tauri::watcher::WorkbookWatcher::new(&workbooks_dir, hashes, move |changed_path| {
        if changed_path != path_for_closure { return; } // this subscription is scoped to one workbook
        let cell_ids = /* L3's diff function: old parse (cached) vs. re-parse of changed_path */;
        let _ = channel.send(WorkbookEvent { kind: "changed".into(), cell_ids });
    })
    .map_err(|e| IpcError::new(IpcErrorKind::Internal, e.to_string()))?;
    // The watcher must outlive this command's returned Future/scope — held in
    // Tauri-managed state keyed by subscription id, dropped when the frontend
    // closes the channel. Exact lifetime-management shape: open question,
    // this task's own design decision at implementation time (Tauri's
    // Channel-close signal and where to park the WorkbookWatcher instance
    // aren't fixed by C3, which only fixes the wire shape).
    Ok(())
}
```
This is illustrative, not literal — the watcher-lifetime management noted in
the comment is a real open design point this task resolves at
implementation time, informed by whatever pattern L6 (which calls
`watch_workbook` from the notebook UI, wave 2) will need.

- [ ] **Step 5: Register and test**

Run: `cargo test -p idl-rs-tauri workbook 2>&1 | grep -E "^test result"`
Expected: `0 failed`.

- [ ] **Step 6: CHANGELOG, commit (both repos)** — message: `- **Workbook commands (C3 §3.4) wired to L3's parser/evaluator.** open_workbook, eval_workbook (per-cell CellOutput), save_workbook, watch_workbook (full watcher wiring — Task 3's plumbing + L3's cell diff).`

---

### Task 12: Cursor command (L3)

**Gate:** L3's plan has landed a channel-interpolation/nearest-value lookup
function over `data.parquet` at an arbitrary `t_us`. Exact path: open
question, same confirmation pattern as Task 11.

**Files:**
- Create: `rust/tauri/src/commands/cursor.rs`
- Modify: `rust/tauri/src/lib.rs`

**Interfaces:**
- Consumes: L3's per-channel value-at-time lookup.
- Produces: `cursor_readout(session_id, channels, t_us) -> Result<CursorReadout, IpcError>` (C3 §3.7) — one atomic answer, not partially returned on a bad channel name (`invalid_argument` with `detail.channel`, per C3 §3.7's explicit note this is *not* the "don't block other channels" rule).

- [ ] **Step 1: Confirm the gate**
- [ ] **Step 2: Write the failing Rust tests** — including the "unknown channel in the list rejects the whole call" case (the one place this command's error handling differs from `eval_workbook`'s per-cell tolerance — test it explicitly so the distinction doesn't silently drift).
- [ ] **Step 3: Implement**
- [ ] **Step 4: Register and test**

Run: `cargo test -p idl-rs-tauri cursor 2>&1 | grep -E "^test result"`
Expected: `0 failed`.

- [ ] **Step 5: CHANGELOG, commit (both repos)** — message: `- **Cursor command (C3 §3.7) wired to L3.** cursor_readout — settle-bound only, never a hot path (C3 §4).`

---

### Task 13: Raster command (L3)

**Gate:** L3's plan has landed spectrogram/2-D-histogram raster computation
functions AND has resolved C3 open question 6.4 (pinning
`SpectrogramParams`/`Histogram2dParams` in place of the generic
`Record<string, number>` bag) — this task's `params` handling follows
whatever L3 actually pinned, not the provisional generic shape Task 4 left
in `rasters.ts`. If L3 has not yet resolved 6.4 when this task's gate
otherwise becomes true, this task blocks on that specific sub-resolution and
is not satisfied by L3 merely landing *some* raster function.

**Files:**
- Create: `rust/tauri/src/commands/rasters.rs`
- Modify: `rust/tauri/src/lib.rs`, `app/src/ipc/rasters.ts` (replace the generic `params: Record<string, number>` signature with the pinned per-kind param types once 6.4 resolves — this is the one place this plan's own Task 4 output is expected to change again, flagged there implicitly by "provisional")

**Interfaces:**
- Consumes: L3's raster functions (exact path TBD).
- Produces: `fetch_raster(session_id, channel, kind, width, height, params) -> Result<Response, IpcError>` per C3 §3.6's binary layout (already fully implemented TS-side in Task 4 — this task is the Rust side only, plus the `params` type-shape follow-up above).

- [ ] **Step 1: Confirm the gate (including the 6.4 sub-resolution)**
- [ ] **Step 2: Write the failing Rust tests** — construct a small synthetic channel, request a raster, assert the returned bytes' header fields and total length match the formula in C3 §3.6 for the requested width/height.
- [ ] **Step 3: Implement**
- [ ] **Step 4: Update `rasters.ts`'s `params` typing to match L3's pinned shape; update/extend `rasters.test.ts` if the pinned shape changes anything the existing tests assert (the binary-decode tests from Task 4 do not change — only `fetchRaster`'s argument type does)**
- [ ] **Step 5: Register, test both sides**

Run: `cargo test -p idl-rs-tauri raster 2>&1 | grep -E "^test result"` and `npm test`.
Expected: both `0 failed` / all green.

- [ ] **Step 6: CHANGELOG, commit (both repos)** — message: `- **Raster command (C3 §3.6) wired to L3.** fetch_raster; params typed per L3's resolution of C3 open question 6.4.`

---

### Task 14: Tile command and minimal end-to-end render — LAST

**Gate:** L3's plan `docs/superpowers/plans/2026-09-03-idl1-wave1-l3-workbook.md`
has landed `decimate_channel`-backed tile production over a real (or
fixture) `data.parquet`, reachable from `rust/core` at tier/tile-index
granularity (C1 §4 layout, `chart_decimation.rs` per C3's own "consumes"
line). This is this plan's **last task** by explicit instruction: the lane's
"a tile fetched and rendered end-to-end" done-criterion is proven here, not
before.

**Files:**
- Create: `rust/tauri/src/commands/tiles.rs`
- Modify: `rust/tauri/src/lib.rs`, `app/src/App.tsx` or a new `app/src/routes/pages/NotebookPage.tsx` (whichever the implementer judges clearer — the rendering is intentionally minimal, not L6's real chart), `app/src-tauri/src/lib.rs` (remove `commands::smoke_tile` from `generate_handler!`)
- Delete: `rust/tauri/src/commands.rs`'s `smoke_tile`/`encode_f32_le` (superseded, C3 header says so explicitly), `app/src/ipc/_m0_smoke.ts`
- Modify: `rust/tauri/src/commands.rs` (keep `engine_version`, since it's unchanged and still lives there per M0 — or move it into `commands/engine.rs` alongside the new `commands/` submodule structure Tasks 8–13 introduced, for consistency; implementer's call, noted so it isn't silently inconsistent with the rest of `commands/`)

**Interfaces:**
- Consumes: L3's tile-production function (exact path TBD).
- Produces: `fetch_tile(session_id, channel, tier, tile_index) -> Result<Response, IpcError>` per C3 §3.5 — the real layout Task 4 already decodes TS-side. A minimal render: fetch tier-0 tile 0 for a fixture/test session's first channel on `NotebookPage` mount, draw the sample-region min/max envelope as a `<canvas>` polyline (not Observable Plot — that's L6's whole lane; this is proof the bytes arrived and decode correctly, nothing more).

- [ ] **Step 1: Confirm the gate**

- [ ] **Step 2: Write the failing Rust test** — request a tile for a known synthetic/fixture channel, assert the header fields (`magic`, `version`, `tier`, `tile_index`, `sample_count`, `column_count`) and total byte length match C3 §3.5's formula for the request made.

- [ ] **Step 3: Implement `fetch_tile`**

```rust
#[tauri::command]
pub fn fetch_tile(
    session_id: String,
    channel: String,
    tier: u32,
    tile_index: u32,
    data_dir: tauri::State<idl_rs_tauri::state::DataDir>,
) -> Result<tauri::ipc::Response, IpcError> {
    let bytes = /* L3's tile-production function, exact call TBD at execution */
        .map_err(IpcError::from)?;
    Ok(tauri::ipc::Response::new(bytes))
}
```

- [ ] **Step 4: Retire the M0 smoke path**

Delete `smoke_tile`/`encode_f32_le` from `rust/tauri/src/commands.rs` (or
wherever Task 8–13's `commands/` restructuring left `engine_version` — see
this task's Files note) and its registration in `lib.rs`. Delete
`app/src/ipc/_m0_smoke.ts`. Remove any remaining `fetchSmokeTile`/
`decodeSmokeTile` usage in `App.tsx`/`SettingsPage.tsx` (Task 6 parked the
debug affordance there through this point).

- [ ] **Step 5: Minimal render**

`app/src/routes/pages/NotebookPage.tsx`:
```tsx
import { useEffect, useRef } from "react";
import { fetchTile } from "../../ipc/tiles";

/** Placeholder notebook view. Proves fetch_tile end-to-end with a bare
 *  <canvas> min/max polyline — L6 replaces this with the real sandboxed
 *  Observable Plot cell rendering. */
export default function NotebookPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Fixture session/channel: whatever L3's own test fixture names —
    // confirmed at implementation time, not invented here.
    fetchTile("FIXTURE_SESSION_ID", "FIXTURE_CHANNEL", 0, 0).then((tile) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const n = tile.sampleMin.length;
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < n; i++) { min = Math.min(min, tile.sampleMin[i]); max = Math.max(max, tile.sampleMax[i]); }
      const scaleY = (v: number) => canvas.height - ((v - min) / (max - min || 1)) * canvas.height;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = (i / n) * canvas.width;
        ctx.lineTo(x, scaleY(tile.sampleMax[i]));
      }
      ctx.stroke();
    });
  }, []);

  return <canvas ref={canvasRef} width={600} height={200} />;
}
```

- [ ] **Step 6: Manual check (Isaac, required before this task is marked done)**

`npm run tauri dev` shows the Notebook tab with a rendered polyline (not a
blank canvas, not an error). If the fixture session/channel doesn't exist
on the machine running the check, this step blocks — report it rather than
shipping a task whose done-criterion wasn't actually observed, per this
plan's own standard (M0 Task 5's precedent: "do not fall back to JSON," i.e.
do not quietly downgrade the proof).

- [ ] **Step 7: Full test suite, both repos**

Run: `cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l5-tauri" && cargo test --workspace 2>&1 | grep -E "^test result"`
Expected: every line `0 failed`.

Run: `cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave1-l5-tauri/app" && npm test && npx tsc --noEmit`
Expected: all green, `tsc` clean.

- [ ] **Step 8: TASKS.md and CHANGELOG — lane complete**

Tick `- [ ] L5 Tauri scaffold hardening` to `- [x]` in `TASKS.md`.

Append to `CHANGELOG.md` under `[Unreleased] / ### Added`:
```markdown
- **L5 complete (<date>).** idl-rs-tauri wired to every wave-1 lane's C3
  command group (catalog/import/device/workbook/cursor/raster/tile);
  <data> resolution, workbook watcher, app/src/ipc/ module layer, routing
  and state skeleton. Tile fetched and rendered end-to-end; M0 smoke path
  retired.
```

- [ ] **Step 9: Commit (both repos)**

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l5-tauri" && git add -A && git commit -m "tauri: fetch_tile (C3 §3.5) wired to L3; retire M0 smoke_tile"
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave1-l5-tauri" && git add -A && git commit -m "app: end-to-end tile render on NotebookPage; L5 wave-1 done"
```

---

## Open questions

Per CLAUDE.md §1, assigned rather than silently resolved. C3 §6 already
carries several open items assigned elsewhere (export commands, raster
params shape — tracked as a Task 13 gate above, not relitigated — `flags`
bits, `ble_scan` shape, several naming items); not repeated here except
where this plan's own tasks touch them directly (Task 13's gate note).

1. **Routing/state libraries are unpinned.** The M0 ecosystem report's
   Versions table (§1) does not include a router or a state-management
   library. Rather than guess a version, this plan builds both on React's
   own APIs (Tasks 5–6: a hand-rolled `RouteId` switch, `Context` +
   `useReducer`) — a genuine recommendation for a four-tab desktop/mobile
   shell with no deep nested routes, not merely a stopgap. Whether L6's
   notebook reactive DAG (design §4) later needs `react-router-dom` and/or a
   heavier state library (Zustand, Jotai) is **L6's decision**, made against
   a real ecosystem-report addendum with a pin — not guessed here. Owner:
   L6, at its own planning time.
2. **Dev-only Rust crate versions not in the ecosystem report** (`tempfile`,
   `sha2`, `hex` — Tasks 2–3). The ecosystem report's scope (M0 Task 1) did
   not include these; `notify` and `serde`/`serde_json` are pinned, so the
   watcher/paths tasks are not fully unpinned, only these three small
   dev/utility crates. Owner: the implementer resolves via `cargo add` at
   execution time and records the resolved version in the commit message,
   per this plan's Task 2/3 notes — flagged here rather than silently
   guessed, since CLAUDE.md's "do not guess versions" discipline is about
   not fabricating a version string, which recording the actual resolved
   one satisfies.
3. **`.setup()` failure handling** (Task 2): resolving `<data>` currently
   panics on failure, before any window exists. Per-command `IpcError`
   discipline (C3 §2) doesn't reach this far — `.setup()` runs before any
   command is ever called. A native error dialog (or a fallback in-memory
   `<data>` with a banner) is better UX but not specified anywhere and not
   attempted by this plan. Owner: lead — decide whether this deserves its
   own contract note or is acceptable as a known M0-carried-forward gap.
4. **Group B commands' exact backing-lane function names/paths.** Every
   Task 8–14 gate says "confirm against `<lane>`'s BRIEF.md/plan at
   execution time" because no `runs/2026-09-03/lanes/l{1,2,3,4}-*/BRIEF.md`
   exists as of this plan's drafting (only `runs/2026-09-03/decisions.md`).
   This is expected — those lanes' plans are being drafted concurrently
   this same session (per the orchestrating message naming
   `wave1-l1-plan`/`l2`/`l3`/`l4` as sibling agents) — and does not block
   Group A. Owner: each Group B task's own Step 1, re-checked at execution.
5. **`watch_workbook`'s watcher-instance lifetime management** (Task 11
   Step 4): Tauri's `Channel` close signal and where a live
   `WorkbookWatcher` parks between the subscribing call and unsubscribe
   aren't fixed by C3 (a wire-shape contract, not an implementation-detail
   one). Owner: Task 11's own implementer, informed by L6's actual calling
   pattern once L6's plan exists (wave 2) — flagged so it isn't invented
   twice.
