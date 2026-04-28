import { fetchFinancialDataFromDart } from "@/lib/dart/financialStatement";
import { DartError } from "@/lib/dart/client";

export const runtime = "nodejs";
// DART API는 1~2초로 빠르지만, corpCode.xml 첫 다운로드(~3MB)가 cold start에 1~2초 추가될 수 있음
export const maxDuration = 60;

/**
 * 상장사 DART 직조회 분석 라우트.
 *
 * POST /api/analyze-by-code
 *   body: { stockCode: "005930" }
 *   → { data: FinancialData }
 *
 * 기존 `/api/analyze` (PDF) 응답 형식과 동일하게 맞춰서
 * AnalysisPanel·ResultView 변경 없이 그대로 동작하도록 한다.
 *
 * 흐름:
 *   stockCode 검증 (6자리 숫자)
 *   → fetchFinancialDataFromDart (corpCode 매핑 → fnlttSinglAcntAll → yearData 매핑)
 *   → 응답
 *
 * AnalysisPanel은 응답 받은 후 calculateListedMetrics를 클라이언트에서 호출하므로
 * 여기선 raw FinancialData만 반환 (PDF 흐름과 동일 패턴).
 */

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const stockCode = String(body.stockCode ?? "").trim();

    if (!/^\d{6}$/.test(stockCode)) {
      return Response.json(
        { error: "유효한 6자리 종목코드를 입력해주세요." },
        { status: 400 }
      );
    }

    const data = await fetchFinancialDataFromDart(stockCode);
    return Response.json({ data });
  } catch (err) {
    if (err instanceof DartError) {
      // 친화 메시지로 응답 (404=상장사 아님, 013=사업보고서 미공시 등)
      const statusCode =
        err.statusCode === "404" || err.statusCode === "013" ? 404 : 502;
      return Response.json(
        { error: err.message, dartStatus: err.statusCode },
        { status: statusCode }
      );
    }
    console.error("[/api/analyze-by-code] 실패:", err);
    const msg = (err as Error).message ?? "DART 조회에 실패했습니다.";
    return Response.json(
      { error: `DART 조회 실패: ${msg}` },
      { status: 500 }
    );
  }
}
