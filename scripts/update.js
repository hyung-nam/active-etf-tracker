#!/usr/bin/env node
/**
 * update.js — 매일 08:00 KST 실행
 * 17개 ETF 구성종목 데이터를 timeetf.co.kr에서 크롤링하여
 * data/history/holdings/YYYY-MM-DD.json
 * data/history/shares/YYYY-MM-DD.json
 * 형태로 누적 저장한다.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { ETF_LIST, CRAWL_BASE_URL } = require('./constants');

const ROOT = path.resolve(__dirname, '..');
const HISTORY_HOLDINGS = path.join(ROOT, 'data', 'history', 'holdings');
const HISTORY_SHARES = path.join(ROOT, 'data', 'history', 'shares');

// ─── 유틸리티 ────────────────────────────────────────

function getTodayKST() {
  // 커맨드라인 인자로 날짜 지정 가능: node update.js 2026-02-20
  if (process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2])) {
    return process.argv[2];
  }
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}

function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── 선물 티커 정규화 ────────────────────────────────
// timeetf.co.kr에서 선물 티커가 크롤링 시점에 따라 달라지는 문제 방지
// 예: "HCTH26 Index" → "HCTH6 Index", "HCTH6" → "HCTH6 Index"
// 선물 월코드: F(1) G(2) H(3) J(4) K(5) M(6) N(7) Q(8) U(9) V(10) X(11) Z(12)

const FUTURES_MONTH_CODES = 'FGHJKMNQUVXZ';

function normalizeFuturesTicker(ticker) {
  // 패턴: ROOT(2~4자) + MONTH_CODE + YEAR(1~2자리) + 선택적 " Index"
  const m = ticker.match(/^([A-Z]{2,5})([FGHJKMNQUVXZ])(\d{1,2})(\s+Index)?$/);
  if (!m) return ticker;

  const root = m[1];
  const monthCode = m[2];
  const yearRaw = m[3];
  // 연도를 1자리로 통일 (26 → 6, 6 → 6)
  const yearNorm = String(parseInt(yearRaw, 10) % 10);

  return `${root}${monthCode}${yearNorm} Index`;
}

// ─── HTML 파싱 ───────────────────────────────────────

function parseETFPage(html) {
  // <tr> 안의 <td> 값 추출 (정규식 기반, 더보기 상관없이 전체 HTML에 있음)
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRe.exec(html)) !== null) {
    const cells = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch;
    while ((tdMatch = tdRe.exec(trMatch[1])) !== null) {
      cells.push(tdMatch[1].replace(/<[^>]*>/g, '').trim());
    }
    // 5개 이상 컬럼: 종목코드, 종목명, 수량, 평가금액, 비중
    if (cells.length >= 5) {
      const ticker = cells[0];
      const name = cells[1];
      const qty = cells[2];
      const weight = cells[4];
      // 헤더행, 빈행, 현금 제외
      if (ticker && ticker !== '종목코드' && name !== '현금') {
        rows.push([normalizeFuturesTicker(ticker), name, qty, weight]);
      }
    }
  }
  return rows;
}

// ─── 메인 크롤링 ─────────────────────────────────────

async function crawlAll(date) {
  console.log(`[update] 크롤링 시작: ${date}`);
  console.log(`[update] 대상: ${ETF_LIST.length}개 ETF`);

  const holdingsData = {};
  const sharesData = {};
  let success = 0;
  let fail = 0;

  for (const etf of ETF_LIST) {
    const url = `${CRAWL_BASE_URL}?idx=${etf.idx}&pdfDate=${date}`;
    try {
      const html = await fetchHTML(url);
      const rows = parseETFPage(html);

      if (rows.length === 0) {
        console.warn(`  ⚠ ${etf.name}: 0건 (공휴일/미공시 가능)`);
        fail++;
        continue;
      }

      // holdings: [ticker, name, qty_str, weight_str] 그대로 저장
      holdingsData[etf.name] = rows;

      // shares: 동일 구조 (프론트에서 qty/weight 선택해 사용)
      sharesData[etf.name] = rows;

      console.log(`  ✓ ${etf.name}: ${rows.length}건`);
      success++;
    } catch (err) {
      console.error(`  ✗ ${etf.name}: ${err.message}`);
      fail++;
    }

    await sleep(800); // 서버 부하 방지
  }

  console.log(`[update] 완료: 성공 ${success}, 실패 ${fail}`);
  return { holdingsData, sharesData, success, fail };
}

// ─── 파일 저장 ───────────────────────────────────────

function saveHistory(date, holdingsData, sharesData) {
  // 디렉토리 확인
  fs.mkdirSync(HISTORY_HOLDINGS, { recursive: true });
  fs.mkdirSync(HISTORY_SHARES, { recursive: true });

  const holdingsPath = path.join(HISTORY_HOLDINGS, `${date}.json`);
  const sharesPath = path.join(HISTORY_SHARES, `${date}.json`);

  fs.writeFileSync(holdingsPath, JSON.stringify(holdingsData, null, 2), 'utf-8');
  fs.writeFileSync(sharesPath, JSON.stringify(sharesData, null, 2), 'utf-8');

  console.log(`[update] 저장 완료:`);
  console.log(`  → ${holdingsPath}`);
  console.log(`  → ${sharesPath}`);
}

// ─── 실행 ────────────────────────────────────────────

async function main() {
  const date = getTodayKST();

  // 이미 크롤링된 날짜인지 확인
  const existingPath = path.join(HISTORY_HOLDINGS, `${date}.json`);
  if (fs.existsSync(existingPath)) {
    console.log(`[update] ${date} 데이터 이미 존재 — 덮어쓰기`);
  }

  const { holdingsData, sharesData, success, fail } = await crawlAll(date);

  if (success === 0) {
    console.error('[update] 모든 ETF 크롤링 실패! 저장하지 않음.');
    process.exit(1);
  }

  saveHistory(date, holdingsData, sharesData);

  // 결과 요약을 GitHub Actions에서 활용할 수 있도록 출력
  console.log(JSON.stringify({
    date,
    success,
    fail,
    etf_count: Object.keys(holdingsData).length
  }));
}

main().catch(err => {
  console.error('[update] 치명적 오류:', err);
  process.exit(1);
});
