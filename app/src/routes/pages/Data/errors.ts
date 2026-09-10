/** Shape of a rejected `invoke` call, as documented by C3 §2. Structurally
 *  checked at the boundary — the frontend never imports a shared `IpcError`
 *  type, it narrows `unknown` itself (C3 §2). */
interface IpcErrorLike {
  kind: string;
  message: string;
  detail?: Record<string, unknown>;
}

/** User-facing description of a failed command. The one place a rejected
 *  `invoke` becomes text a viewer reads — every call site routes on `kind`,
 *  never on `message` (CLAUDE.md §5). */
export interface DescribedError {
  /** The `IpcError.kind` this was derived from, or a synthetic marker
   *  ("unknown") when the rejection wasn't an `IpcError` at all. */
  kind: string;
  /** Human-readable text, safe to render directly. */
  text: string;
  /** Whether retrying the same action might succeed without other changes
   *  (e.g. a transient I/O failure) versus a condition the user must fix
   *  first (e.g. a missing entity). */
  retryable: boolean;
}

function isIpcErrorLike(e: unknown): e is IpcErrorLike {
  return (
    typeof e === "object" &&
    e !== null &&
    "kind" in e &&
    typeof (e as { kind: unknown }).kind === "string" &&
    "message" in e &&
    typeof (e as { message: unknown }).message === "string"
  );
}

/** The Data tab's slice of the C3 §2 kind vocabulary. Kinds are
 *  additive-only (C3 §5) — any kind not listed here falls through to the
 *  default arm below rather than throwing. */
const KNOWN_KINDS: Record<string, { text: string; retryable: boolean }> = {
  not_found: { text: "That item was not found.", retryable: false },
  invalid_argument: { text: "That request was invalid.", retryable: false },
  io: {
    text: "A file could not be read. Try rebuilding the catalog.",
    retryable: true,
  },
  internal: { text: "Something went wrong internally.", retryable: false },
  conflict: {
    text: "This file changed elsewhere. Reload before retrying.",
    retryable: false,
  },
  import_fit_malformed: {
    text: "This FIT file is malformed and could not be imported.",
    retryable: false,
  },
  import_gpx_malformed_xml: {
    text: "This GPX file is not well-formed XML.",
    retryable: false,
  },
  import_gpx_no_trackpoints: {
    text: "This GPX file has no track points.",
    retryable: false,
  },
  import_gpx_missing_lat_lon: {
    text: "This GPX file has a track point missing latitude or longitude.",
    retryable: false,
  },
  import_gpx_unparseable_lat_lon: {
    text: "This GPX file has a track point with an unreadable coordinate.",
    retryable: false,
  },
  import_csv_malformed: {
    text: "This CSV file has a missing or malformed header, or no data rows.",
    retryable: false,
  },
  import_not_utf8: {
    text: "This file is not valid UTF-8 text.",
    retryable: false,
  },
  parse_invalid_magic_bytes: {
    text: "This file is not a recognised idl0 log.",
    retryable: false,
  },
  parse_unsupported_schema_version: {
    text: "This idl0 log uses an unsupported schema version.",
    retryable: false,
  },
  parse_truncated_record: {
    text: "This idl0 log is truncated; some data may be missing.",
    retryable: false,
  },
  unsupported_platform: {
    text: "This feature is not available on this platform.",
    retryable: false,
  },
};

/** Generic text for a kind this build of the frontend has never seen —
 *  C3 §5 promises kinds are additive-only, so this must never throw. */
const UNKNOWN_KIND_FALLBACK = {
  text: "Something went wrong.",
  retryable: false,
};

/** `invalid_argument`'s `detail.field` (`save_track`'s validation failures
 *  attach `{ field: string }`, `rust/tauri/src/commands/catalog.rs`) names
 *  which submitted field was rejected — read structurally, never trusted
 *  to be present or a string, since `detail`'s shape isn't part of the
 *  kind contract (review `review-shell-data-writes.md` Minor: previously
 *  never read at all, so every `save_track` validation failure reached the
 *  banner as an undifferentiated "That request was invalid."). */
function invalidArgumentFieldName(detail: Record<string, unknown> | undefined): string | null {
  const field = detail?.field;
  return typeof field === "string" && field.length > 0 ? field : null;
}

/** Maps a rejected `invoke` value to user-facing text. Never throws,
 *  regardless of what `e` is (C3 §5: kinds are additive; a value that isn't
 *  even an `IpcError` still gets a generic message). Routes on `kind`, never
 *  `message` (CLAUDE.md §5); `invalid_argument` additionally reads the
 *  structured `detail.field` (not free-text `message`) to name the
 *  rejected field, when the caller supplied one. */
export function describeIpcError(e: unknown): DescribedError {
  if (!isIpcErrorLike(e)) {
    return { kind: "unknown", text: UNKNOWN_KIND_FALLBACK.text, retryable: false };
  }

  const known = KNOWN_KINDS[e.kind];
  if (known === undefined) {
    return { kind: e.kind, text: UNKNOWN_KIND_FALLBACK.text, retryable: false };
  }

  if (e.kind === "invalid_argument") {
    const field = invalidArgumentFieldName(e.detail);
    if (field !== null) {
      return { kind: e.kind, text: `That request was invalid: check "${field}".`, retryable: known.retryable };
    }
  }

  return { kind: e.kind, text: known.text, retryable: known.retryable };
}
