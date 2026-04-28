import { dartFetchJson, DartError } from "./client";
import { findCorpInfo } from "./corpCode";
import type { DartFinancialItem } from "./types";
import type { FinancialData, YearData } from "../finance/types";

/**
 * DART fnlttSinglAcntAll API 호출 + yearDataSchema 매핑.
 *
 * 흐름:
 *   stockCode → corpCode 조회 (corpCode.ts 캐시)
 *   → 최근 사업보고서 시도 (currentYear-1 → -2 → -3)
 *   → CFS(연결) 우선, 없으면 OFS(별도)
 *   → DartFinancialItem[] → YearData[] 매핑
 *   → FinancialData 반환
 *
 * 왜 이 설계인가:
 * - 한 번의 fnlttSinglAcntAll 호출로 3개년 모두 받음 (thstrm/frmtrm/bfefrmtrm)
 * - 연결(CFS)이 그룹사 전체라 더 의미 있고, 단일법인은 CFS가 비어 OFS로 fallback
 * - 매핑은 account_nm(한글) 기반 — IFRS XBRL ID(account_id)는 K-GAAP 회사에 없는 케이스가 있어 호환성 우선
 */

const REPORT_CODE_ANNUAL = "11011"; // 사업보고서 (연간)

// ──────────────────────────────────────────────────────────
// 계정과목 매핑 — DART account_nm → YearData 필드
// ──────────────────────────────────────────────────────────

/**
 * 회사마다 계정명에 미세한 차이가 있어 후보를 여러 개 두고 매칭.
 *
 * 예:
 * - "매출액" / "수익(매출액)" / "영업수익" / "매출"
 * - "당기순이익" / "당기순손익" / "당기순이익(손실)"
 *
 * 정규화로 공백·괄호 내용 제거 후 비교.
 */
const ACCOUNT_CANDIDATES: Record<string, string[]> = {
  revenue: ["매출액", "수익", "영업수익", "매출"],
  costOfGoodsSold: ["매출원가"],
  grossProfit: ["매출총이익"],
  operatingProfit: ["영업이익", "영업손익"],
  netIncome: ["당기순이익", "당기순손익"],
  interestExpense: ["이자비용"],
  totalAssets: ["자산총계"],
  currentAssets: ["유동자산"],
  inventory: ["재고자산"],
  totalLiabilities: ["부채총계"],
  currentLiabilities: ["유동부채"],
  totalEquity: ["자본총계"],
  operatingCashFlow: [
    "영업활동현금흐름",
    "영업활동으로인한현금흐름",
  ],
  cashBalance: [
    "현금및현금성자산",
    "기말의현금및현금성자산",
    "기말현금및현금성자산",
  ],
  sgaExpenses: ["판매비와관리비", "판매관리비"],
};

/**
 * 계정명 정규화 — 공백·괄호내용 제거 → 매칭 안정화.
 *
 * 예: "당기순이익(손실)" → "당기순이익"
 *     "판매비와 관리비" → "판매비와관리비"
 */
function normalizeName(name: string): string {
  return name
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, "")
    .trim();
}

/**
 * 후보 리스트 중 하나와 일치하는 첫 항목의 금액을 반환.
 */
function findAmount(
  items: DartFinancialItem[],
  candidates: string[],
  term: "thstrm" | "frmtrm" | "bfefrmtrm"
): number | null {
  if (candidates.length === 0) return null;
  const candidatesNorm = candidates.map(normalizeName);

  for (const item of items) {
    if (!candidatesNorm.includes(normalizeName(item.account_nm))) continue;

    const raw =
      term === "thstrm"
        ? item.thstrm_amount
        : term === "frmtrm"
          ? item.frmtrm_amount
          : item.bfefrmtrm_amount;
    if (!raw || raw === "" || raw === "-") return null;

    const cleaned = raw.replace(/,/g, "").trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }
  return null;
}

/**
 * DartFinancialItem[] → 단일 YearData 매핑.
 */
function buildYearData(
  items: DartFinancialItem[],
  year: string,
  term: "thstrm" | "frmtrm" | "bfefrmtrm"
): YearData {
  const get = (key: keyof typeof ACCOUNT_CANDIDATES) =>
    findAmount(items, ACCOUNT_CANDIDATES[key], term);

  return {
    year,
    revenue: get("revenue"),
    costOfGoodsSold: get("costOfGoodsSold"),
    grossProfit: get("grossProfit"),
    operatingProfit: get("operatingProfit"),
    netIncome: get("netIncome"),
    interestExpense: get("interestExpense"),
    depreciation: null, // DART 표준 항목엔 직접 없음 (주석에 있음, v6에서 보강)
    totalAssets: get("totalAssets"),
    currentAssets: get("currentAssets"),
    inventory: get("inventory"),
    totalLiabilities: get("totalLiabilities"),
    currentLiabilities: get("currentLiabilities"),
    totalEquity: get("totalEquity"),
    restrictedCash: null, // DART 표준 항목엔 직접 없음 (주석)
    operatingCashFlow: get("operatingCashFlow"),
    cashBalance: get("cashBalance"),
    operatingExpenses: null, // 비상장 Burn 계산용 — 상장에선 사용 안 함
    sgaExpenses: get("sgaExpenses"),
  };
}

// ──────────────────────────────────────────────────────────
// DART API 호출
// ──────────────────────────────────────────────────────────

/**
 * fnlttSinglAcntAll: 단일회사 전체 재무제표 조회.
 *
 * @param fsDiv "CFS"=연결, "OFS"=별도
 */
async function fetchAccountAll(
  corpCode: string,
  bsnsYear: number,
  fsDiv: "CFS" | "OFS"
): Promise<DartFinancialItem[]> {
  return await dartFetchJson<DartFinancialItem>(
    "fnlttSinglAcntAll.json",
    {
      corp_code: corpCode,
      bsns_year: String(bsnsYear),
      reprt_code: REPORT_CODE_ANNUAL,
      fs_div: fsDiv,
    },
    { allowNoData: true } // 데이터 없음(013)은 throw 대신 빈 배열 → CFS→OFS fallback에 활용
  );
}

// ──────────────────────────────────────────────────────────
// 메인 — 종목코드 → FinancialData
// ──────────────────────────────────────────────────────────

/**
 * 상장사 종목코드 → DART에서 최근 3개년 재무제표 → FinancialData.
 *
 * 시도 순서:
 *   1. 최근 사업연도 (currentYear-1) CFS
 *   2. 최근 사업연도 OFS
 *   3. -2년 CFS → OFS
 *   4. -3년 CFS → OFS
 *   - 모두 실패 시 DartError
 *
 * 왜 -3년까지 시도하나:
 * - 4월에 호출 시 작년 사업보고서가 아직 공시 안 됐을 수 있음 (3월 말 마감이지만 지연 케이스)
 * - 상장폐지 직전 회사는 최근 보고서가 없을 수 있음
 * - 3년 모두 없으면 정말 데이터 없음 → 명확한 에러
 */
export async function fetchFinancialDataFromDart(
  stockCode: string
): Promise<FinancialData> {
  const corpInfo = await findCorpInfo(stockCode);
  if (!corpInfo) {
    throw new DartError(
      "404",
      "해당 종목코드의 상장사를 찾을 수 없습니다. 코드를 확인해주세요."
    );
  }

  const currentYear = new Date().getFullYear();
  let items: DartFinancialItem[] = [];
  let baseYear = 0;

  for (let y = currentYear - 1; y >= currentYear - 3; y--) {
    let result = await fetchAccountAll(corpInfo.corpCode, y, "CFS");
    if (result.length === 0) {
      result = await fetchAccountAll(corpInfo.corpCode, y, "OFS");
    }
    if (result.length > 0) {
      items = result;
      baseYear = y;
      console.log(
        `[DART] ${corpInfo.corpName}(${stockCode}) ${y}년 ${result.length === 0 ? "" : "사업보고서"} 항목 ${result.length}건 수신`
      );
      break;
    }
  }

  if (items.length === 0) {
    throw new DartError(
      "013",
      "최근 3년간 사업보고서를 찾지 못했습니다. 비상장 전환·상장폐지 가능성이 있으니 PDF 업로드로 시도해보세요."
    );
  }

  const years: YearData[] = [
    buildYearData(items, String(baseYear), "thstrm"),
    buildYearData(items, String(baseYear - 1), "frmtrm"),
    buildYearData(items, String(baseYear - 2), "bfefrmtrm"),
  ];

  // 매출도 자산총계도 모두 null인 연도는 데이터 없음 → 제외
  const filtered = years.filter(
    (y) => y.revenue !== null || y.totalAssets !== null
  );

  // year 내림차순 정렬 ([최신→과거]) — PDF 흐름 AI 응답과 동일 컨벤션.
  // UI 컴포넌트들이 .slice().reverse()로 뒤집어 화면엔 [과거→최신]으로 표시되므로
  // 데이터 컨벤션을 PDF/DART 두 경로 모두 [최신→과거]로 통일해야 일관됨.
  filtered.sort((a, b) => Number(b.year) - Number(a.year));

  return {
    companyName: corpInfo.corpName,
    stockCode: corpInfo.stockCode,
    peerSuggestions: [], // DART 흐름에선 AI 추천 안 거침. v6에서 KRX 업종 분류로 자동 추천 검토.
    years: filtered,
  };
}
