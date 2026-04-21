import type { PeerData } from "./types";

/**
 * 네이버 금융 종목 페이지에서 핵심 지표를 정규식으로 추출한다.
 *
 * 왜 정규식인가 (cheerio 대신):
 * - 대상 필드가 7~8개로 적음 → 의존성 추가보다 정규식이 가볍고 빠름
 * - 네이버 HTML이 자주 바뀌지 않는 특정 패턴(PER/PBR/EPS 등)만 추출
 *
 * 실패 시 null 반환 — UI에서 "데이터 없음"으로 표시.
 */

const NAVER_URL = (code: string) =>
  `https://finance.naver.com/item/main.naver?code=${code}`;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// 간단 메모리 캐시 (1시간) — 같은 종목 반복 조회 시 네이버 부하 절감
type CacheEntry = { data: PeerData; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000;

function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-" || cleaned === "N/A") return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * 네이버 시가총액 포맷 "872조 3,477" → 원 단위 숫자.
 * "조"와 "억(쉼표 숫자)"을 각각 파싱하여 합산 후 억 단위 × 10^8.
 */
function parseMarketCap(raw: string | undefined): number | null {
  if (!raw) return null;
  const clean = raw.replace(/\s+/g, " ").trim();
  const joMatch = clean.match(/(\d+)\s*조/);
  const jo = joMatch ? parseInt(joMatch[1], 10) : 0;
  const after = joMatch ? clean.slice(joMatch.index! + joMatch[0].length) : clean;
  const eokDigits = after.replace(/[^\d,]/g, "").replace(/,/g, "");
  const eok = eokDigits ? parseInt(eokDigits, 10) : 0;
  const totalEok = jo * 10000 + eok;
  return totalEok > 0 ? totalEok * 100_000_000 : null;
}

function matchFirst(html: string, regex: RegExp): string | undefined {
  const m = html.match(regex);
  return m?.[1];
}

/**
 * 네이버 금융 HTML에서 지표를 추출한다.
 *
 * 패턴 예시:
 *   <strong>PER(배)</strong></th> <td class=""> 36.84 </td>
 */
function parseNaverHtml(html: string, stockCode: string): PeerData {
  // 회사명: <title> 태그의 "삼성전자 : 네이버 페이 증권" 형태
  const titleMatch = html.match(/<title>([^:<]+?)\s*:\s*/);
  const companyName = titleMatch?.[1]?.trim() ?? null;

  // 현재가: <dd>현재가 83,900 전일대비 ...</dd> 또는 <p class="no_today"> 안의 숫자
  const priceMatch =
    html.match(/<p class="no_today">[\s\S]*?<span class="blind">([\d,]+)<\/span>/) ??
    html.match(/현재가\s*([\d,]+)/);
  const currentPrice = parseNumber(priceMatch?.[1]);

  // PER, PBR, EPS: 상단 "투자정보" 요약 박스의 id 기반 엘리먼트 사용
  // (하단 "종목분석" 표는 예측/분기별 여러 값이 섞여있어 부정확)
  // 패턴: <em id="_per">20.76</em>배
  const per = parseNumber(
    matchFirst(html, /id="_per">\s*(-?[\d,.]+)\s*<\/em>/)
  );
  const pbr = parseNumber(
    matchFirst(html, /id="_pbr">\s*(-?[\d,.]+)\s*<\/em>/)
  );
  const eps = parseNumber(
    matchFirst(html, /id="_eps">\s*(-?[\d,.]+)\s*<\/em>/)
  );
  // BPS는 _pbr 뒤 형제 <em>에 위치 (id="_pbr">...</em>배 l <em>174,539</em>원)
  const bps = parseNumber(
    matchFirst(
      html,
      /id="_pbr">[\s\S]{0,200}?<em>\s*(-?[\d,.]+)\s*<\/em>\s*원/
    )
  );

  // 시가총액: <em id="_market_sum"> 872조 3,477 </em>억원 형식
  const marketCap = parseMarketCap(
    matchFirst(html, /id="_market_sum">([^<]+)<\/em>/)
  );

  // 52주 최고/최저: <em>HIGH</em> ... <em>LOW</em>
  const high52w = parseNumber(
    matchFirst(
      html,
      /52주최고[\s\S]*?<em>([\d,]+)<\/em>/
    )
  );
  const low52wSrc = html.match(
    /52주최고[\s\S]*?<em>[\d,]+<\/em>[\s\S]*?<em>([\d,]+)<\/em>/
  );
  const low52w = parseNumber(low52wSrc?.[1]);

  return {
    stockCode,
    companyName,
    marketCap,
    per,
    pbr,
    eps,
    bps,
    high52w,
    low52w,
    currentPrice,
  };
}

/**
 * 종목코드 하나로 네이버 금융 데이터를 가져온다.
 * 스크래핑 실패 / HTML 변경 시 대부분 필드 null.
 */
export async function fetchPeerData(stockCode: string): Promise<PeerData> {
  // 메모리 캐시 확인
  const cached = cache.get(stockCode);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const code = stockCode.replace(/[^\d]/g, "").padStart(6, "0");
  try {
    const res = await fetch(NAVER_URL(code), {
      headers: { "User-Agent": USER_AGENT },
      // Next.js fetch 캐시 끄기 (항상 네트워크)
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Naver fetch failed: ${res.status}`);
    }
    const html = await res.text();
    const data = parseNaverHtml(html, code);

    // 핵심 필드가 전부 null이면 캐시하지 않음 (HTML 구조 변경 / 정규식 수정 시 재조회 가능하게)
    const hasAnyData =
      data.per !== null ||
      data.pbr !== null ||
      data.marketCap !== null;
    if (hasAnyData) {
      cache.set(code, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    }
    return data;
  } catch (err) {
    console.error(`[naverFinance] ${code} 스크래핑 실패:`, err);
    return {
      stockCode: code,
      companyName: null,
      marketCap: null,
      per: null,
      pbr: null,
      eps: null,
      bps: null,
      high52w: null,
      low52w: null,
      currentPrice: null,
    };
  }
}

/**
 * 여러 종목코드를 병렬로 조회.
 */
export async function fetchPeersData(
  stockCodes: string[]
): Promise<PeerData[]> {
  return Promise.all(stockCodes.map(fetchPeerData));
}
