// 텔레그램 변동요약 알림 스크립트
// summaries_weight.json을 읽어 글로벌/국내별 변동을 합산하여 텔레그램으로 전송

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_PATH = path.join(__dirname, '..', 'data', 'latest', 'summaries_weight.json');

function loadSummaries() {
  const raw = fs.readFileSync(DATA_PATH, 'utf-8');
  return JSON.parse(raw);
}

// 여러 ETF의 특정 카테고리(newIn/newOut/buys/sells)에서 종목명을 합산 (중복 제거, 이름순 정렬)
function aggregateNames(summaries, etfNames, category) {
  const nameSet = new Set();
  for (const etf of etfNames) {
    const items = summaries[etf]?.[category] || [];
    for (const item of items) {
      nameSet.add(item[1]); // item[1] = 종목명
    }
  }
  return [...nameSet].sort((a, b) => a.localeCompare(b, 'ko'));
}

function formatSection(label, summaries, etfNames) {
  const newIn  = aggregateNames(summaries, etfNames, 'newIn');
  const newOut = aggregateNames(summaries, etfNames, 'newOut');
  const buys   = aggregateNames(summaries, etfNames, 'buys');
  const sells  = aggregateNames(summaries, etfNames, 'sells');

  if (!newIn.length && !newOut.length && !buys.length && !sells.length) {
    return `━━ ${label} ━━\n변동 없음`;
  }

  const lines = [`━━ ${label} ━━`];
  if (newIn.length)  lines.push(`🆕 신규편입: ${newIn.join(', ')}`);
  if (newOut.length) lines.push(`🚫 신규편출: ${newOut.join(', ')}`);
  if (buys.length)   lines.push(`📈 매수: ${buys.join(', ')}`);
  if (sells.length)  lines.push(`📉 매도: ${sells.join(', ')}`);
  return lines.join('\n');
}

function buildMessage(data) {
  const { latestDate, prevDate, globalETFs, domesticETFs, summaries } = data;

  const header = `📊 TIME ETF 변동요약 (${latestDate} vs ${prevDate})`;
  const globalSection  = formatSection('글로벌', summaries, globalETFs);
  const domesticSection = formatSection('국내', summaries, domesticETFs);

  return [header, '', globalSection, '', domesticSection].join('\n');
}

function sendTelegram(token, chatId, text) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      chat_id: chatId,
      text: text,
    });

    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(body));
        } else {
          reject(new Error(`Telegram API ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log('TELEGRAM_BOT_TOKEN 또는 TELEGRAM_CHAT_ID가 설정되지 않아 알림을 건너뜁니다.');
    return;
  }

  if (!fs.existsSync(DATA_PATH)) {
    console.log('summaries_weight.json이 없어 알림을 건너뜁니다.');
    return;
  }

  const data = loadSummaries();
  const message = buildMessage(data);

  console.log('--- 텔레그램 메시지 ---');
  console.log(message);
  console.log('----------------------');

  await sendTelegram(token, chatId, message);
  console.log('텔레그램 알림 전송 완료!');
}

main().catch((err) => {
  console.error('텔레그램 알림 실패:', err.message);
  process.exit(1);
});
