# idl1 app

The Tauri v2 + React/TypeScript frontend for idl1. Talks only to `idl-rs-tauri` commands
(`rust/tauri/`) — never to `idl-rs` or `idl-transport` directly (CLAUDE.md §2).

**Status:** M0 scaffold. See the repository root `README.md` for project status and
`../CLAUDE.md` for the layer rules this crate lives under.

## Develop

    npm install
    npm run tauri dev

## Test

    npm test

## Recommended IDE setup

[VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
