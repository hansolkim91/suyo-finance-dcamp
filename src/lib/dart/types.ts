/**
 * DART OpenAPI 응답 타입.
 *
 * 공식 문서: https://opendart.fss.or.kr/guide/main.do
 *
 * 모든 JSON 엔드포인트의 공통 envelope:
 *   { status, message, list? }
 *
 * 상태 코드는 status 문자열로 반환 — "000"이 정상, 그 외는 에러.
 */

/**
 * DART JSON 엔드포인트 공통 응답 envelope.
 */
export type DartResponse<T> = {
  status: string;
  message: string;
  list?: T[];
};

/**
 * DART 상태 코드 → 한국어 메시지 매핑.
 *
 * 자주 마주치는 케이스 위주. UI 노출용이라 너무 기술적이지 않게.
 */
export const DART_STATUS_MESSAGES: Record<string, string> = {
  "000": "정상",
  "010": "등록되지 않은 인증키",
  "011": "사용할 수 없는 인증키",
  "012": "접근할 수 없는 IP에서 호출",
  "013": "조회된 데이터가 없습니다",
  "014": "파일이 존재하지 않습니다",
  "020": "요청 제한을 초과했습니다 (분당 1,000회)",
  "021": "조회 가능한 회사 수 초과",
  "100": "필드 값이 부적절합니다",
  "101": "부적절한 접근",
  "800": "DART 시스템 점검 중",
  "900": "DART 알 수 없는 오류",
};

/**
 * fnlttSinglAcntAll: 단일회사 전체 재무제표 응답 항목.
 *
 * 핵심 필드만 정의 — DART는 더 많은 필드를 주지만 우리 매핑에 쓰는 것만.
 *
 * sj_div (재무제표 구분):
 *   - BS = 재무상태표
 *   - IS = 손익계산서
 *   - CIS = 포괄손익계산서
 *   - CF = 현금흐름표
 *   - SCE = 자본변동표
 */
export type DartFinancialItem = {
  rcept_no: string;
  reprt_code: string; // 11011=사업보고서, 11012=반기, 11013=1분기, 11014=3분기
  bsns_year: string;
  corp_code: string;
  sj_div: "BS" | "IS" | "CIS" | "CF" | "SCE" | string;
  sj_nm: string;
  account_id?: string; // XBRL 표준 ID (있으면 매핑에 사용)
  account_nm: string; // 한글 계정명 ("매출액", "영업이익" 등)
  account_detail?: string;
  thstrm_nm: string; // 당기 표시명 ("제 56 기")
  thstrm_amount: string; // 당기 금액 (문자열, 콤마 포함, 음수는 "-")
  frmtrm_nm?: string;
  frmtrm_amount?: string; // 전기 금액
  bfefrmtrm_nm?: string;
  bfefrmtrm_amount?: string; // 전전기 금액
  ord?: string;
  currency?: string;
};
