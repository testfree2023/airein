# Remote one-liner bootstrap: clone airein then airein setup --yes
# Usage:
#   irm https://raw.githubusercontent.com/testfree2023/airein/main/scripts/install.ps1 | iex
# Env:
#   AIREIN_REPO_URL  (default: https://github.com/testfree2023/airein.git)
#   AIREIN_BRANCH    (default: main)
#   AIREIN_HOSTS     (optional, e.g. claude-code or claude-code,cursor)

$ErrorActionPreference = 'Stop'

$RepoUrl = if ($env:AIREIN_REPO_URL) { $env:AIREIN_REPO_URL } else { 'https://github.com/testfree2023/airein.git' }
$Branch = if ($env:AIREIN_BRANCH) { $env:AIREIN_BRANCH } else { 'main' }

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "required command not found: $Name"
  }
}

Require-Command git
Require-Command node

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("airein-install-" + [guid]::NewGuid().ToString('n'))
New-Item -ItemType Directory -Path $tmp | Out-Null

try {
  Write-Host "-> cloning $RepoUrl (branch $Branch) ..."
  & git clone --depth 1 --branch $Branch $RepoUrl (Join-Path $tmp 'airein')
  if ($LASTEXITCODE -ne 0) { throw "git clone failed ($LASTEXITCODE)" }

  $root = Join-Path $tmp 'airein'
  $setupArgs = @('setup', '--yes')
  if ($env:AIREIN_HOSTS) {
    $setupArgs += @('--hosts', $env:AIREIN_HOSTS)
  }

  Push-Location $env:USERPROFILE
  try {
    if (Get-Command bash -ErrorAction SilentlyContinue) {
      Write-Host "-> running airein setup --yes (via bash) ..."
      $aireinSh = (Join-Path $root 'airein') -replace '\\', '/'
      & bash $aireinSh @setupArgs
      if ($LASTEXITCODE -ne 0) { throw "airein setup failed ($LASTEXITCODE)" }
    } else {
      Write-Host "-> running airein setup --yes (via node) ..."
      $orch = Join-Path $root 'scripts\lib\install-orchestrator.js'
      $env:AIREIN_INVOKE_SOURCE = $root
      & node $orch @setupArgs
      if ($LASTEXITCODE -ne 0) { throw "airein setup failed ($LASTEXITCODE)" }
    }
  } finally {
    Pop-Location
  }

  Write-Host ""
  Write-Host "OK install finished. Verify with:"
  Write-Host "   bash ~/.airein/scripts/update/verify-airein.sh --full"
  Write-Host "Uninstall: airein uninstall"
} finally {
  if (Test-Path $tmp) {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  }
}