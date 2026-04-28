import corpCodeData from "./corp-code-data.json";

/**
 * DART corpCode 매핑 — 종목코드(6자리) → corp_code(8자리)
 *
 * DART는 자체 8자리 corp_code를 모든 API 키로 사용하지만, 사용자는
 * 6자리 KOSPI/KOSDAQ 종목코드만 알고 있다.
 *
 * 데이터 출처:
 * - `corp-code-data.json` (정적, 빌드 시점에 생성됨)
 * - `scripts/build-corp-code.mjs`가 빌드 시 DART corpCode.xml.zip을
 *   다운로드 → 압축해제 → 파싱 → JSON으로 저장
 *
 * 왜 빌드 시점에 하나 (이전 런타임 다운로드 방식 폐기 이유):
 * - 런타임 cold start에서 3.5MB ZIP 다운로드 + 압축해제 + 100k 정규식
 *   파싱이 Vercel(US East)에서 60~90초 → 사용자 첫 검색 timeout
 * - 정적 JSON을 import하면 cold start ~5ms 이내로 단축
 * - corp_code 매핑은 신생 상장이 잦지 않아 빌드 단위 신선도 충분
 *
 * 메모리 캐시는 더 이상 필요 없지만(이미 정적), 검색 인덱스 빌드만
 * 한 번 해두기 위해 lazy Map을 유지한다.
 */

type CorpEntry = {
  corpCode: string;
  corpName: string;
  stockCode: string;
};

let stockCodeIndex: Map<string, CorpEntry> | null = null;

/**
 * 정적 데이터로부터 stockCode 인덱스 1회 빌드 (lazy).
 */
function getIndex(): Map<string, CorpEntry> {
  if (stockCodeIndex) return stockCodeIndex;
  const idx = new Map<string, CorpEntry>();
  for (const e of corpCodeData as CorpEntry[]) {
    idx.set(e.stockCode, e);
  }
  stockCodeIndex = idx;
  return idx;
}

/**
 * 종목코드 → corp_code 변환.
 *
 * @param stockCode 6자리 종목코드 (앞 0 패딩 자동 처리)
 * @returns corp_code(8자리). 매핑 없으면 null
 */
export async function findCorpCode(stockCode: string): Promise<string | null> {
  const code = stockCode.replace(/[^\d]/g, "").padStart(6, "0");
  const entry = getIndex().get(code);
  return entry?.corpCode ?? null;
}

/**
 * 종목코드 → 회사명 + corp_code (둘 다 필요할 때).
 */
export async function findCorpInfo(
  stockCode: string
): Promise<CorpEntry | null> {
  const code = stockCode.replace(/[^\d]/g, "").padStart(6, "0");
  return getIndex().get(code) ?? null;
}

/**
 * 한글 입력 → DART 영문 등재 회사명 별칭 매핑.
 *
 * DART는 일부 회사를 영문으로만 등재 (예: NAVER, POSCO홀딩스, LG, SK,
 * KT&G 등). 사용자가 한글로 검색해도 자연스럽게 매치되도록 별칭 사전.
 *
 * 부분 일치도 인식: "네이버" → "NAVER" 외에도 "엘지" → "LG" 류는
 * "LG전자", "LG화학", "LG에너지솔루션" 등 LG 그룹사 모두 잡힘 (LG로
 * 시작/포함되니).
 */
const KOREAN_TO_ENGLISH_ALIASES: Record<string, string[]> = {
  네이버: ["NAVER"],
  엘지: ["LG"],
  에스케이: ["SK"],
  포스코: ["POSCO"],
  케이티: ["KT"],
  케이비: ["KB"],
  케이지: ["KG"],
  하나: ["HANA"],
  신한: ["SHINHAN"],
  비지에프: ["BGF"],
  씨제이: ["CJ"],
  지에스: ["GS"],
  에이치디: ["HD"],
  에이치엘: ["HL"],
  엔에이치: ["NH"],
  디비: ["DB"],
  비와이씨: ["BYC"],
  오씨아이: ["OCI"],
};

/**
 * 회사명 부분일치 검색 — 자동완성용.
 *
 * 정렬 우선순위:
 *   1. 정확 일치 (예: "삼성전자")
 *   2. 시작 일치 (예: "삼성" → "삼성전자")
 *   3. 회사명 길이 짧은 순
 *   4. 같은 길이 안에서는 stockCode 작은 순 (오래된 KOSPI = 보통 큰 회사)
 *
 * 한·영 별칭 처리:
 *   - 한글 입력에 별칭이 있으면 alias 키워드로도 검색해 결과를 머지
 *   - 예: "네이버" → "네이버" 검색(0건) + "NAVER" 검색(1건) → NAVER 표시
 *
 * 성능: 약 3,000개 상장사 순회 + 별칭 1~2개 추가 순회 → ~10ms 이내
 */
export async function searchByName(
  query: string,
  limit: number = 10
): Promise<CorpEntry[]> {
  const q = query.trim();
  if (q.length < 1) return [];

  // 한글 → 영문 alias 적용 (있으면 추가 키워드로 함께 검색)
  const aliases = KOREAN_TO_ENGLISH_ALIASES[q.toLowerCase()] ?? [];
  const keywords = [q, ...aliases];
  const keywordsLower = keywords.map((k) => k.toLowerCase());

  // 같은 stockCode 중복 방지를 위해 Map 사용
  const matchMap = new Map<string, CorpEntry>();

  for (const entry of getIndex().values()) {
    const nameLower = entry.corpName.toLowerCase();
    if (keywordsLower.some((kw) => nameLower.includes(kw))) {
      matchMap.set(entry.stockCode, entry);
    }
  }

  const matches = Array.from(matchMap.values());

  matches.sort((a, b) => {
    // 정확 일치 — query 또는 alias 중 하나와 정확히 같으면 최우선
    const aExact = keywords.includes(a.corpName) ? 0 : 1;
    const bExact = keywords.includes(b.corpName) ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;

    // 시작 일치 — 어느 키워드로든 시작하면 우선
    const aStarts = keywordsLower.some((kw) =>
      a.corpName.toLowerCase().startsWith(kw)
    )
      ? 0
      : 1;
    const bStarts = keywordsLower.some((kw) =>
      b.corpName.toLowerCase().startsWith(kw)
    )
      ? 0
      : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;

    if (a.corpName.length !== b.corpName.length) {
      return a.corpName.length - b.corpName.length;
    }
    return parseInt(a.stockCode, 10) - parseInt(b.stockCode, 10);
  });

  return matches.slice(0, limit);
}
