#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "[1/4] git pull..."
git pull origin main --rebase

echo "[2/4] 크롤링..."
node scripts/update.js

echo "[3/4] 빌드..."
node scripts/build_latest.js

echo "[4/4] 커밋 & 푸시..."
DATE=$(node -e "const d=new Date();d.setHours(d.getHours()+9);console.log(d.toISOString().slice(0,10))")
git add data/
git commit -m "data: $DATE ETF holdings update (18 ETFs)"
git push origin main

echo "완료!"
