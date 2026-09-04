# Review — Task 10: `store/derived.rs` (C1 §5 hash recipe + writer)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store`, branch
`wave1-l1-store`, commit `5e82ad0` (on top of `9f5f62f`).

## Test command and result

```
cd C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store
cargo test -p idl-rs store::derived
```

```
running 4 tests
test store::derived::tests::derived_input_hash_is_deterministic_and_sensitive_to_every_component ... ok
test store::derived::tests::derived_file_hash_is_order_independent_in_input_list_but_sorted_internally ... ok
test store::derived::tests::canonical_config_json_sorts_nested_object_keys ... ok
test store::derived::tests::write_derived_parquet_same_hash_content_second_write_is_a_no_op ... ok

test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 616 filtered out; finished in 0.01s
```
Reproduced, 4/4 pass.

## Independent hash re-derivation

Wrote an independent Python implementation of C1 §5's recipe from the contract text alone
(hashlib/struct, not from the implementer's Rust), see
`C:\Users\isaac\AppData\Local\Temp\claude\C--Users-isaac-Documents-Saucy-saucyeng-idl1-app\ab5a9ee3-fdf7-4494-9f91-4a1d5a4c72c8\scratchpad\verify_hash.py`.

- `derived_input_hash("Fork travel (mm)", [0,1000,2000], [1.0,2.0,3.0])` → my result:
  `dd51f3de3b94be04f7f83ec3867d8c0740a62dcda09e727bb70a4a72a0b27d0` — **matches** claimed
  `dd51f3de...`.
- `derived_file_hash` over inputs `A`/`B` (column hashes from the same recipe), `config_json_bytes
  = b"{}"`, `engine_version = "0.1.0"`, both input orderings → my result:
  `8acb1dde36d5fb8a70237b7b2f1d5626d9dd224e82d1d9fe0e13e99de3123a5` — **matches** claimed
  `8acb1dde...`, and is identical for both `[A,B]` and `[B,A]` input order (confirms the
  sort-before-hash step).

**Independent hash re-derivation: MATCHED on both cases.** The three pure hash functions
(`derived_input_hash`, `derived_file_hash`, `canonical_config_json`) are byte-exact-correct
against C1 §5 as written.

Also confirmed the `serde_json` canonical-ordering claim against the pinned version rather than
assuming it: `Cargo.lock` pins `serde_json 1.0.150` with dependencies `itoa, memchr, serde,
serde_core, zmij` — no `indexmap`, so `preserve_order` is not enabled and `serde_json::Value`'s
`Map` is `BTreeMap`-backed (ascending key order), matching the doc comment's claim. The
`canonical_config_json_sorts_nested_object_keys` test exercises this directly and passes.

## Critical finding: file metadata is silently dropped (writer bug, not hash-recipe bug)

`write_derived_parquet`'s metadata-building loop (`core/src/store/derived.rs`, current lines
~194–203) calls `WriterProperties::builder().set_key_value_metadata(...)` **once per key, inside
a `for` loop**, each call passing a fresh single-element `Vec`. `parquet` 59.3.0's
`set_key_value_metadata` (`parquet-59.3.0/src/file/properties.rs:812-815`) is a plain replace —
`self.key_value_metadata = value` — not an append/merge. So each loop iteration **overwrites**
the previous one; only the *last* key-value pair set (`computed_at_utc_ms`) survives into the
built `WriterProperties`, and hence into the written Parquet file's key-value metadata.

Verified empirically with a standalone reproduction (same `parquet` version, same loop pattern,
outside the reviewed source):

```
Some([KeyValue { key: "computed_at_utc_ms", value: Some("999") }])
```

`derived_kind`, `inputs`, `config_json`, and `engine_version` — all four required "Always" by C1
§5's file-metadata table — are silently absent from every `derived/<hash>.parquet` file this
writer produces. None of the four tests catch this because none of them read back the written
file's key-value metadata; the only writer test (`write_derived_parquet_same_hash_content_...`)
only checks path/mtime behaviour.

Fix: build the full `Vec<KeyValue>` first, then call `set_key_value_metadata` once with the whole
vector — e.g.

```rust
let kvs = vec![
    KeyValue::new("derived_kind".to_string(), derived_kind.to_string()),
    KeyValue::new("inputs".to_string(), inputs_json),
    KeyValue::new("config_json".to_string(), String::from_utf8_lossy(&config_json_bytes).into_owned()),
    KeyValue::new("engine_version".to_string(), crate::VERSION.to_string()),
    KeyValue::new("computed_at_utc_ms".to_string(), computed_at_utc_ms.to_string()),
];
let props = WriterProperties::builder().set_key_value_metadata(Some(kvs)).build();
```

## Important finding: `inputs` metadata value not written in canonical (sorted) order

Separately from the above (this would surface once the metadata-overwrite bug is fixed):
`inputs_json` is built by iterating the caller-supplied `inputs` slice in its original order
(`core/src/store/derived.rs`, `let inputs_json = { ... inputs.iter() ... }`), while
`derived_file_hash` sorts its own internal copy (`sorted = inputs.to_vec(); sorted.sort_by(...)`)
before hashing. C1 §5's table requires the `inputs` metadata value to be "in the same canonical
order used to compute the file hash" — i.e. sorted by `channel_id` ascending — "so a consumer can
verify/re-derive without re-hashing every input [in file order]". If a caller passes `inputs`
already sorted this is invisible, but the function does not enforce or guarantee that; a consumer
trusting file-order-as-canonical-order would compute the wrong hash when verifying. No test
exercises `write_derived_parquet` with more than one, already-sorted input, so this gap is
untested.

Fix: sort a local copy of `inputs` by `channel_id` once (or reuse the sorted copy from
`derived_file_hash`, e.g. by having it return the sorted order or a shared helper) before building
`inputs_json`.

## Other checks

| Item | Result |
|---|---|
| `cargo test -p idl-rs store::derived` | 4/4 pass, reproduced |
| No AI attribution trailer | Confirmed — `git log -1 --format="%(trailers)" 5e82ad0` empty |
| No `cargo fmt` run | Confirmed — diff touches only `core/src/store/derived.rs` (new) and one added line in `core/src/store/mod.rs`; no reflow elsewhere |
| Shared checkout `...\idl1-app\rust` clean, on `main` | Confirmed — `git status` clean, `git branch --show-current` = `main` |
| Leftover debug/print code before commit | None found — `grep -n "println!|dbg!|eprintln!|TODO|FIXME|XXX"` on the committed file returns nothing |
| Doc comments on public symbols | Present and good (better than the plan's own draft in a couple of spots — plan's draft omitted per-variant doc comments on `DerivedStoreErrorKind`/fields; the committed code adds them) |
| Typed errors (`DerivedStoreError`, never `Err(String)`) | Followed |
| Layer placement | Correct — `core/src/store/`, pure, no Tauri/async/network |

## Findings table

| Severity | File:line | Finding | Fix |
|---|---|---|---|
| Critical | `core/src/store/derived.rs:194-203` (approx., the `for (k, v) in [...]` metadata loop in `write_derived_parquet`) | `set_key_value_metadata` is called once per key inside a loop; each call *replaces* rather than merges the file's key-value metadata (confirmed against `parquet` 59.3.0 source and by standalone reproduction), so only the last key (`computed_at_utc_ms`) survives — `derived_kind`, `inputs`, `config_json`, `engine_version` are silently absent from every written file, violating C1 §5's file-metadata table ("Always" present) | Build one `Vec<KeyValue>` with all five entries and call `set_key_value_metadata` once |
| Important | `core/src/store/derived.rs` (`inputs_json` construction in `write_derived_parquet`) | `inputs_json` is built from the caller's original (possibly-unsorted) `inputs` order, not the channel_id-sorted order used internally by `derived_file_hash`, contradicting C1 §5's "same canonical order used to compute the file hash" requirement for the `inputs` metadata value | Sort a local copy of `inputs` by `channel_id` before building `inputs_json` (or share the sorted vec `derived_file_hash` already computes) |
| Minor | `core/src/store/derived.rs` (writer test coverage) | No test reads back a written file's key-value metadata or the `inputs` field's contents/order — the two bugs above are both invisible to the existing 4 tests | Add a test that opens the written parquet with `parquet::file::reader` and asserts all five file-metadata keys are present with expected values, including `inputs` order for a multi-input, out-of-order call |

## Verdict

**NEEDS-REWORK** — the C1 §5 hash recipe itself is byte-exact correct (independent Python
re-derivation matched both claimed digests, in both directions), but the writer has a real,
verified bug: the per-key `set_key_value_metadata` loop drops four of the five required
file-metadata keys from every derived Parquet file it writes, which the task's own tests do not
catch.
