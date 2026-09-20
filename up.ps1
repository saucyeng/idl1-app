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
$installed = Test-Path app\node_modules\.bin\tauri.cmd
if ($installed -and $have -eq "") {
    # First run with deps already present: adopt them, do not reinstall.
    Set-Content $stamp $lockHash; Write-Host "   present (stamped)"
} elseif (-not $installed -or $have -ne $lockHash) {
    Push-Location app; npm ci; Pop-Location
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed (is a dev server or editor holding node_modules?)" }
    Set-Content $stamp $lockHash
} else { Write-Host "   unchanged" }

if (-not $NoWait) {
    # One cargo process on this machine at a time (CLAUDE.md section 8): a lane
    # may be compiling in a worktree. Two builds at once exhaust RAM and swap
    # and the compiler dies mid-crate with errors like "can't find crate".
    # A running dev app keeps a parent `cargo run` alive without compiling, so
    # look for actual compilation: any rustc, or a cargo doing build/test/check.
    function Test-CargoBusy {
        if (Get-Process -Name rustc -ErrorAction SilentlyContinue) { return $true }
        $cargos = Get-CimInstance Win32_Process -Filter "Name = 'cargo.exe'" -ErrorAction SilentlyContinue
        foreach ($c in $cargos) { if ($c.CommandLine -match '\s(build|test|check|clippy|tarpaulin)\b') { return $true } }
        return $false
    }
    # Memory headroom: a Tauri dev build plus the app needs several GB of
    # commit. On 2026-09-10 the box sat at its commit limit (crashed editors,
    # leftover shells) and every "out of memory" that day was this (R206).
    $os = Get-CimInstance Win32_OperatingSystem
    $freeCommitGB = [math]::Round($os.FreeVirtualMemory/1MB, 1)
    if ($freeCommitGB -lt 3) {
        Write-Host "== only $freeCommitGB GB of memory commit headroom; a build will likely fail."
        Write-Host "   Close or restart the heavy processes below (or reboot), then rerun:"
        Get-Process | Group-Object ProcessName | ForEach-Object { [pscustomobject]@{ name=$_.Name; n=$_.Count; MB=[math]::Round(($_.Group | Measure-Object PrivateMemorySize64 -Sum).Sum/1MB) } } | Sort-Object MB -Descending | Select-Object -First 8 | Format-Table -AutoSize | Out-String | Write-Host
        throw "insufficient memory headroom ($freeCommitGB GB)"
    }
    $waited = 0
    while (Test-CargoBusy) {
        if ($waited -eq 0) { Write-Host "== another cargo build is running; waiting for the slot (Ctrl+C to stop)" }
        Start-Sleep -Seconds 10; $waited += 10
        if ($waited % 60 -eq 0) { Write-Host "   still waiting ($waited s)" }
    }
}

# node prints deprecation notices on stderr; under Stop that reads as a
# terminating NativeCommandError when output is redirected. Relax for the run.
$ErrorActionPreference = "Continue"
Push-Location app
try {
    if ($Build) { Write-Host "== tauri build (release)"; npm run tauri build }
    else        { Write-Host "== tauri dev";             npm run tauri dev }
} finally { Pop-Location }
