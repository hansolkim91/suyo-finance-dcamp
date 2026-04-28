import { unzipSync, strFromU8 } from "fflate";
import { dartFetchBinary } from "./client";

/**
 * DART corpCode 매핑 — 종목코드(6자리) → corp_code(8자리)
 *
 * DART는 자체 8자리 corp_code를 모든 API 키로 사용하지만, 사용자는
 * 6자리 KOSPI/KOSDAQ 종목코드만 알고 있다. DART는 두 코드 매핑을
 * `corpCode.xml.zip`(약 3MB ZIP)로 제공한다.
 *
 * 캐시 전략:
 * - 메모리 Map (1일 TTL) — Vercel cold start마다 1초 미만 추가
 * - KV/Blob로 옮기는 것은 트래픽이 늘어난 후 (v6)
 *
 * XML 파싱:
 * - 구조가 단순 (`<list><corp_code>...<stock_code>...</list>`)해서 정규식으로 충분
 * - fast-xml-parser 같은 의존성 안 추가 (fflate만 추가됨)
 */

type CorpEntry = {
  corpCode: string;
  corpName: string;
  stockCode: string;
};

type Cache = {
  byStockCode: Map<string, CorpEntry>;
  expiresAt: number;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1일
let cache: Cache | null = null;

/**
 * corpCode.xml.zip 다운로드 + 압축 해제 + 파싱.
 *
 * 응답 ZIP 안에는 단일 CORPCODE.xml 파일 (UTF-8).
 * fflate.unzipSync는 동기지만 ZIP이 작아(3MB) 서버에서 50ms 이내.
 */
async function downloadCorpCodeXml(): Promise<string> {
  const zipBuffer = await dartFetchBinary("corpCode.xml");
  const files = unzipSync(new Uint8Array(zipBuffer));
  // ZIP 안에 보통 "CORPCODE.xml" 한 개만 있음
  const xmlEntry = Object.entries(files)[0];
  if (!xmlEntry) {
    throw new Error("DART corpCode.xml.zip에 파일이 없습니다.");
  }
  return strFromU8(xmlEntry[1]);
}

/**
 * XML에서 list 항목 파싱.
 *
 * 정규식 선택 이유:
 * - XML 구조가 매우 단순 (depth 2, 동일 패턴 반복)
 * - 100,000개 회사 × DOM 파서는 메모리·CPU 낭비
 * - 정규식 한 번 매칭으로 끝
 */
function parseCorpCodeXml(xml: string): CorpEntry[] {
  const entries: CorpEntry[] = [];
  // <list> ... </list> 블록을 모두 찾는다
  const listRegex = /<list>([\s\S]*?)<\/list>/g;
  const fieldRegex = (tag: string) =>
    new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);

  let match: RegExpExecArray | null;
  while ((match = listRegex.exec(xml)) !== null) {
    const block = match[1];
    const corpCode = block.match(fieldRegex("corp_code"))?.[1]?.trim() ?? "";
    const corpName = block.match(fieldRegex("corp_name"))?.[1]?.trim() ?? "";
    const stockCode = block.match(fieldRegex("stock_code"))?.[1]?.trim() ?? "";

    // 상장사만 (stock_code가 빈 항목은 비상장)
    if (corpCode && stockCode) {
      entries.push({ corpCode, corpName, stockCode });
    }
  }
  return entries;
}

/**
 * 캐시 빌드 — 상장사만 stockCode 키로 인덱싱.
 */
async function buildCache(): Promise<Cache> {
  const xml = await downloadCorpCodeXml();
  const entries = parseCorpCodeXml(xml);
  const byStockCode = new Map<string, CorpEntry>();
  for (const e of entries) {
    byStockCode.set(e.stockCode, e);
  }
  return {
    byStockCode,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
}

/**
 * 종목코드 → corp_code 변환.
 *
 * @param stockCode 6자리 종목코드 (앞 0 패딩 자동 처리)
 * @returns corp_code(8자리). 매핑 없으면 null
 */
export async function findCorpCode(stockCode: string): Promise<string | null> {
  const code = stockCode.replace(/[^\d]/g, "").padStart(6, "0");

  if (!cache || cache.expiresAt < Date.now()) {
    cache = await buildCache();
    console.log(`[DART corpCode] 캐시 빌드: ${cache.byStockCode.size}개 상장사`);
  }

  const entry = cache.byStockCode.get(code);
  return entry?.corpCode ?? null;
}

/**
 * 종목코드 → 회사명 + corp_code (둘 다 필요할 때).
 */
export async function findCorpInfo(
  stockCode: string
): Promise<CorpEntry | null> {
  const code = stockCode.replace(/[^\d]/g, "").padStart(6, "0");

  if (!cache || cache.expiresAt < Date.now()) {
    cache = await buildCache();
  }

  return cache.byStockCode.get(code) ?? null;
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

  if (!cache || cache.expiresAt < Date.now()) {
    cache = await buildCache();
  }

  // 한글 → 영문 alias 적용 (있으면 추가 키워드로 함께 검색)
  const aliases = KOREAN_TO_ENGLISH_ALIASES[q.toLowerCase()] ?? [];
  const keywords = [q, ...aliases];
  const keywordsLower = keywords.map((k) => k.toLowerCase());

  // 같은 stockCode 중복 방지를 위해 Map 사용
  const matchMap = new Map<string, CorpEntry>();

  for (const entry of cache.byStockCode.values()) {
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
