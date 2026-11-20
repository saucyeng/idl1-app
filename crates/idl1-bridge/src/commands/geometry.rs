//! A maker's geometry table from a screenshot (C3 §3.15,
//! `read_geometry_table`): the platform's OCR engine finds the words,
//! `idl_rs::calibration::geometry_table` reads the table from them.
//! Windows only for now (Windows.Media.Ocr, part of the OS: nothing bundled,
//! nothing downloaded); elsewhere the command says it isn't available.

use idl_rs::calibration::geometry_table::{parse, GeometryTable, OcrWord};

use crate::error::{IpcError, IpcErrorKind};

/// The words the OCR engine found in an encoded image (PNG, JPEG, BMP…),
/// in the image's pixels.
#[cfg(windows)]
pub fn ocr_words(image: &[u8]) -> Result<Vec<OcrWord>, IpcError> {
    use windows::Graphics::Imaging::{BitmapAlphaMode, BitmapDecoder, BitmapInterpolationMode, BitmapPixelFormat, BitmapTransform, ColorManagementMode, ExifOrientationMode};
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::Streams::{DataWriter, InMemoryRandomAccessStream};

    let fail = |what: &str, e: windows::core::Error| IpcError::new(IpcErrorKind::Io, format!("{what}: {}", e.message()));
    let stream = InMemoryRandomAccessStream::new().map_err(|e| fail("making a stream", e))?;
    let writer = DataWriter::CreateDataWriter(&stream).map_err(|e| fail("writing the image", e))?;
    writer.WriteBytes(image).map_err(|e| fail("writing the image", e))?;
    writer.StoreAsync().and_then(|op| op.get()).map_err(|e| fail("writing the image", e))?;
    writer.DetachStream().map_err(|e| fail("writing the image", e))?;
    stream.Seek(0).map_err(|e| fail("rewinding the image", e))?;
    let decoder = BitmapDecoder::CreateAsync(&stream).and_then(|op| op.get()).map_err(|_| IpcError::new(IpcErrorKind::InvalidArgument, "that isn't an image the system can read (PNG, JPEG, BMP, GIF, TIFF)"))?;
    let (w, h) = (decoder.PixelWidth().map_err(|e| fail("reading the image", e))?, decoder.PixelHeight().map_err(|e| fail("reading the image", e))?);
    let max = OcrEngine::MaxImageDimension().map_err(|e| fail("starting OCR", e))? as f64;
    let engine = OcrEngine::TryCreateFromUserProfileLanguages().map_err(|_| IpcError::new(IpcErrorKind::Internal, "no OCR language is installed: add one under Windows Settings, Time & language, Language"))?;
    // the engine drops some short words at any one scale, so read at three
    // and keep every word not already found where it sits
    let mut words: Vec<OcrWord> = Vec::new();
    for want in [2.0_f64, 1.0, 3.0] {
        let scale = want.min(max / w.max(h).max(1) as f64);
        let transform = BitmapTransform::new().map_err(|e| fail("scaling the image", e))?;
        transform.SetScaledWidth(((w as f64 * scale).round() as u32).max(1)).map_err(|e| fail("scaling the image", e))?;
        transform.SetScaledHeight(((h as f64 * scale).round() as u32).max(1)).map_err(|e| fail("scaling the image", e))?;
        transform.SetInterpolationMode(BitmapInterpolationMode::Fant).map_err(|e| fail("scaling the image", e))?;
        let bitmap = decoder
            .GetSoftwareBitmapTransformedAsync(BitmapPixelFormat::Bgra8, BitmapAlphaMode::Premultiplied, &transform, ExifOrientationMode::IgnoreExifOrientation, ColorManagementMode::DoNotColorManage)
            .and_then(|op| op.get())
            .map_err(|e| fail("decoding the image", e))?;
        let result = engine.RecognizeAsync(&bitmap).and_then(|op| op.get()).map_err(|e| fail("reading the text", e))?;
        for line in result.Lines().map_err(|e| fail("reading the text", e))? {
            for word in line.Words().map_err(|e| fail("reading the text", e))? {
                let r = word.BoundingRect().map_err(|e| fail("reading the text", e))?;
                let text = word.Text().map_err(|e| fail("reading the text", e))?.to_string_lossy();
                let found = OcrWord { text, x: r.X as f64 / scale, y: r.Y as f64 / scale, w: r.Width as f64 / scale, h: r.Height as f64 / scale };
                if !words.iter().any(|o| overlap(o, &found) > 0.3) {
                    words.push(found);
                }
            }
        }
        if scale < want {
            break;
        }
    }
    Ok(words)
}

/// How much two word boxes overlap: their intersection over the smaller box's area.
#[cfg(windows)]
fn overlap(a: &OcrWord, b: &OcrWord) -> f64 {
    let ix = (a.x + a.w).min(b.x + b.w) - a.x.max(b.x);
    let iy = (a.y + a.h).min(b.y + b.h) - a.y.max(b.y);
    if ix <= 0.0 || iy <= 0.0 {
        return 0.0;
    }
    ix * iy / (a.w * a.h).min(b.w * b.h).max(1e-9)
}

/// See the Windows version: no OCR engine here yet.
#[cfg(not(windows))]
pub fn ocr_words(_image: &[u8]) -> Result<Vec<OcrWord>, IpcError> {
    Err(IpcError::new(IpcErrorKind::Internal, "reading a geometry table from a screenshot needs Windows for now: type the numbers into the Geometry family"))
}

/// C3 §3.15 `read_geometry_table(image, path)` (async): the geometry table
/// in a screenshot, given as its encoded bytes (`image`, from the
/// clipboard) or a file (`path`, dropped or picked). Errors:
/// `InvalidArgument` for neither, bytes that aren't an image, or an image
/// with no table (no header of size names); `Io` for an unreadable file;
/// `Internal` without an OCR engine.
#[tauri::command(async)]
pub fn read_geometry_table(image: Option<Vec<u8>>, path: Option<String>) -> Result<GeometryTable, IpcError> {
    let bytes = match (image, path) {
        (Some(b), _) if !b.is_empty() => b,
        (_, Some(p)) => std::fs::read(&p).map_err(|e| IpcError::new(IpcErrorKind::Io, format!("reading {p}: {e}")))?,
        _ => return Err(IpcError::new(IpcErrorKind::InvalidArgument, "no image: paste a screenshot or drop its file")),
    };
    let words = ocr_words(&bytes)?;
    parse(&words).ok_or_else(|| IpcError::new(IpcErrorKind::InvalidArgument, format!("no geometry table found: {} words read, but no line of size names (S, M, L, XL…) above the rows", words.len())))
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn read_geometry_table_garbage_bytes_are_invalid_argument() {
        // Arrange
        let bytes = vec![1u8, 2, 3, 4];

        // Act
        let e = read_geometry_table(Some(bytes), None).unwrap_err();

        // Assert
        assert_eq!(e.kind, IpcErrorKind::InvalidArgument);
    }

    #[test]
    fn read_geometry_table_fixture_screenshot_large_long_setting() {
        // Arrange: a rendered table in a maker's layout (sizes across, rows down)
        let png = include_bytes!("fixtures/geometry-table.png").to_vec();

        // Act
        let t = read_geometry_table(Some(png), None).unwrap();
        let lg: std::collections::BTreeMap<_, _> = t.for_size(2, 1).into_iter().collect();

        // Assert
        assert_eq!(t.sizes, ["SM", "MD", "LG", "XL"]);
        assert_eq!(lg.get("geometry.head_angle_deg"), Some(&63.5));
        assert_eq!(lg.get("geometry.stack_mm"), Some(&645.0));
        assert_eq!(lg.get("geometry.reach_mm"), Some(&480.0));
        assert_eq!(lg.get("geometry.chainstay_mm"), Some(&445.0));
        assert_eq!(lg.get("geometry.wheelbase_mm"), Some(&1257.0));
    }
}
