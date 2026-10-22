# تشغيل أول مرة على ويندوز — من داخل مجلد highlink-studio:
#   powershell -ExecutionPolicy Bypass -File scripts\bootstrap.ps1
# يثبّت الحزم، يتحقق، ينشئ git، ويرفع المستودع خاصًا إلى GitHub (يلزم gh مسجّل الدخول).
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

Write-Host '1/4 تثبيت الحزم' -ForegroundColor Cyan
npm run install:web

Write-Host '2/4 التحقق (typecheck + test + build)' -ForegroundColor Cyan
npm run typecheck
npm test
npm run build

Write-Host '3/4 git' -ForegroundColor Cyan
if (-not (Test-Path '.git')) {
  git init -b main
  git add -A
  git commit -m "chore: phase 0 scaffold (Highlink Studio)"
}

Write-Host '4/4 GitHub (خاص)' -ForegroundColor Cyan
gh auth status
gh repo create highlink-studio --private --source . --push

Write-Host 'تم. الخطوة التالية: انسخي apps\web\.env.example إلى apps\web\.env.local وضعي رابط Supabase ومفتاح anon.' -ForegroundColor Green
