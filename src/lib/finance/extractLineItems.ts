import type { FinancialData, YearData } from "./types";

/**
 * PDF에서 추출한 텍스트를 정규식으로 파싱하여 재무항목을 추출한다.
 *
 * 왜 정규식을 먼저 쓰나:
 * - LLM 호출 없이 빠르게 추출 가능 (비용 절약)
 * - 성공하면 그대로 사용, 부족하면 LLM 폴백으로 보강
 *
 * 한국어 PDF 특성:
 * - unpdf가 텍스트를 추출하면 글자 사이에 공백이 들어감
 *   예: "자 산 총 계   3 , 8 2 4 , 1 2 8 , 1 4 1"
 * - 전처리로 먼저 정리한 뒤 정규식을 적용
 */

/**
 * 한국어 PDF 텍스트 전처리: 글자 사이 불필요한 공백을 제거한다.
 *
 * 원본: "자   산   총   계   3 , 8 2 4 , 1 2 8 , 1 4 1   1 , 1 3 7 , 6 1 6 , 5 2 1"
 * 결과: "자산총계 3,824,128,141 1,137,616,521"
 *
 * 핵심 전략:
 * 1. 모든 공백을 하나로 통합
 * 2. 한글 사이 공백 제거
 * 3. 숫자/쉼표 사이 공백 제거
 * 4. 남은 공백은 열 구분으로 유지
 */
function normalizeKoreanPdfText(text: string): string {
  // 줄 단위로 처리 — 줄바꿈을 유지해야 행 구분 정규식이 정상 동작함
  return text
    .split("\n")
    .map((line) => {
      // 1. 탭으로 열을 분리한 뒤, 각 열을 독립 정규화
      //    탭은 extractText.ts에서 열 구분용으로 삽입됨 (x좌표 차이 > 15px)
      const columns = line.split("\t");

      const normalizedCols = columns.map((col) => {
        // 연속 공백을 하나로
        let result = col.replace(/ +/g, " ").trim();

        // 한글 사이 공백 제거 (반복 적용 — "가 나 다" → "가나다")
        for (let i = 0; i < 5; i++) {
          result = result.replace(
            /([가-힣ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ①②③④⑤]) ([가-힣ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ①②③④⑤])/g,
            "$1$2"
          );
        }

        // 숫자-쉼표 사이 공백 제거 ("3 , 8 2 4" → "3,824")
        for (let i = 0; i < 5; i++) {
          result = result.replace(/(\d) , (\d)/g, "$1,$2");
          result = result.replace(/(\d) ,(\d)/g, "$1,$2");
          result = result.replace(/(\d), (\d)/g, "$1,$2");
          result = result.replace(/(\d) (\d)/g, "$1$2");
        }

        // 로마숫자 뒤 점 정리
        result = result.replace(/([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ])\s*\.\s*/g, "$1.");

        return result;
      });

      // 2. 열 사이는 탭으로 다시 연결 (findNumbersAfterKeyword가 숫자를 구분 가능)
      return normalizedCols.join("\t");
    })
    .join("\n");
}

// 숫자 추출 (쉼표 제거, 괄호=음수)
function parseNumber(raw: string): number | null {
  if (!raw) return null;
  let cleaned = raw.replace(/,/g, "").replace(/\s/g, "");

  // 괄호로 감싸진 숫자는 음수 (회계 관례)
  const isNegative = /^\(.*\)$/.test(cleaned);
  cleaned = cleaned.replace(/[()]/g, "");

  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  return isNegative ? -num : num;
}

// 키워드가 포함된 줄에서 숫자들을 찾는 헬퍼
// 재무제표 구조: "매출액\t300,000,000\t280,000,000" (탭으로 열 구분)
function findNumbersAfterKeyword(
  text: string,
  keywords: string[]
): (number | null)[] {
  for (const keyword of keywords) {
    const regex = new RegExp(`^[^\\n]*${keyword}[^\\n]*$`, "gim");
    const matches = text.match(regex);
    if (!matches) continue;

    // 여러 줄이 매칭되면, 숫자가 가장 많은 줄 선택 (재무표 행)
    let bestNumbers: (number | null)[] = [];
    for (const line of matches) {
      // 키워드 이후 부분에서 숫자 추출
      const afterKeyword = line.slice(
        line.toLowerCase().indexOf(keyword.toLowerCase().replace(/\\/g, "")) +
          keyword.replace(/\\/g, "").length
      );

      // 탭 또는 공백으로 구분된 숫자 추출
      // 재무제표 숫자: 쉼표 포함 큰 숫자 (최소 4자리) 또는 괄호 음수
      const numbers = afterKeyword.match(
        /[-]?[\d,]{4,}(?:\.\d+)?|\([\d,]{4,}(?:\.\d+)?\)/g
      );
      if (numbers && numbers.length > bestNumbers.length) {
        bestNumbers = numbers.map(parseNumber);
      }
    }

    if (bestNumbers.length > 0) return bestNumbers;
  }
  return [];
}

// 연도 추출
function extractYears(text: string): string[] {
  // 재무제표 맥락에서 나타나는 연도만 캡처
  // "제56기" 같은 기수 + 연도, 또는 회계연도 표기를 우선
  const currentYear = new Date().getFullYear();

  // 1차: 재무제표 헤더에서 "제XX기 2024년" 또는 "(2024.01.01~2024.12.31)" 패턴
  const fiscalPattern = /(?:제\d+기|기간|회계연도)[^\n]{0,20}(20[12]\d)/g;
  const fiscalMatches: string[] = [];
  let m;
  while ((m = fiscalPattern.exec(text)) !== null) {
    const year = Number(m[1]);
    if (year <= currentYear) fiscalMatches.push(m[1]);
  }

  if (fiscalMatches.length > 0) {
    const unique = [...new Set(fiscalMatches)];
    return unique.sort((a, b) => Number(b) - Number(a)).slice(0, 3);
  }

  // 2차: "2025년" 또는 "2025.12" 형태, 현재 연도 이하만
  const yearPattern = /20[12]\d(?:년|\.(?:12|03|06|09))/g;
  const matches = text.match(yearPattern);
  if (!matches) return [];

  const years = [
    ...new Set(
      matches
        .map((m) => m.replace(/[년.].*/g, ""))
        .filter((y) => Number(y) <= currentYear)
    ),
  ];
  return years.sort((a, b) => Number(b) - Number(a)).slice(0, 3);
}

export function extractLineItemsFromText(text: string): FinancialData | null {
  // 핵심: 한국어 PDF 텍스트 정규화
  const normalized = normalizeKoreanPdfText(text);

  const years = extractYears(normalized);
  if (years.length === 0) return null;

  // 기업명 추출
  // 회사명/상호/기업명 키워드 뒤에서 한글+영문 기업명만 캡처 (최대 30자)
  let companyName = "알 수 없음";
  const namePatterns = [
    // "상호 : 삼성전자주식회사" — 콜론 뒤의 한글+영문만 (공백 불포함)
    /(?:회사명|상호|기업명)\s*[:：]\s*([가-힣a-zA-Z()（）]+)/,
    // "회사의명칭은삼성전자주식회사이고" — "주식회사" 앞뒤로 캡처
    /명칭[은의]?\s*([가-힣]{2,10}(?:주식회사|㈜))/,
    /명칭[은의]?\s*((?:주식회사|㈜)[가-힣]{2,10})/,
    // 첫 줄에서 "삼성전자주식회사" 패턴
    /^([가-힣]+(?:주식회사|㈜))/m,
    /^((?:주식회사|㈜)[가-힣]+)/m,
  ];
  for (const pattern of namePatterns) {
    const match = normalized.match(pattern);
    if (match) {
      companyName = match[1].trim();
      break;
    }
  }

  const revenues = findNumbersAfterKeyword(normalized, [
    "Ⅰ\\.매출액",
    "매출액",
    "영업수익",
  ]);
  const operatingProfits = findNumbersAfterKeyword(normalized, [
    "영업이익",
    "영업손실",
    "영업손익",
  ]);
  const netIncomes = findNumbersAfterKeyword(normalized, [
    "당기순이익",
    "당기순손실",
    "당기순손익",
  ]);
  const totalAssets = findNumbersAfterKeyword(normalized, [
    "자산총계",
  ]);
  const totalLiabilities = findNumbersAfterKeyword(normalized, [
    "부채총계",
  ]);
  const totalEquity = findNumbersAfterKeyword(normalized, [
    "자본총계",
  ]);
  const operatingExpenses = findNumbersAfterKeyword(normalized, [
    "판매비와관리비",
    "판관비",
    "영업비용",
  ]);
  const cashBalance = findNumbersAfterKeyword(normalized, [
    "현금및현금성자산",
    "보통예금",
  ]);

  // 영업손실은 음수로 변환
  const adjustedOperatingProfits = operatingProfits.map((v) => {
    // "영업손실" 키워드로 매칭됐으면 음수 처리
    if (v !== null && normalized.includes("영업손실") && v > 0) {
      return -v;
    }
    return v;
  });

  // 당기순손실도 음수로 변환
  const adjustedNetIncomes = netIncomes.map((v) => {
    if (v !== null && normalized.includes("당기순손실") && v > 0) {
      return -v;
    }
    return v;
  });

  // 추가 항목 추출 (새로 추가된 필드)
  const costOfGoodsSold = findNumbersAfterKeyword(normalized, ["매출원가"]);
  const grossProfits = findNumbersAfterKeyword(normalized, ["매출총이익"]);
  const currentAssets = findNumbersAfterKeyword(normalized, ["유동자산"]);
  const currentLiabilities = findNumbersAfterKeyword(normalized, ["유동부채"]);
  const operatingCashFlows = findNumbersAfterKeyword(normalized, [
    "영업활동으로인한현금흐름",
    "영업활동현금흐름",
  ]);

  const yearDataList: YearData[] = years.map((year, i) => ({
    year,
    revenue: revenues[i] ?? null,
    costOfGoodsSold: costOfGoodsSold[i] ?? null,
    grossProfit: grossProfits[i] ?? null,
    sgaExpenses: operatingExpenses[i] ?? null,
    operatingProfit: adjustedOperatingProfits[i] ?? null,
    netIncome: adjustedNetIncomes[i] ?? null,
    interestExpense: null,
    depreciation: null,
    totalAssets: totalAssets[i] ?? null,
    currentAssets: currentAssets[i] ?? null,
    totalLiabilities: totalLiabilities[i] ?? null,
    currentLiabilities: currentLiabilities[i] ?? null,
    totalEquity: totalEquity[i] ?? null,
    operatingCashFlow: operatingCashFlows[i] ?? null,
    cashBalance: cashBalance[i] ?? null,
    operatingExpenses: operatingExpenses[i] ?? null,
  }));

  return { companyName, years: yearDataList };
}

/**
 * 정규식 파싱 결과가 충분한지 검증.
 */
export function isExtractionSufficient(
  data: FinancialData | null,
  type: "listed" | "private"
): boolean {
  if (!data || data.years.length === 0) return false;

  const latest = data.years[0];

  if (type === "listed") {
    return (
      latest.revenue !== null &&
      latest.operatingProfit !== null &&
      latest.totalAssets !== null
    );
  } else {
    return (
      (latest.revenue !== null || latest.operatingExpenses !== null) &&
      latest.cashBalance !== null
    );
  }
}
