//! C3 §3.17 overlay export (video step 3, 2026-11-23): the webview draws each
//! frame's readout layer as a transparent PNG and streams it here; the
//! person's own ffmpeg (never bundled: Isaac, 2026-11-23) composites it over
//! the linked clip. `ffmpeg_info` finds ffmpeg and checks its version;
//! `start_overlay_export` starts the job, `push_overlay_frame` feeds one
//! frame (raw bytes, never JSON), `finish_overlay_export` waits for the file,
//! `cancel_overlay_export` stops it.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use crate::error::{IpcError, IpcErrorKind};
use crate::state::DataDir;

/// The oldest ffmpeg export accepts: 6.0 (2023), for `-fps_mode` and a
/// current `overlay` filter; older builds also decode GoPro HEVC poorly.
pub const MIN_FFMPEG: (u32, u32) = (6, 0);

/// What `ffmpeg_info` found.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct FfmpegInfo {
    /// The program run, as given or found on PATH.
    pub path: String,
    /// `major.minor` read from `ffmpeg -version`, `None` when it did not run or said nothing readable.
    pub version: Option<String>,
    /// Whether export can use it: it ran, and it is at least [`MIN_FFMPEG`].
    pub usable: bool,
    /// For a person: what is wrong and what to do, or `None` when usable.
    pub problem: Option<String>,
}

/// `major.minor` from the first line of `ffmpeg -version`
/// (`ffmpeg version 8.1.2-full_build-www.gyan.dev …`, `ffmpeg version n6.1 …`,
/// `ffmpeg version 7.0-static …`). A git build (`N-11234-g…`) has no number: `None`.
pub fn parse_ffmpeg_version(output: &str) -> Option<(u32, u32)> {
    let line = output.lines().next()?;
    let rest = line.split("ffmpeg version ").nth(1)?;
    let token = rest.split_whitespace().next()?.trim_start_matches('n');
    let mut parts = token.split(|c: char| !c.is_ascii_digit());
    let major: u32 = parts.next()?.parse().ok()?;
    let minor: u32 = parts.next().and_then(|p| p.parse().ok()).unwrap_or(0);
    Some((major, minor))
}

/// [`FfmpegInfo`] for `version_output` (what `program -version` printed, `None` when it did not run).
pub fn judge_ffmpeg(program: &str, version_output: Option<&str>) -> FfmpegInfo {
    let install = "Install a current ffmpeg (for example `winget install Gyan.FFmpeg`) and restart idl1, or set its path in Settings.";
    match version_output {
        None => FfmpegInfo { path: program.to_string(), version: None, usable: false, problem: Some(format!("ffmpeg was not found ({program}). {install}")) },
        Some(out) => match parse_ffmpeg_version(out) {
            Some((major, minor)) if (major, minor) >= MIN_FFMPEG => {
                FfmpegInfo { path: program.to_string(), version: Some(format!("{major}.{minor}")), usable: true, problem: None }
            }
            Some((major, minor)) => FfmpegInfo {
                path: program.to_string(),
                version: Some(format!("{major}.{minor}")),
                usable: false,
                problem: Some(format!("ffmpeg {major}.{minor} is too old; export needs {}.{} or newer. {install}", MIN_FFMPEG.0, MIN_FFMPEG.1)),
            },
            // A git build carries no release number; it is newer than any release it lacks.
            None if out.contains("ffmpeg version N-") => FfmpegInfo { path: program.to_string(), version: None, usable: true, problem: None },
            None => FfmpegInfo { path: program.to_string(), version: None, usable: false, problem: Some(format!("{program} did not report an ffmpeg version. {install}")) },
        },
    }
}

fn no_window(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: no console flashes up
    }
    cmd
}

/// Runs `program -version` and judges it.
pub fn ffmpeg_info_for(program: &str) -> FfmpegInfo {
    let out = no_window(Command::new(program).arg("-hide_banner").arg("-version")).output().ok();
    let text = out.as_ref().filter(|o| o.status.success()).map(|o| String::from_utf8_lossy(&o.stdout).into_owned());
    judge_ffmpeg(program, text.as_deref())
}

/// C3 §3.17 `ffmpeg_info(path)`: the ffmpeg export would use (`path`, or
/// `ffmpeg` on PATH) and whether it is new enough.
#[tauri::command(async)]
pub fn ffmpeg_info(path: Option<String>) -> FfmpegInfo {
    ffmpeg_info_for(path.as_deref().filter(|p| !p.trim().is_empty()).unwrap_or("ffmpeg"))
}

/// A box on the output frame, px.
#[derive(Debug, Clone, Copy, PartialEq, serde::Deserialize, serde::Serialize)]
pub struct PxBox {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

/// `start_overlay_export`'s request.
#[derive(Debug, Clone, PartialEq, serde::Deserialize)]
pub struct ExportRequest {
    /// The linked clip's blob (its `VideoLink.blob_sha256`).
    pub video_sha256: String,
    /// Where in the clip to start, s.
    pub clip_from_s: f64,
    /// How long, s.
    pub duration_s: f64,
    /// Output frame size, px (both even).
    pub width: u32,
    pub height: u32,
    /// Output frames per second (the clip's own rate).
    pub fps: f64,
    /// The video's box on the frame, px; the picture fits inside it, centred.
    pub video_box: PxBox,
    /// `"draft"` (fast, small, heavy compression) or `"full"`.
    pub quality: String,
    /// The `.mp4` to write; its folder is created.
    pub out_path: String,
    /// ffmpeg to run; `None` for `ffmpeg` on PATH.
    pub ffmpeg: Option<String>,
}

/// The ffmpeg arguments for `req` reading `clip`: the clip trimmed, fitted
/// into its box on a black frame, the PNG frames from stdin laid on top, H.264
/// out with the clip's audio when it has any.
pub fn ffmpeg_args(req: &ExportRequest, clip: &Path) -> Vec<String> {
    let b = req.video_box;
    let fps = format!("{:.6}", req.fps);
    let filter = format!(
        "[0:v]fps={fps},scale={bw}:{bh}:force_original_aspect_ratio=decrease,pad={bw}:{bh}:(ow-iw)/2:(oh-ih)/2,setsar=1[v];\
         color=black:s={w}x{h}:r={fps}[bg];[bg][v]overlay={bx}:{by}:shortest=1[b];[b][1:v]overlay=0:0:shortest=1,format=yuv420p[out]",
        bw = b.w,
        bh = b.h,
        bx = b.x,
        by = b.y,
        w = req.width,
        h = req.height,
    );
    let (crf, preset) = if req.quality == "full" { ("18", "medium") } else { ("30", "veryfast") };
    [
        "-hide_banner", "-loglevel", "error", "-y",
        "-ss", &format!("{:.3}", req.clip_from_s), "-t", &format!("{:.3}", req.duration_s), "-i", &clip.to_string_lossy(),
        "-f", "image2pipe", "-framerate", &fps, "-c:v", "png", "-i", "-",
        "-filter_complex", &filter, "-map", "[out]", "-map", "0:a?",
        "-c:v", "libx264", "-crf", crf, "-preset", preset, "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart", &req.out_path,
    ]
    .iter()
    .map(|s| s.to_string())
    .collect()
}

/// One running export.
struct Job {
    child: Child,
    stdin: Option<ChildStdin>,
    stderr: Arc<Mutex<String>>,
    out_path: PathBuf,
    started: std::time::Instant,
}

/// Running exports by id. Managed state.
#[derive(Default)]
pub struct OverlayExports {
    jobs: Mutex<HashMap<u32, Job>>,
    next: AtomicU32,
}

fn validate(req: &ExportRequest) -> Result<(), IpcError> {
    let bad = |m: &str| Err(IpcError::new(IpcErrorKind::InvalidArgument, m.to_string()));
    if req.width == 0 || req.height == 0 || req.width % 2 != 0 || req.height % 2 != 0 {
        return bad("the output frame must have an even, non-zero width and height");
    }
    if !(req.fps > 0.0) || !(req.duration_s > 0.0) || !(req.clip_from_s >= 0.0) {
        return bad("the export needs a positive frame rate and duration and a start inside the clip");
    }
    let b = req.video_box;
    if b.w == 0 || b.h == 0 || b.w % 2 != 0 || b.h % 2 != 0 || b.x + b.w > req.width || b.y + b.h > req.height {
        return bad("the video box must be even-sized and inside the frame");
    }
    if req.quality != "draft" && req.quality != "full" {
        return bad("quality is \"draft\" or \"full\"");
    }
    Ok(())
}

/// Starts ffmpeg for `req` against the clip in `data_dir`'s blob store.
pub fn start_overlay_export_via(data_dir: &Path, exports: &OverlayExports, req: &ExportRequest) -> Result<u32, IpcError> {
    validate(req)?;
    if !idl_library::video::live_video_blobs(data_dir).contains(req.video_sha256.as_str()) {
        return Err(IpcError::new(IpcErrorKind::NotFound, format!("no linked video {}", req.video_sha256)));
    }
    let program = req.ffmpeg.clone().filter(|p| !p.trim().is_empty()).unwrap_or_else(|| "ffmpeg".to_string());
    let info = ffmpeg_info_for(&program);
    if !info.usable {
        return Err(IpcError::with_detail(IpcErrorKind::NotFound, info.problem.clone().unwrap_or_default(), serde_json::json!({ "ffmpeg": info.path, "version": info.version })));
    }
    let out_path = PathBuf::from(&req.out_path);
    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| IpcError::new(IpcErrorKind::Io, format!("creating {}: {e}", parent.display())))?;
    }
    let clip = idl_library::blob::blob_path(data_dir, &req.video_sha256);
    let mut child = no_window(Command::new(&program).args(ffmpeg_args(req, &clip)).stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::piped()))
        .spawn()
        .map_err(|e| IpcError::new(IpcErrorKind::Io, format!("starting {program}: {e}")))?;
    let stdin = child.stdin.take();
    let stderr = Arc::new(Mutex::new(String::new()));
    if let Some(mut pipe) = child.stderr.take() {
        let sink = stderr.clone();
        // Drained on its own thread so a chatty ffmpeg never blocks on a full pipe.
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            while let Ok(n) = pipe.read(&mut buf) {
                if n == 0 {
                    break;
                }
                let mut s = sink.lock().unwrap();
                s.push_str(&String::from_utf8_lossy(&buf[..n]));
                if s.len() > 8192 {
                    let cut = s.len() - 8192;
                    s.drain(..cut);
                }
            }
        });
    }
    let id = exports.next.fetch_add(1, Ordering::Relaxed) + 1;
    exports.jobs.lock().unwrap().insert(id, Job { child, stdin, stderr, out_path, started: std::time::Instant::now() });
    Ok(id)
}

/// C3 §3.17 `start_overlay_export(request)`: checks ffmpeg and starts it; the job's id.
#[tauri::command(async)]
pub fn start_overlay_export(request: ExportRequest, exports: tauri::State<'_, OverlayExports>, data_dir: tauri::State<'_, DataDir>) -> Result<u32, IpcError> {
    start_overlay_export_via(&data_dir.0, &exports, &request)
}

fn ffmpeg_failed(stderr: &Arc<Mutex<String>>, what: &str) -> IpcError {
    let tail = stderr.lock().unwrap().trim().to_string();
    IpcError::with_detail(IpcErrorKind::Io, format!("ffmpeg {what}: {}", tail.lines().last().unwrap_or("no message")), serde_json::json!({ "stderr": tail }))
}

/// Writes one PNG frame to job `id`'s ffmpeg.
pub fn push_overlay_frame_via(exports: &OverlayExports, id: u32, png: &[u8]) -> Result<(), IpcError> {
    let mut jobs = exports.jobs.lock().unwrap();
    let job = jobs.get_mut(&id).ok_or_else(|| IpcError::new(IpcErrorKind::NotFound, format!("no export {id}")))?;
    let stdin = job.stdin.as_mut().ok_or_else(|| IpcError::new(IpcErrorKind::InvalidArgument, format!("export {id} is finishing")))?;
    stdin.write_all(png).map_err(|_| ffmpeg_failed(&job.stderr, "stopped taking frames"))
}

/// C3 §3.17 `push_overlay_frame`: the body is one PNG (raw bytes), the
/// `x-export` header the job id.
#[tauri::command(async)]
pub fn push_overlay_frame(request: tauri::ipc::Request<'_>, exports: tauri::State<'_, OverlayExports>) -> Result<(), IpcError> {
    let id: u32 = request
        .headers()
        .get("x-export")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse().ok())
        .ok_or_else(|| IpcError::new(IpcErrorKind::InvalidArgument, "push_overlay_frame needs an x-export header"))?;
    let tauri::ipc::InvokeBody::Raw(png) = request.body() else {
        return Err(IpcError::new(IpcErrorKind::InvalidArgument, "push_overlay_frame takes the PNG as raw bytes"));
    };
    push_overlay_frame_via(&exports, id, png)
}

/// `finish_overlay_export`'s result.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct ExportDone {
    /// The file written.
    pub path: String,
    /// Its size, bytes.
    pub bytes: u64,
    /// Wall time since the start, s.
    pub seconds: f64,
}

/// Closes job `id`'s frame pipe and waits for ffmpeg to finish the file.
pub fn finish_overlay_export_via(exports: &OverlayExports, id: u32) -> Result<ExportDone, IpcError> {
    let mut job = exports.jobs.lock().unwrap().remove(&id).ok_or_else(|| IpcError::new(IpcErrorKind::NotFound, format!("no export {id}")))?;
    drop(job.stdin.take());
    let status = job.child.wait().map_err(|e| IpcError::new(IpcErrorKind::Io, format!("waiting for ffmpeg: {e}")))?;
    if !status.success() {
        return Err(ffmpeg_failed(&job.stderr, "failed"));
    }
    let bytes = std::fs::metadata(&job.out_path).map(|m| m.len()).unwrap_or(0);
    Ok(ExportDone { path: job.out_path.display().to_string(), bytes, seconds: job.started.elapsed().as_secs_f64() })
}

/// C3 §3.17 `finish_overlay_export(id)`.
#[tauri::command(async)]
pub fn finish_overlay_export(id: u32, exports: tauri::State<'_, OverlayExports>) -> Result<ExportDone, IpcError> {
    finish_overlay_export_via(&exports, id)
}

/// C3 §3.17 `cancel_overlay_export(id)`: stops ffmpeg and deletes the partial file. `true` when the job existed.
#[tauri::command(async)]
pub fn cancel_overlay_export(id: u32, exports: tauri::State<'_, OverlayExports>) -> bool {
    let Some(mut job) = exports.jobs.lock().unwrap().remove(&id) else { return false };
    drop(job.stdin.take());
    let _ = job.child.kill();
    let _ = job.child.wait();
    let _ = std::fs::remove_file(&job.out_path);
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req() -> ExportRequest {
        ExportRequest {
            video_sha256: "ab".repeat(32),
            clip_from_s: 6.1,
            duration_s: 89.0,
            width: 1920,
            height: 1080,
            fps: 23.976,
            video_box: PxBox { x: 240, y: 0, w: 1440, h: 1080 },
            quality: "draft".to_string(),
            out_path: "C:/out/x.mp4".to_string(),
            ffmpeg: None,
        }
    }

    #[test]
    fn parse_ffmpeg_version_release_builds_major_minor() {
        // Arrange
        let gyan = "ffmpeg version 8.1.2-full_build-www.gyan.dev Copyright (c) 2000-2026";

        // Act + Assert
        assert_eq!(parse_ffmpeg_version(gyan), Some((8, 1)));
        assert_eq!(parse_ffmpeg_version("ffmpeg version n6.1 Copyright"), Some((6, 1)));
        assert_eq!(parse_ffmpeg_version("ffmpeg version 7-static"), Some((7, 0)));
        assert_eq!(parse_ffmpeg_version("ffmpeg version N-112233-gabc"), None);
        assert_eq!(parse_ffmpeg_version("not ffmpeg"), None);
    }

    #[test]
    fn judge_ffmpeg_old_missing_and_git_builds() {
        // Arrange + Act
        let old = judge_ffmpeg("ffmpeg", Some("ffmpeg version 4.4.2 Copyright"));
        let missing = judge_ffmpeg("ffmpeg", None);
        let git = judge_ffmpeg("ffmpeg", Some("ffmpeg version N-112233-gabc Copyright"));
        let new = judge_ffmpeg("ffmpeg", Some("ffmpeg version 8.1.2-full_build"));

        // Assert
        assert!(!old.usable && old.problem.unwrap().contains("too old"));
        assert!(!missing.usable && missing.problem.unwrap().contains("not found"));
        assert!(git.usable);
        assert!(new.usable && new.version.as_deref() == Some("8.1"));
    }

    #[test]
    fn ffmpeg_args_draft_trims_fits_overlays_and_compresses_hard() {
        // Arrange
        let r = req();

        // Act
        let args = ffmpeg_args(&r, Path::new("C:/blobs/ab"));

        // Assert
        let joined = args.join(" ");
        assert!(joined.contains("-ss 6.100 -t 89.000 -i C:/blobs/ab"));
        assert!(joined.contains("-f image2pipe -framerate 23.976000 -c:v png -i -"));
        assert!(joined.contains("scale=1440:1080:force_original_aspect_ratio=decrease,pad=1440:1080"));
        assert!(joined.contains("color=black:s=1920x1080"));
        assert!(joined.contains("overlay=240:0"));
        assert!(joined.contains("-crf 30 -preset veryfast"));
        assert_eq!(args.last().map(String::as_str), Some("C:/out/x.mp4"));
    }

    #[test]
    fn ffmpeg_args_full_quality_crf_18() {
        // Arrange
        let r = ExportRequest { quality: "full".to_string(), ..req() };

        // Act
        let joined = ffmpeg_args(&r, Path::new("c")).join(" ");

        // Assert
        assert!(joined.contains("-crf 18 -preset medium"));
    }

    #[test]
    fn validate_odd_frame_or_box_outside_invalid_argument() {
        // Arrange
        let odd = ExportRequest { width: 1921, ..req() };
        let outside = ExportRequest { video_box: PxBox { x: 600, y: 0, w: 1440, h: 1080 }, ..req() };

        // Act + Assert
        assert_eq!(validate(&odd).unwrap_err().kind, IpcErrorKind::InvalidArgument);
        assert_eq!(validate(&outside).unwrap_err().kind, IpcErrorKind::InvalidArgument);
        assert!(validate(&req()).is_ok());
    }

    #[test]
    fn push_overlay_frame_via_unknown_job_not_found() {
        // Arrange
        let exports = OverlayExports::default();

        // Act
        let result = push_overlay_frame_via(&exports, 7, &[1, 2, 3]);

        // Assert
        assert_eq!(result.unwrap_err().kind, IpcErrorKind::NotFound);
    }
}
