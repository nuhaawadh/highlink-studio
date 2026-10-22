#!/usr/bin/env bash
# نفس bootstrap.ps1 لماك/لينكس:  bash scripts/bootstrap.sh
set -euo pipefail
cd "$(dirname "$0")/.."
echo "1/4 تثبيت الحزم";        npm run install:web
echo "2/4 التحقق";            npm run typecheck && npm test && npm run build
echo "3/4 git";               [ -d .git ] || { git init -b main && git add -A && git commit -m "chore: phase 0 scaffold (Highlink Studio)"; }
echo "4/4 GitHub (خاص)";      gh auth status && gh repo create highlink-studio --private --source . --push
echo "تم. التالي: cp apps/web/.env.example apps/web/.env.local ثم ضعي رابط Supabase ومفتاح anon."
