# up.ps1 -- pull both repos, link the submodule, install deps if they changed,
# wait for the cargo slot, then run the app. Usage, from the repo root:
#   .\up.ps1            # dev app (com.saucyeng.idl1.dev data dir)
#   .\up.ps1 -Build     # release build instead (installer under app\src-tauri\target\release\bundle)
#   .\up.ps1 -NoWait    # do not wait for other cargo processes (not recommended: 16 GB box)
param([switch]$Build, [switch]$NoWait)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "== git pull (superproject)"
git pull --ff-only
if ($LASTEXITCODE -ne 0) { throw "git pull failed; resolve by hand" }

Write-Host "== submodule sync + update (rust/ -> pinned commit)"
git submodule sync --quiet
git submodule update --init --recursive
if ($LASTEXITCODE -ne 0) { throw "submodule update failed" }
$pinned = (git -C rust rev-parse --short HEAD)
Write-Host "   rust/ at $pinned"

Write-Host "== node deps"
$lockHash = (Get-FileHash app\package-lock.json).Hash
$stamp = "app\node_modules\.package-lock.hash"
$have = if (Test-Path $stamp) { Get-Content $stamp } else { "" }
if ($have -ne $lockHash -or -not (Test-Path app\node_modules\.bin\tauri.cmd)) {
    Push-Location app; npm ci; Pop-Location
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
    Set-Content $stamp $lockHash
} else { Write-Host "   unchanged" }

if (-not $NoWait) {
    # One cargo process on this machine at a time (CLAUDE.md section 8): a lane
    # may be compiling in a worktree. Two builds at once exhaust RAM and swap
    # and the compiler dies mid-crate with errors like "can't find crate".
    $waited = 0
    while (Get-Process -Name cargo, rustc -ErrorAction SilentlyContinue) {
        if ($waited -eq 0) { Write-Host "== another cargo build is running; waiting for the slot (Ctrl+C to stop)" }
        Start-Sleep -Seconds 10; $waited += 10
        if ($waited % 60 -eq 0) { Write-Host "   still waiting ($waited s)" }
    }
}

Push-Location app
try {
    if ($Build) { Write-Host "== tauri build (release)"; npm run tauri build }
    else        { Write-Host "== tauri dev";             npm run tauri dev }
} finally { Pop-Location }
