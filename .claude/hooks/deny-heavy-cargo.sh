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
m 'git[[:space:]]+([^"\\;&|]*[[:space:]])?push\b' \
  && deny "CLAUDE.md §7: never git push; Isaac pushes"
exit 0
