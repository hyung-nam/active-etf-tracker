#!/usr/bin/env node
/**
 * build_latest.js
 * data/history에 누적된 스냅샷들을 읽어서
 * data/latest/ 에 프론트엔드용 JSON을 생성한다.
 *
 * 생성 파일:
 *   holdings.json       — { dates: [...], data: { etfName: { date: [[ticker,name,qty,weight],...] } } }
 *   shares.json         — 동일 구조 (qty 기준 표시용)
 *   summaries_weight.json — 최신 2날짜 비교, 변동요약 (비중 모드)
 *   summaries_shares.json — 최신 2날짜 비교, 변동요약 (수량 모드)
 *   last_updated.json   — { date, updated_at, etf_count }
 */

const fs = require('fs');
const path = require('path');
const {
  ETF_LIST, GLOBAL_ETFS, DOMESTIC_ETFS,
  WEIGHT_THRESHOLD, SHARES_THRESHOLD, HISTORY_KEEP_DAYS
} = require('./constants');

const ROOT = path.resolve(__dirname, '..');
const HISTORY_HOLDINGS = path.join(ROOT, 'data', 'history', 'holdings');
const HISTORY_SHARES = path.join(ROOT, 'data', 'history', 'shares');
const LATEST_DIR = path.join(ROOT, 'data', 'latest');

// ─── 유틸리티 ────────────────────────────────────────

function getAvailableDates(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''))
    .sort()
    .reverse(); // 최신 먼저
}

function parseQuantity(str) {
  if (str === null || str === undefined) return null;
  const n = parseInt(String(str).replace(/,/g, ''), 10);
  return isNaN(n) ? null : n;
}

// ─── holdings.json / shares.json 빌드 ────────────────

function buildMainData(historyDir) {
  const dates = getAvailableDates(historyDir);
  if (dates.length === 0) return null;

  // 최근 HISTORY_KEEP_DAYS 일치만
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - HISTORY_KEEP_DAYS);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const filteredDates = dates.filter(d => d >= cutoffStr);

  const activeNames = new Set(ETF_LIST.map(e => e.name));
  const data = {}; // { etfName: { date: [[ticker,name,qty,weight],...] } }

  for (const date of filteredDates) {
    const filePath = path.join(historyDir, `${date}.json`);
    const snapshot = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    for (const [etfName, rows] of Object.entries(snapshot)) {
      // 운용사 목록에서 빠진(상장폐지) ETF는 latest 빌드에서 제외 — history에는 남는다
      if (!activeNames.has(etfName)) continue;
      if (!data[etfName]) data[etfName] = {};
      data[etfName][date] = rows;
    }
  }

  return { dates: filteredDates, data };
}

// ─── 변동요약 계산 ───────────────────────────────────

function getSummaryForETF(todayRows, prevRows, mode, threshold) {
  // mode: 'weight' → index 3 (parseFloat), 'shares' → index 2 (parseQuantity)
  const valueIndex = mode === 'shares' ? 2 : 3;
  const parseFn = mode === 'shares'
    ? (v) => parseQuantity(v)
    : (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };

  const todayMap = {}; // ticker → { name, value, row }
  const prevMap = {};

  if (todayRows) {
    todayRows.forEach(row => {
      const val = parseFn(row[valueIndex]);
      todayMap[row[0]] = { name: row[1], value: val, row };
    });
  }
  if (prevRows) {
    prevRows.forEach(row => {
      const val = parseFn(row[valueIndex]);
      prevMap[row[0]] = { name: row[1], value: val, row };
    });
  }

  const newIn = [];  // 신규편입
  const newOut = []; // 신규편출
  const buys = [];   // 매수 (증가)
  const sells = [];  // 매도 (감소)

  const allTickers = new Set([...Object.keys(todayMap), ...Object.keys(prevMap)]);

  allTickers.forEach(ticker => {
    const inToday = ticker in todayMap;
    const inPrev = ticker in prevMap;

    if (inToday && !inPrev) {
      newIn.push([ticker, todayMap[ticker].name, todayMap[ticker].value]);
    } else if (!inToday && inPrev) {
      newOut.push([ticker, prevMap[ticker].name, prevMap[ticker].value]);
    } else if (inToday && inPrev) {
      const tv = todayMap[ticker].value;
      const pv = prevMap[ticker].value;
      // 0은 결측이 아님. null/undefined만 결측.
      if (tv === null || pv === null) return;
      const delta = tv - pv;
      if (delta >= threshold) {
        buys.push([ticker, todayMap[ticker].name, delta]);
      } else if (delta <= -threshold) {
        sells.push([ticker, todayMap[ticker].name, delta]);
      }
    }
  });

  // 정렬: 신규편입/편출 이름순, 매수 delta 내림차순, 매도 delta 오름차순
  newIn.sort((a, b) => a[1].localeCompare(b[1], 'ko'));
  newOut.sort((a, b) => a[1].localeCompare(b[1], 'ko'));
  buys.sort((a, b) => b[2] - a[2]);
  sells.sort((a, b) => a[2] - b[2]);

  return { newIn, newOut, buys, sells };
}

function buildSummaries(historyDir, mode) {
  const dates = getAvailableDates(historyDir);
  if (dates.length < 2) {
    console.log(`[build] ${mode} 변동요약: 비교할 날짜 부족 (${dates.length}일)`);
    return null;
  }

  const latestDate = dates[0];
  const prevDate = dates[1];
  const threshold = mode === 'shares' ? SHARES_THRESHOLD : WEIGHT_THRESHOLD;

  const latestData = JSON.parse(fs.readFileSync(path.join(historyDir, `${latestDate}.json`), 'utf-8'));
  const prevData = JSON.parse(fs.readFileSync(path.join(historyDir, `${prevDate}.json`), 'utf-8'));

  const summaries = {};
  const etfNames = ETF_LIST.map(e => e.name);

  for (const etfName of etfNames) {
    const todayRows = latestData[etfName] || null;
    const prevRows = prevData[etfName] || null;

    if (!todayRows) continue;

    summaries[etfName] = getSummaryForETF(todayRows, prevRows, mode, threshold);
  }

  return {
    latestDate,
    prevDate,
    mode,
    threshold,
    globalETFs: GLOBAL_ETFS,
    domesticETFs: DOMESTIC_ETFS,
    summaries
  };
}

// ─── 메인 ────────────────────────────────────────────

function main() {
  console.log('[build] latest JSON 빌드 시작');
  fs.mkdirSync(LATEST_DIR, { recursive: true });

  // 1. holdings.json
  const holdings = buildMainData(HISTORY_HOLDINGS);
  if (holdings) {
    fs.writeFileSync(path.join(LATEST_DIR, 'holdings.json'), JSON.stringify(holdings), 'utf-8');
    console.log(`[build] holdings.json: ${holdings.dates.length}일, ${Object.keys(holdings.data).length} ETF`);
  }

  // 2. shares.json
  const shares = buildMainData(HISTORY_SHARES);
  if (shares) {
    fs.writeFileSync(path.join(LATEST_DIR, 'shares.json'), JSON.stringify(shares), 'utf-8');
    console.log(`[build] shares.json: ${shares.dates.length}일, ${Object.keys(shares.data).length} ETF`);
  }

  // 3. summaries_weight.json
  const sumW = buildSummaries(HISTORY_HOLDINGS, 'weight');
  if (sumW) {
    fs.writeFileSync(path.join(LATEST_DIR, 'summaries_weight.json'), JSON.stringify(sumW), 'utf-8');
    console.log(`[build] summaries_weight.json: ${sumW.latestDate} vs ${sumW.prevDate}`);
  }

  // 4. summaries_shares.json
  const sumS = buildSummaries(HISTORY_SHARES, 'shares');
  if (sumS) {
    fs.writeFileSync(path.join(LATEST_DIR, 'summaries_shares.json'), JSON.stringify(sumS), 'utf-8');
    console.log(`[build] summaries_shares.json: ${sumS.latestDate} vs ${sumS.prevDate}`);
  }

  // 5. last_updated.json
  const latestDate = holdings ? holdings.dates[0] : (shares ? shares.dates[0] : null);
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const updatedAt = kstNow.toISOString().replace('T', ' ').substring(0, 16);

  const meta = {
    date: latestDate,
    updated_at: updatedAt,
    etf_count: holdings ? Object.keys(holdings.data).length : 0,
    dates_available: holdings ? holdings.dates : []
  };
  fs.writeFileSync(path.join(LATEST_DIR, 'last_updated.json'), JSON.stringify(meta, null, 2), 'utf-8');
  console.log(`[build] last_updated.json: ${meta.date}, updated_at=${meta.updated_at}`);

  console.log('[build] 완료!');
}

main();
