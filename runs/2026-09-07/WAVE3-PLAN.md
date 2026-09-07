# Wave 3 plan (R114)

Source: `runs/2026-09-06/ui/UI-DIRECTION.md` (1–37) and
`runs/2026-09-07/ui/UI-DIRECTION-2.md` (38–89). Rulings R110–R114.
Every lane is spec-first or spec-during, declared in its brief.

## W3.1 — Foundations (must land first)

| Lane | Scope | Gates |
|---|---|---|
| **S1 selection** | R111: `Selection` becomes an ordered list of `{ sessionId, lapContext, colour }`; empty = nothing selected (48). C1/C3 change; evaluation scoped to a set. Data-tab colour picker (84). | Rust: `cargo test -p idl-rs -p idl-rs-cli`. TS: full suite. |
| **S2 n-D spec** | R110: value-shape type in the math language — shapes, which operators accept which, how a chart slices a matrix. C2 SPEC section only, **no code**. Worked example: spectrogram → peak-frequency line. | Lead review; no build. |

S1 and S2 are independent and may run together (S2 writes no code, so it
does not take the cargo slot).

## W3.2 — The two big lanes (after W3.1)

| Lane | Scope | Depends on |
|---|---|---|
| **M maths graph** | 38–45c, 82, 83: node cards, ports, status glyphs, subgraphs (43), search + minimap (42), properties-column details pane (45a), file mapping (45b), node→chart in two gestures (83). Graph is an editor over math cells; the file stays truth (40). | S2 (shapes), S1 (scoping) |
| **T time & cursors** | 51–57: shared X per worksheet, master timeline with boundary cursors, per-chart Y, worksheet-level time/distance, cursor value card, hover/click/drag verbs, playback with speeds and the two window modes. | S1 (multi-session alignment) |

## W3.3 — Cross-cutting

| Lane | Scope |
|---|---|
| **E errors & staleness** | 58–63: empty slot + message + Fix button, greyed-with-spinner staleness, gap/burst hatching (60, soft), selection-empties-everything (61), version-change banner (62), inline `${…}` error marker (63). |
| **D device** | 64–70, 86, 87: real device picker, N simultaneous recordings, one-tap switching, auto-connect on launch, filtered HRM search, mode-read before push, all-six-or-nothing IMU channels, drop the calibration panel (67), live status limited to per-IMU OK + satellite count + duration. R113's `LoggingElapsed` reader with client-side fallback. **Gate: philosophy 73 — the field loop's click count must not increase; a brief that adds a step is rejected.** |

## W3.4 — Season-scale

| Lane | Scope |
|---|---|
| **B bike sheet & calibration** | 74, 78–81: versioned bike-sheet instance tied to every session and an input node to the graph (79); calibration wizard (~10 s static hold) with bad-cal detection and the buried re-apply path (78), resolved per R112 via `config_crc32`; metadata prompted as soon as the session exists (80); venue as named point + radius, auto-assigned (88); as few files as possible (81). |
| **R report** | 85, 89: PDF of the notebook's paper register for rider/mechanic, phone-readable; Analyze (50) runs the workbook against a new session and produces it, with visible progress. Last because it renders a register every earlier stage moves. |

## Standing constraints carried into wave 3
- Philosophy 71–77 are review criteria, not aspirations: a brief that risks
  a recording (71), adds a field-loop step (73), or makes a workbook
  non-durable across updates (75) is rejected at dispatch.
- R113's firmware line is Isaac's to schedule; no lane blocks on it.
- Mobile: Properties form and code pane in a sheet; graph canvas is
  desktop-only (77 vs round-1 29).

## Open, needs Isaac
- Firmware: schedule `LoggingElapsed: N` in the §7.3 status payload (R113).
- `runs/2026-09-05/QUESTIONS-FOR-ISAAC.md` items 1–10 (hardware/firmware
  facts; several block SPEC sections).
