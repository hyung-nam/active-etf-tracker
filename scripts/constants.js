// ETF 목록 및 크롤링 설정 (공유 모듈)
const ETF_LIST = [
  { idx: '22', name: 'TIME 글로벌탑픽액티브' },
  { idx: '16', name: 'TIME K신재생에너지액티브' },
  { idx: '9',  name: 'TIME 글로벌바이오액티브' },
  { idx: '20', name: 'TIME 글로벌우주테크&방산액티브' },
  { idx: '5',  name: 'TIME 미국S&P500액티브' },
  { idx: '13', name: 'TIME K바이오액티브' },
  { idx: '19', name: 'TIME 차이나AI테크액티브' },
  { idx: '6',  name: 'TIME 글로벌AI인공지능액티브' },
  { idx: '12', name: 'TIME Korea플러스배당액티브' },
  { idx: '2',  name: 'TIME 미국나스닥100액티브' },
  { idx: '18', name: 'TIME 미국배당다우존스액티브' },
  { idx: '10', name: 'TIME 미국나스닥100채권혼합50액티브' },
  { idx: '11', name: 'TIME 코스피액티브' },
  { idx: '8',  name: 'TIME 글로벌소비트렌드액티브' },
  { idx: '15', name: 'TIME 코리아밸류업액티브' },
  { idx: '17', name: 'TIME K이노베이션액티브' },
  { idx: '1',  name: 'TIME K컬처액티브' },
  { idx: '24', name: 'TIME 코스닥액티브' }
];

const GLOBAL_ETFS = [
  'TIME 글로벌탑픽액티브', 'TIME 글로벌바이오액티브', 'TIME 글로벌우주테크&방산액티브',
  'TIME 미국S&P500액티브', 'TIME 차이나AI테크액티브', 'TIME 글로벌AI인공지능액티브',
  'TIME 미국나스닥100액티브', 'TIME 미국배당다우존스액티브',
  'TIME 미국나스닥100채권혼합50액티브', 'TIME 글로벌소비트렌드액티브'
];

const DOMESTIC_ETFS = [
  'TIME K신재생에너지액티브', 'TIME K바이오액티브', 'TIME Korea플러스배당액티브',
  'TIME 코스피액티브', 'TIME 코리아밸류업액티브', 'TIME K이노베이션액티브', 'TIME K컬처액티브',
  'TIME 코스닥액티브'
];

const CRAWL_BASE_URL = 'https://timeetf.co.kr/constituent_popup.php';

// 변동요약 임계값
const WEIGHT_THRESHOLD = 0.5;
const SHARES_THRESHOLD = 10;

// history 보존 일수
const HISTORY_KEEP_DAYS = 120;

module.exports = {
  ETF_LIST, GLOBAL_ETFS, DOMESTIC_ETFS,
  CRAWL_BASE_URL, WEIGHT_THRESHOLD, SHARES_THRESHOLD, HISTORY_KEEP_DAYS
};
