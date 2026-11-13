//! `wire-golden --out <dir>` — regenerates the cross-language wire golden
//! fixtures (ruling R236): one `<format>-v<n>.bin` / `.json` pair per binary
//! IPC format, built by [`idl1_bridge::wire_golden::build_wire_fixtures`].
//! CI runs it and then `git diff --exit-code` over the output directory, so
//! the output has to be byte-stable: the JSON is pretty-printed with `\n`
//! line endings only and a trailing newline.

use std::fmt;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use idl1_bridge::wire_golden::build_wire_fixtures;

/// Why writing the fixtures failed.
#[derive(Debug)]
enum WireGoldenError {
    /// A directory could not be created or a file could not be written.
    Io {
        /// The path being created or written.
        path: PathBuf,
        /// The underlying failure.
        source: std::io::Error,
    },
    /// A fixture's JSON expectation could not be serialised.
    Json(serde_json::Error),
}

impl fmt::Display for WireGoldenError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io { path, source } => write!(f, "writing {}: {source}", path.display()),
            Self::Json(e) => write!(f, "serialising a fixture: {e}"),
        }
    }
}

impl std::error::Error for WireGoldenError {}

/// Writes every [`build_wire_fixtures`] fixture to `out` as a `.bin`/`.json`
/// pair, returning how many fixtures were written. `out` is created if
/// missing. The JSON is pretty-printed with `\n` line endings only and a
/// trailing newline, so a Windows-generated file and a Linux-generated one
/// are the same bytes (CI's `git diff --exit-code` depends on it).
fn write_fixtures(out: &Path) -> Result<usize, WireGoldenError> {
    std::fs::create_dir_all(out).map_err(|source| WireGoldenError::Io { path: out.to_path_buf(), source })?;

    let fixtures = build_wire_fixtures();
    for fixture in &fixtures {
        let bin_path = out.join(format!("{}.bin", fixture.name));
        std::fs::write(&bin_path, &fixture.bin).map_err(|source| WireGoldenError::Io { path: bin_path.clone(), source })?;

        let mut text = serde_json::to_string_pretty(&fixture.json).map_err(WireGoldenError::Json)?;
        text.push('\n');
        let json_path = out.join(format!("{}.json", fixture.name));
        std::fs::write(&json_path, text.as_bytes()).map_err(|source| WireGoldenError::Io { path: json_path.clone(), source })?;
    }

    Ok(fixtures.len())
}

/// Parses `--out <dir>` from the arguments after the program name. `None`
/// when it is missing, repeated or followed by anything else.
fn parse_out(args: &[String]) -> Option<PathBuf> {
    match args {
        [flag, dir] if flag == "--out" => Some(PathBuf::from(dir)),
        _ => None,
    }
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let Some(out) = parse_out(&args) else {
        eprintln!("usage: wire-golden --out <dir>");
        return ExitCode::from(2);
    };
    match write_fixtures(&out) {
        Ok(n) => {
            eprintln!("wrote {n} wire golden fixture(s) to {}", out.display());
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("wire-golden: {e}");
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    fn temp_dir() -> PathBuf {
        static COUNTER: AtomicU32 = AtomicU32::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("idl1-wire-golden-{}-{n}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn write_fixtures_writes_one_bin_and_json_pair_per_fixture() {
        // Arrange
        let dir = temp_dir();

        // Act
        let n = write_fixtures(&dir).unwrap();

        // Assert
        let fixtures = build_wire_fixtures();
        assert_eq!(n, fixtures.len());
        for fixture in &fixtures {
            assert!(dir.join(format!("{}.bin", fixture.name)).is_file(), "{} missing .bin", fixture.name);
            assert!(dir.join(format!("{}.json", fixture.name)).is_file(), "{} missing .json", fixture.name);
        }
    }

    #[test]
    fn write_fixtures_run_twice_writes_identical_bytes() {
        // Arrange
        let dir = temp_dir();

        // Act
        write_fixtures(&dir).unwrap();
        let first = std::fs::read(dir.join("idlh-v2-time.json")).unwrap();
        write_fixtures(&dir).unwrap();
        let second = std::fs::read(dir.join("idlh-v2-time.json")).unwrap();

        // Assert — CI's gate is `git diff --exit-code` over exactly this.
        assert_eq!(first, second);
    }

    #[test]
    fn write_fixtures_json_output_contains_no_carriage_returns() {
        // Arrange
        let dir = temp_dir();

        // Act
        write_fixtures(&dir).unwrap();

        // Assert
        let bytes = std::fs::read(dir.join("idls-v1.json")).unwrap();
        assert!(!bytes.contains(&b'\r'));
    }

    #[test]
    fn parse_out_only_accepts_exactly_out_and_a_directory() {
        // Arrange
        let ok = vec!["--out".to_string(), "golden".to_string()];
        let bare = vec!["--out".to_string()];

        // Act / Assert
        assert_eq!(parse_out(&ok), Some(PathBuf::from("golden")));
        assert_eq!(parse_out(&bare), None);
        assert_eq!(parse_out(&[]), None);
    }
}
