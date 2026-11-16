# Fetch whale textures for coo-pet.
#
# This repository does NOT ship the whale artwork (rights chain: see
# THIRD_PARTY_NOTICES.md). This script extracts the whale sprite folder
# from the official upstream release package of takboo/dsh-coopanion
# and places it into assets/pet/whale/. The artwork is distributed by
# the upstream project itself; we only point the download at it.

$ErrorActionPreference = 'Stop'

$dest = Join-Path $PSScriptRoot 'pet\whale'
if (Test-Path (Join-Path $dest 'model.json')) {
  Write-Host 'Whale textures are already in place. Nothing to do.'
  exit 0
}

$tmp = Join-Path $env:TEMP ('coo-whale-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  $tgz = Join-Path $tmp 'pack.tgz'
  # GitHub direct first, then CN-friendly mirror prefixes (mirrors wrap the same URL).
  # Mirrors come and go; the .cmd fallback explains the manual route if all fail.
  $urls = @(
    'https://github.com/takboo/dsh-coopanion/releases/latest/download/dsh-coopanion.tgz',
    'https://ghfast.top/https://github.com/takboo/dsh-coopanion/releases/latest/download/dsh-coopanion.tgz',
    'https://gh-proxy.com/https://github.com/takboo/dsh-coopanion/releases/latest/download/dsh-coopanion.tgz'
  )
  $ok = $false
  foreach ($url in $urls) {
    Write-Host "Trying: $url"
    try {
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      Invoke-WebRequest -Uri $url -OutFile $tgz -UseBasicParsing -TimeoutSec 120
      if ((Get-Item $tgz).Length -gt 100000) { $ok = $true; break }  # sanity: real package, not an error page
      Write-Host '  downloaded file looks wrong (too small), trying next source...'
    } catch {
      Write-Host "  failed: $($_.Exception.Message)"
    }
  }
  if (-not $ok) { throw 'all download sources failed; see the manual instructions printed by get-whale.cmd' }

  Write-Host 'Extracting...'
  $x = Join-Path $tmp 'x'
  New-Item -ItemType Directory -Path $x | Out-Null
  tar -xzf $tgz -C $x
  if ($LASTEXITCODE -ne 0) { throw 'tar extraction failed' }

  $whale = Get-ChildItem -Path $x -Recurse -Directory -Filter 'whale' |
    Where-Object { Test-Path (Join-Path $_.FullName 'model.json') } |
    Select-Object -First 1
  if (-not $whale) { throw 'whale folder (with model.json) not found in the package; upstream layout may have changed' }

  New-Item -ItemType Directory -Path $dest -Force | Out-Null
  Copy-Item -Path (Join-Path $whale.FullName '*') -Destination $dest -Recurse -Force

  $n = (Get-ChildItem -Path $dest -Recurse -File).Count
  Write-Host "Done: $n files placed into $dest"
  Write-Host 'Restart DSH and the pet will show up.'
} finally {
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
