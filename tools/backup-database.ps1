<#
.SYNOPSIS
  Makes a backup of the Kabisera Ledger database as a single .zip file.

.DESCRIPTION
  Uses the Supabase CLI (already installed by `npm install`). Writes the structure and the data to a .zip in .\backups.
  By default it also includes the sign-in accounts (the "auth" schema), because a backup that cannot restore your
  owner and staff logins is of little use. THAT MAKES THE FILE SENSITIVE: it holds customer names, contact numbers,
  financial records and password hashes. Store it somewhere private and encrypted, and never commit or e-mail it.

  NOT YET TESTED by the person who wrote it (no database was available). Try it on your local database first, and
  try RESTORING it (docs\BACKUP-RESTORE.md) before you rely on it.

.EXAMPLE
  .\tools\backup-database.ps1                       # your local Supabase (npm run db:start must be running)
  $env:DATABASE_URL = "postgresql://..."            # the direct connection string from your Supabase project
  .\tools\backup-database.ps1 -Target url
  .\tools\backup-database.ps1 -Target url -ExcludeSignIns   # business data only
#>
param(
  [ValidateSet("local", "url")] [string] $Target = "local",
  [string] $OutDir = "backups",
  [switch] $ExcludeSignIns
)

$ErrorActionPreference = "Stop"

function Invoke-Dump {
  param([string[]] $Arguments)
  & npx supabase db dump @Arguments
  if ($LASTEXITCODE -ne 0) { throw "The Supabase CLI stopped with an error (exit code $LASTEXITCODE). No backup was made." }
}

if ($Target -eq "url" -and [string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
  throw "Set `$env:DATABASE_URL to your project's direct connection string first (never paste it into a file you share)."
}
$connection = if ($Target -eq "local") { @("--local") } else { @("--db-url", $env:DATABASE_URL) }

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$files = @()

$structure = Join-Path $OutDir "kabisera-$stamp-1-structure.sql"
Invoke-Dump ($connection + @("--file", $structure)); $files += $structure

$data = Join-Path $OutDir "kabisera-$stamp-2-data.sql"
Invoke-Dump ($connection + @("--data-only", "--file", $data)); $files += $data

if (-not $ExcludeSignIns) {
  $signins = Join-Path $OutDir "kabisera-$stamp-3-signins.sql"
  Invoke-Dump ($connection + @("--data-only", "--schema", "auth", "--file", $signins)); $files += $signins
}

foreach ($f in $files) {
  if (-not (Test-Path $f) -or (Get-Item $f).Length -lt 100) { throw "The backup file $f is missing or empty. Do not trust this backup." }
}

$zip = Join-Path $OutDir "kabisera-$stamp.zip"
Compress-Archive -Path $files -DestinationPath $zip
Remove-Item $files

Write-Host ""
Write-Host "Backup written: $zip" -ForegroundColor Green
Write-Host "It contains customer and financial records. Keep it private and encrypted." -ForegroundColor Yellow
if ($ExcludeSignIns) { Write-Host "Sign-in accounts were NOT included." -ForegroundColor Yellow }
