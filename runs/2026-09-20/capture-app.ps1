# Capture the running idl1 dev app window to a PNG without activating it.
# Usage: powershell -NoProfile -File capture-app.ps1 -Out C:\path\shot.png [-Width 2400 -Height 1500] [-Scale 0.5]
param([Parameter(Mandatory = $true)][string]$Out, [int]$Width = 0, [int]$Height = 0, [double]$Scale = 0.5)
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System; using System.Runtime.InteropServices;
public class IdlCap {
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint f);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);
  public struct RECT { public int L, T, R, B; }
}
'@
$p = Get-Process app -ErrorAction Stop | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { throw "the idl1 dev app window was not found" }
$h = $p.MainWindowHandle
if ($Width -gt 0 -and $Height -gt 0) {
  # 0x0014 = SWP_NOZORDER | SWP_NOACTIVATE: resize in place, never steal focus.
  [void][IdlCap]::SetWindowPos($h, [IntPtr]::Zero, 40, 40, $Width, $Height, 0x0014)
  Start-Sleep 2
}
$r = New-Object IdlCap+RECT
[void][IdlCap]::GetWindowRect($h, [ref]$r)
$w = $r.R - $r.L; $ht = $r.B - $r.T
$bmp = New-Object System.Drawing.Bitmap $w, $ht
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
# 2 = PW_RENDERFULLCONTENT, needed for WebView2 content.
[void][IdlCap]::PrintWindow($h, $hdc, 2)
$g.ReleaseHdc($hdc)
$scaled = New-Object System.Drawing.Bitmap $bmp, ([int]($w * $Scale)), ([int]($ht * $Scale))
$scaled.Save($Out)
"captured ${w}x${ht} -> $Out"
