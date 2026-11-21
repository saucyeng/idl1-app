//! A maker's geometry table from a screenshot (C3 §3.15,
//! `read_geometry_table`): the platform's OCR engine finds the words,
//! `idl_rs::calibration::geometry_table` reads the table from them.
//! Windows only for now (Windows.Media.Ocr, part of the OS: nothing bundled,
//! nothing downloaded); elsewhere the command says it isn't available.

use idl_rs::calibration::geometry_table::{parse, GeometryTable, OcrWord};

use crate::error::{IpcError, IpcErrorKind};

/// The words the OCR engine found in an encoded image (PNG, JPEG, BMP…),
/// in the image's pixels. First cell by cell ([`cells`]: each enlarged and
/// read alone, which small table text needs); when those don't make a table,
/// the whole image at three scales, keeping every word not already found.
#[cfg(windows)]
pub fn ocr_words(image: &[u8]) -> Result<Vec<OcrWord>, IpcError> {
    use windows::Graphics::Imaging::{BitmapAlphaMode, BitmapDecoder, BitmapInterpolationMode, BitmapPixelFormat, BitmapTransform, ColorManagementMode, ExifOrientationMode, SoftwareBitmap};
    use windows::Media::Ocr::{OcrEngine, OcrResult};
    use windows::Storage::Streams::{Buffer, DataReader, DataWriter, InMemoryRandomAccessStream};

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

    let decode = |scale: f64| -> windows::core::Result<(Vec<u8>, usize, usize)> {
        let transform = BitmapTransform::new()?;
        let (sw, sh) = (((w as f64 * scale).round() as u32).max(1), ((h as f64 * scale).round() as u32).max(1));
        transform.SetScaledWidth(sw)?;
        transform.SetScaledHeight(sh)?;
        transform.SetInterpolationMode(BitmapInterpolationMode::Fant)?;
        let b = decoder.GetSoftwareBitmapTransformedAsync(BitmapPixelFormat::Bgra8, BitmapAlphaMode::Premultiplied, &transform, ExifOrientationMode::IgnoreExifOrientation, ColorManagementMode::DoNotColorManage)?.get()?;
        let buf = Buffer::Create(sw * sh * 4)?;
        b.CopyToBuffer(&buf)?;
        let mut px = vec![0u8; buf.Length()? as usize];
        DataReader::FromBuffer(&buf)?.ReadBytes(&mut px)?;
        Ok((px, sw as usize, sh as usize))
    };
    let recognise = |g: &Gray| -> windows::core::Result<OcrResult> {
        let bgra: Vec<u8> = g.px.iter().flat_map(|&v| [v, v, v, 255]).collect();
        let writer = DataWriter::new()?;
        writer.WriteBytes(&bgra)?;
        let bitmap = SoftwareBitmap::CreateCopyFromBuffer(&writer.DetachBuffer()?, BitmapPixelFormat::Bgra8, g.w as i32, g.h as i32)?;
        engine.RecognizeAsync(&bitmap)?.get()
    };

    // cell by cell
    let (px, gw, gh) = decode(1.0).map_err(|e| fail("decoding the image", e))?;
    let gray = gray_from_bgra(&px, gw, gh);
    let mut words: Vec<OcrWord> = Vec::new();
    for c in cells(&gray) {
        let cut = crop(&gray, c);
        if cut.w as f64 > max || cut.h as f64 > max {
            continue;
        }
        let text = recognise(&cut).and_then(|r| r.Text()).map_err(|e| fail("reading the text", e))?.to_string_lossy();
        let text = text.trim();
        if !text.is_empty() {
            words.push(OcrWord { text: text.to_string(), x: c.0 as f64, y: c.1 as f64, w: (c.2 - c.0) as f64, h: (c.3 - c.1) as f64 });
        }
    }
    if parse(&words).is_some() {
        return Ok(words);
    }

    // the whole image: the engine drops some short words at any one scale,
    // so read at three and keep every word not already found where it sits
    let mut words: Vec<OcrWord> = Vec::new();
    for want in [3.0_f64, 2.0, 4.0] {
        let scale = want.min(max / w.max(h).max(1) as f64);
        let (px, sw, sh) = decode(scale).map_err(|e| fail("decoding the image", e))?;
        let result = recognise(&gray_from_bgra(&px, sw, sh)).map_err(|e| fail("reading the text", e))?;
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

/// A grey image, one byte a pixel, row by row: dark text on a light ground.
pub struct Gray {
    /// Width, px.
    pub w: usize,
    /// Height, px.
    pub h: usize,
    /// The pixels, `w * h`.
    pub px: Vec<u8>,
}

/// Lightness 0..255 from BGRA bytes, contrast stretched between the 2nd and
/// 98th percentile, inverted when the image is mostly dark (a maker's site
/// in dark mode: light text on black reads far worse).
pub fn gray_from_bgra(bgra: &[u8], w: usize, h: usize) -> Gray {
    let lum: Vec<f32> = bgra.chunks_exact(4).map(|c| 0.114 * c[0] as f32 + 0.587 * c[1] as f32 + 0.299 * c[2] as f32).collect();
    if lum.is_empty() {
        return Gray { w, h, px: Vec::new() };
    }
    let mean = lum.iter().sum::<f32>() / lum.len() as f32;
    let mut sorted = lum.clone();
    sorted.sort_by(f32::total_cmp);
    let (lo, hi) = (sorted[sorted.len() * 2 / 100], sorted[(sorted.len() * 98 / 100).min(sorted.len() - 1)]);
    let span = (hi - lo).max(1.0);
    let px = lum
        .iter()
        .map(|l| {
            let v = ((l - lo) / span).clamp(0.0, 1.0);
            ((if mean < 128.0 { 1.0 - v } else { v }) * 255.0).round() as u8
        })
        .collect();
    Gray { w, h, px }
}

/// The table's cells, as boxes (x0, y0, x1, y1) in pixels, end exclusive:
/// bands of rows holding text (ink: a pixel well darker than its row's
/// median, so striped rows don't count), split along the row where the gap
/// between inks is wider than the band is tall. Rules (bands under 3 px, or
/// a run of ink across most of the width) are not cells.
pub fn cells(g: &Gray) -> Vec<(usize, usize, usize, usize)> {
    let (w, h) = (g.w, g.h);
    if w == 0 || h == 0 {
        return Vec::new();
    }
    let ink: Vec<bool> = (0..h)
        .flat_map(|y| {
            let row = &g.px[y * w..(y + 1) * w];
            let mut s = row.to_vec();
            s.sort_unstable();
            let median = s[w / 2] as i32;
            row.iter().map(move |&p| (p as i32) < median - 60).collect::<Vec<_>>()
        })
        .collect();
    let row_has = |y: usize| (0..w).any(|x| ink[y * w + x]);
    let mut out = Vec::new();
    let mut y = 0;
    while y < h {
        if !row_has(y) {
            y += 1;
            continue;
        }
        let y0 = y;
        while y < h && row_has(y) {
            y += 1;
        }
        let y1 = y;
        let bh = y1 - y0;
        if bh < 3 {
            continue;
        }
        let col_has: Vec<bool> = (0..w).map(|x| (y0..y1).any(|yy| ink[yy * w + x])).collect();
        let gap = bh.max(4);
        let mut x = 0;
        while x < w {
            if !col_has[x] {
                x += 1;
                continue;
            }
            let x0 = x;
            let mut last = x;
            while x < w && (col_has[x] || x - last <= gap) {
                if col_has[x] {
                    last = x;
                }
                x += 1;
            }
            let x1 = last + 1;
            if x1 - x0 < (0.8 * w as f64) as usize {
                out.push((x0, y0, x1, y1));
            }
        }
    }
    out
}

/// A cell cut out with a margin of half its height, enlarged so it is about
/// 48 px tall (bilinear), and stretched to black text on white.
pub fn crop(g: &Gray, c: (usize, usize, usize, usize)) -> Gray {
    let (x0, y0, x1, y1) = c;
    let bh = (y1 - y0).max(1) as f64;
    let pad = (0.5 * bh).ceil() as isize + 2;
    let s = (48.0 / bh).clamp(1.0, 8.0);
    let (cw, ch) = ((x1 - x0) as isize + 2 * pad, (y1 - y0) as isize + 2 * pad);
    let (ow, oh) = (((cw as f64) * s).round() as usize, ((ch as f64) * s).round() as usize);
    let at = |x: isize, y: isize| -> f64 {
        if x < 0 || y < 0 || x >= g.w as isize || y >= g.h as isize {
            255.0
        } else {
            g.px[y as usize * g.w + x as usize] as f64
        }
    };
    let (mut lo, mut hi) = (255.0_f64, 0.0_f64);
    for y in y0..y1 {
        for x in x0..x1 {
            let v = g.px[y * g.w + x] as f64;
            lo = lo.min(v);
            hi = hi.max(v);
        }
    }
    let span = (hi - lo).max(1.0);
    let mut px = Vec::with_capacity(ow * oh);
    for oy in 0..oh {
        for ox in 0..ow {
            let (fx, fy) = (ox as f64 / s - pad as f64 + x0 as f64, oy as f64 / s - pad as f64 + y0 as f64);
            let (ix, iy) = (fx.floor() as isize, fy.floor() as isize);
            let (tx, ty) = (fx - ix as f64, fy - iy as f64);
            let v = at(ix, iy) * (1.0 - tx) * (1.0 - ty) + at(ix + 1, iy) * tx * (1.0 - ty) + at(ix, iy + 1) * (1.0 - tx) * ty + at(ix + 1, iy + 1) * tx * ty;
            px.push((((v - lo) / span).clamp(0.0, 1.0) * 255.0).round() as u8);
        }
    }
    Gray { w: ow, h: oh, px }
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

#[cfg(test)]
mod cell_tests {
    use super::*;

    /// A light image with dark rectangles standing in for words.
    fn image(w: usize, h: usize, blocks: &[(usize, usize, usize, usize)]) -> Gray {
        let mut px = vec![240u8; w * h];
        for &(x0, y0, x1, y1) in blocks {
            for y in y0..y1 {
                for x in x0..x1 {
                    px[y * w + x] = 20;
                }
            }
        }
        Gray { w, h, px }
    }

    #[test]
    fn cells_split_rows_at_blank_lines_and_columns_at_wide_gaps() {
        // Arrange: two rows; the first a label of two words close together, then a number far right
        let g = image(400, 60, &[(10, 10, 40, 20), (44, 10, 80, 20), (300, 10, 330, 20), (10, 35, 50, 45), (300, 35, 320, 45)]);

        // Act
        let c = cells(&g);

        // Assert
        assert_eq!(c, vec![(10, 10, 80, 20), (300, 10, 330, 20), (10, 35, 50, 45), (300, 35, 320, 45)]);
    }

    #[test]
    fn cells_skip_a_rule_across_the_table() {
        // Arrange
        let g = image(400, 40, &[(0, 5, 400, 6), (10, 20, 40, 30)]);

        // Act / Assert
        assert_eq!(cells(&g), vec![(10, 20, 40, 30)]);
    }

    #[test]
    fn gray_from_bgra_dark_mode_comes_out_dark_text_on_light() {
        // Arrange: mostly black with one white pixel of text
        let mut bgra = vec![0u8; 4 * 10];
        bgra[0..4].copy_from_slice(&[255, 255, 255, 255]);

        // Act
        let g = gray_from_bgra(&bgra, 10, 1);

        // Assert
        assert!(g.px[0] < 50 && g.px[5] > 200, "{:?}", g.px);
    }

    #[test]
    fn crop_enlarges_a_small_cell_to_about_48_px() {
        // Arrange
        let g = image(100, 30, &[(10, 10, 30, 18)]);

        // Act
        let c = crop(&g, (10, 10, 30, 18));

        // Assert
        assert!(c.h >= 48 && c.h <= 120, "{}", c.h);
        assert_eq!(c.px.len(), c.w * c.h);
    }
}
