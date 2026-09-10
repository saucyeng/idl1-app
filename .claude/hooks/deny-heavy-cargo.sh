#!/usr/bin/env bash
# PreToolUse hook (Bash|PowerShell): mechanically enforce CLAUDE.md §8 compute
# rules and §7 "never push". Reads the tool-call JSON on stdin and matches the
# raw command text (no jq dependency). A forbidden invocation must sit at the
# START of a command segment (line start, `;`, `&&`, `||`, `|`, `(`) so that
# prose merely mentioning a command — commit messages, heredocs, echo — is not
# denied. In the JSON payload a newline is the two characters `\n`.
input="$(cat)"
SEG='(^|"command":"|[;&|(]|\\n)[[:space:]]*'
deny() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$1"
  exit 0
}
m() { printf '%s' "$input" | grep -Eq "$SEG$1"; }

m 'cargo[[:space:]]+test[^"\\;&|]*--workspace' \
  && deny "CLAUDE.md §8: never cargo test --workspace (builds the Tauri graph); use -p idl-rs -p idl-rs-cli"
m 'cargo[[:space:]]+fmt\b' \
  && deny "CLAUDE.md §7/§8: never cargo fmt (idl-rs is not rustfmt-formatted)"
m 'cargo[[:space:]]+tarpaulin\b' \
  && deny "CLAUDE.md §8: no cargo tarpaulin inside a task"
m 'cargo[[:space:]]+doc\b' \
  && deny "CLAUDE.md §8: no cargo doc inside a task"
m 'cargo[[:space:]]+[^"\\;&|]*([[:space:]]-j[[:space:]]*[0-9]|[[:space:]]--jobs\b)' \
  && deny "CLAUDE.md §8: never override cargo jobs (-j/--jobs); machine-wide cap applies"
# A bare `cargo test`/`build`/`check` with no -p/--package is workspace-wide in
# this virtual manifest -- it builds the Tauri graph, exactly what --workspace
# was denied for. Caught 2026-09-05 after an implementer ran bare `cargo test`
# alongside the L5 merge gate: two cargo processes, 1.5 GB free, no denial.
if printf '%s' "$input" | grep -Eq "$SEG"'cargo[[:space:]]+(test|build|check)([[:space:]]|"|$)'    && ! printf '%s' "$input" | grep -Eq '(^|[[:space:]])(-p|--package)([[:space:]]|=)'; then
  deny "CLAUDE.md §8: a bare cargo test/build/check is workspace-wide here (builds the Tauri graph). Name the package: -p idl-rs [-p idl-rs-cli]"
fi

# Wave 2 UI lanes (worktrees named wave2-l6*/wave2-l7*) are TypeScript-only:
# no cargo invocation of any kind from them (WAVE2-OPERATING-BRIEF.md §4).
# Matches either the hook's cwd or a path in the command text.
if printf '%s' "$input" | grep -Eq "$SEG"'cargo([[:space:]]|"|$)'    && printf '%s' "$input" | grep -Eq 'idl1-app-worktrees[/\]+wave2-l[67]'; then
  deny "Wave 2 UI lanes are TypeScript-only: no cargo from a wave2-l6/l7 worktree (WAVE2-OPERATING-BRIEF.md §4). Gate is: npx tsc --noEmit && npx vitest run <filter>"
fi
exit 0
