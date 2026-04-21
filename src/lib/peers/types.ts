/**
 * 네이버 금융에서 가져오는 회사별 외부 데이터.
 *
 * 출처: https://finance.naver.com/item/main.naver?code=XXXXXX
 * - 스크래핑 기반이라 HTML 구조 변경 시 일부/전체 null 가능
 * - null은 UI에서 "데이터 없음"으로 표시
 */
export type PeerData = {
  stockCode: string; // 6자리 종목코드
  companyName: string | null; // 네이버 페이지 제목에서 추출
  marketCap: number | null; // 시가총액 (원)
  per: number | null; // 주가수익비율 (배)
  pbr: number | null; // 주가순자산비율 (배)
  eps: number | null; // 주당순이익 (원)
  bps: number | null; // 주당순자산 (원)
  high52w: number | null; // 52주 최고가 (원)
  low52w: number | null; // 52주 최저가 (원)
  currentPrice: number | null; // 현재가 (원)
};
