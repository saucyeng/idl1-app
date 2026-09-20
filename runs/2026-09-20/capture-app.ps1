# Capture the running idl1 dev app window to a PNG without activating it.
# Usage: powershell -NoProfile -File capture-app.ps1 -Out C:\path\shot.png [-Scale 0.5]
#
# There is deliberately no -Width/-Height any more. See "THE RESIZE OPTION
# IS GONE" below before adding one back.
#
# WHY THIS SCRIPT USED TO LIE (fixed 2026-09-20, ruling R247 item 3)
#
# The first version sized its bitmap from GetWindowRect. PrintWindow paints
# into the window's CLIENT space, and on this machine the two do not agree:
# GetWindowRect reports 2400x1500 while GetClientRect -- and the webview,
# and `window.innerWidth` -- are 1536x816. So PrintWindow painted a 1536x816
# image into the top-left of a 2400x1500 bitmap and left the rest black.
#
# That is not a cosmetic margin. Every crop taken against the oversized
# bitmap landed in the wrong place, and the right-hand third of the frame
# was empty, which reads exactly like content running past the right edge of
# its panel. A whole lane-day of "the notebook does not wrap and is clipped"
# (2026-09-20, R247's parent brief) was this script. The notebook was
# measured in the live DOM at the time and had no horizontal overflow at
# all: scrollWidth <= clientWidth on every element.
#
# Capturing at GetClientRect gives the complete UI at 1:1, every time.
#
# THE RESIZE OPTION IS GONE
#
# -Width/-Height used SetWindowPos from outside the process. Measured
# 2026-09-20: that moves and resizes the top-level FRAME (GetWindowRect
# follows it immediately) and the webview never learns. The client area
# stays exactly as it was -- 1536x816 before a resize to 1719x1250, and
# 1536x816 after it -- so `window.innerWidth` does not change, no CSS
# breakpoint re-evaluates, and the dock's aspect-class logic (R213) never
# sees the new shape. A capture taken afterwards is the OLD layout inside a
# NEW frame, which is the second half of the same false bug report.
#
# To see the app at another width, make the app resize itself, so the resize
# goes through its own event loop and reaches the webview:
#
#   * temporarily, over hot reload, from any app module --
#       import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
#       void getCurrentWindow().setSize(new LogicalSize(1400, 900));
#     then revert the edit; or
#   * drag the window edge by hand.
#
# Either way `window.innerWidth` follows and this script captures whatever
# the app now believes it is, because it asks the window rather than telling
# it.
param([Parameter(Mandatory = $true)][string]$Out, [double]$Scale = 0.5)
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System; using System.Runtime.InteropServices;
public class IdlCap {
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint f);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  public struct RECT { public int L, T, R, B; }
}
'@
$p = Get-Process app -ErrorAction Stop | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { throw "the idl1 dev app window was not found" }
$h = $p.MainWindowHandle

# The CLIENT rect, not the window rect: this is the space PrintWindow paints
# into and the space the webview lays out in. See the header.
$r = New-Object IdlCap+RECT
[void][IdlCap]::GetClientRect($h, [ref]$r)
$w = $r.R; $ht = $r.B
if ($w -le 0 -or $ht -le 0) { throw "the idl1 dev app window has no client area (minimized?)" }
$bmp = New-Object System.Drawing.Bitmap $w, $ht
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
# 2 = PW_RENDERFULLCONTENT, needed for WebView2 content.
[void][IdlCap]::PrintWindow($h, $hdc, 2)
$g.ReleaseHdc($hdc)
if ($Scale -eq 1.0) {
  $bmp.Save($Out)
} else {
  $scaled = New-Object System.Drawing.Bitmap $bmp, ([int]($w * $Scale)), ([int]($ht * $Scale))
  $scaled.Save($Out)
}
"captured ${w}x${ht} -> $Out"
