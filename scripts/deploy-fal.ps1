<#
  deploy-fal.ps1 - publish the fal catalog branch to highlink-studio-dev, then run gate 2.
  Run from the repo root in PowerShell, AFTER checking out the branch:

      git fetch origin
      git checkout feat/fal-catalog        (first time: git checkout -b feat/fal-catalog --track origin/feat/fal-catalog)
      git pull --ff-only
      powershell -ExecutionPolicy Bypass -File scripts\deploy-fal.ps1

  Every step that touches the cloud asks first (CLAUDE.md: secrets set / functions deploy / seed need Nuha's OK).
  Secrets are never printed: push-secrets.py writes a temp file that is deleted right after `secrets set`.
  No migration in this release (0005 is already applied) - so no `db push`.
#>
param([switch]$SkipChecks)
# Re-run safely: every step asks first, so answer n for steps that already succeeded.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

function Invoke-Checked([string]$Exe, [string[]]$Arguments) {
  Write-Host "> $Exe $($Arguments -join ' ')" -ForegroundColor DarkGray
  & $Exe @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Exe $($Arguments[0]) failed (exit $LASTEXITCODE)" }
}
function Ask([string]$Question) {
  $a = Read-Host "$Question [y/N]"
  return ($a -eq 'y' -or $a -eq 'Y')
}
function Step([string]$Title) { Write-Host "`n== $Title" -ForegroundColor Cyan }

# --- 0) branch + local checks -------------------------------------------------------------
Step '0) Branch and local checks'
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne 'feat/fal-catalog') { throw "You are on '$branch'. Check out feat/fal-catalog first (see the top of this file)." }
if (-not (Test-Path 'supabase\.env.local')) { throw 'supabase\.env.local is missing.' }
if (-not (Select-String -Path 'supabase\.env.local' -Pattern '^FAL_KEY=.{10,}' -Quiet)) { throw 'FAL_KEY is not set in supabase\.env.local.' }
Write-Host 'FAL_KEY found in supabase\.env.local (value not shown).'
Invoke-Checked 'npm' @('--prefix', 'apps/web', 'install', '--no-audit', '--no-fund')
if (-not $SkipChecks) {
  Invoke-Checked 'npm' @('run', 'typecheck')
  Invoke-Checked 'npm' @('run', 'typecheck:functions')
  Invoke-Checked 'npm' @('test')
}

# --- 1) secrets -------------------------------------------------------------------------------
Step '1) Secrets: FAL_KEY (+ RECONCILE_SECRET if missing) -> Supabase'
if (Ask 'Push secrets from supabase\.env.local to the cloud project?') {
  $tmp = Join-Path $env:TEMP ('hl-secrets-' + [guid]::NewGuid().ToString() + '.env')
  try {
    Invoke-Checked 'python' @('-I', 'scripts/push-secrets.py', $tmp)
    & npx supabase secrets set --env-file $tmp
    if ($LASTEXITCODE -ne 0) {
      Write-Host 'secrets set failed (known CLI issue: it ignores the browser login).' -ForegroundColor Yellow
      Write-Host 'Create a personal token at https://supabase.com/dashboard/account/tokens and paste it below (hidden, used for this command only).'
      $sec = Read-Host -AsSecureString 'SUPABASE_ACCESS_TOKEN'
      $env:SUPABASE_ACCESS_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
      try { Invoke-Checked 'npx' @('supabase', 'secrets', 'set', '--env-file', $tmp) }
      finally { Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue }
    }
  } finally {
    if (Test-Path $tmp) { Remove-Item $tmp -Force }
  }
  Invoke-Checked 'npx' @('supabase', 'secrets', 'list')
}

# --- 2) functions -------------------------------------------------------------------------------
Step '2) Deploy the five Edge Functions'
if (Ask 'Deploy generate-media, asset-thumbnail, provider-webhook, v1, reconcile?') {
  Invoke-Checked 'npx' @('supabase', 'functions', 'deploy', 'generate-media')
  Invoke-Checked 'npx' @('supabase', 'functions', 'deploy', 'asset-thumbnail')
  Invoke-Checked 'npx' @('supabase', 'functions', 'deploy', 'provider-webhook', '--no-verify-jwt')
  Invoke-Checked 'npx' @('supabase', 'functions', 'deploy', 'v1', '--no-verify-jwt')
  Invoke-Checked 'npx' @('supabase', 'functions', 'deploy', 'reconcile', '--no-verify-jwt')
}

# --- 3) seed ----------------------------------------------------------------------------------
# Tries `supabase db query --linked` first. If the CLI cannot open its login role (TransportError),
# falls back to the Management API (HTTPS only) with a personal token typed hidden, kept in memory for this step only.
function Read-Token {
  Write-Host 'Create a personal token at https://supabase.com/dashboard/account/tokens and paste it below (hidden, used for this step only).'
  $sec = Read-Host -AsSecureString 'SUPABASE_ACCESS_TOKEN'
  return [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
}
function Invoke-SqlApi([string]$File, [string]$Token, [string]$Ref) {
  $sql = [IO.File]::ReadAllText($File, [Text.Encoding]::UTF8)
  $json = @{ query = $sql } | ConvertTo-Json -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  return Invoke-RestMethod -Method Post -Uri "https://api.supabase.com/v1/projects/$Ref/database/query" `
    -Headers @{ Authorization = "Bearer $Token" } -ContentType 'application/json; charset=utf-8' -Body $bytes
}

Step '3) Seed: plans, manual models (Kling-Replicate off), 233 fal models (133 on)'
if (Ask 'Apply supabase/seed.sql to the cloud database (in batches)?') {
  $dir = Join-Path $env:TEMP ('hl-seed-' + [guid]::NewGuid().ToString())
  $ref = (Get-Content 'supabase\.temp\project-ref' -Raw).Trim()
  $token = $null
  try {
    Invoke-Checked 'python' @('-I', 'scripts/split-seed.py', 'supabase/seed.sql', $dir)
    $verify = Join-Path $dir 'zz-verify.sql'
    Set-Content -Path $verify -Encoding ASCII -Value "select provider, type, enabled, count(*) as n from public.models group by 1, 2, 3 order by 1, 2, 3;"
    foreach ($f in (Get-ChildItem $dir -Filter '*.sql' | Sort-Object Name)) {
      Write-Host "  $($f.Name)"
      if (-not $token) {
        & npx supabase db query --linked -f $f.FullName
        if ($LASTEXITCODE -eq 0) { continue }
        Write-Host 'db query via CLI failed - switching to the Management API (HTTPS).' -ForegroundColor Yellow
        $token = Read-Token
      }
      $out = Invoke-SqlApi -File $f.FullName -Token $token -Ref $ref
      if ($f.Name -eq 'zz-verify.sql') { $out | Format-Table -AutoSize | Out-Host }
    }
  } finally {
    $token = $null
    if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
  }
}

# --- 4) gate 2 ------------------------------------------------------------------------------
Step '4) Smoke test + gate 2 (real Replicate image ~$0.30, real fal video ~$0.13)'
if (Ask 'Run scripts/smoke-gate1.py now (takes a few minutes)?') {
  Invoke-Checked 'python' @('-I', 'scripts/smoke-gate1.py')
}

Write-Host "`nDone. Last check by eye: npm run dev -> http://localhost:5173/video-generate -> Hailuo -> generate, and watch it finish without refreshing." -ForegroundColor Green
