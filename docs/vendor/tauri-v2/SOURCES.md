# Sources — tauri-v2

Fetched 2026-09-05 directly from the live docs site (no version-tagged snapshot is offered;
the pin is `tauri` `2.11.5` / `@tauri-apps/api` `^2.11.1`, and the fetched content is generated
from the current `v2.tauri.app` source, which tracks the 2.x line these pins belong to).

| file | source URL | notes |
| --- | --- | --- |
| `llms.txt` | https://v2.tauri.app/llms.txt | Top-level index describing the doc sections and linking to the other `llms-*.txt` variants. |
| `llms-small.txt` | https://v2.tauri.app/llms-small.txt | The "abridged" full-text doc dump (~1.9 MB) — non-essential content removed, per the site's own description. This single file already contains everything the brief asked for by name: "Calling Rust from the Frontend" (`invoke`, `Channel`), `tauri::ipc::Response` for binary responses, the `fs`/`dialog`/`opener` plugin JS APIs, and the `path` module (`appDataDir`, `appConfigDir`) — confirmed by grepping the file for each topic, so no separate per-page fetches were needed. |

Did not fetch `llms-full.txt` (the complete, multi-megabyte variant) — the brief explicitly asked
for the compact variant instead.

All fetches succeeded on the first try.
