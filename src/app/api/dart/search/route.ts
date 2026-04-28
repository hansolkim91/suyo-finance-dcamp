import { searchByName } from "@/lib/dart/corpCode";

export const runtime = "nodejs";

/**
 * 상장사 회사명 자동완성 검색 API.
 *
 * GET /api/dart/search?q=삼성
 *   → { results: [{ corpName, stockCode }, ...] }
 *
 * 왜 GET인가:
 * - 캐시 가능한 idempotent 조회 + URL 공유 가능
 * - 검색어가 URL에 노출돼도 민감 정보 아님
 *
 * corp_code는 응답에 포함하지 않는다 (내부 식별자, 노출 불필요).
 * 클라이언트는 stockCode만 알면 분석 라우트(/api/analyze-by-code)에서
 * 다시 corpCode를 조회하므로 단일 책임 원칙 유지.
 *
 * 성능 노트:
 * - 첫 호출 (cold start): corpCode.xml.zip 다운로드(~3MB) + 압축해제 + 파싱 → 약 1~2초
 * - 이후 호출: 메모리 캐시 hit → ~10ms 이내
 * - 자동완성은 debounce 200~300ms 권장 (클라이언트에서)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const limitRaw = searchParams.get("limit");
  const limit = limitRaw ? Math.min(50, Math.max(1, parseInt(limitRaw, 10))) : 10;

  if (q.trim().length < 1) {
    return Response.json({ results: [] });
  }

  try {
    const matches = await searchByName(q, limit);
    return Response.json({
      results: matches.map((m) => ({
        corpName: m.corpName,
        stockCode: m.stockCode,
      })),
    });
  } catch (err) {
    console.error("[/api/dart/search] 실패:", err);
    return Response.json(
      {
        error:
          (err as Error).message ??
          "상장사 검색에 실패했습니다. 잠시 후 다시 시도해주세요.",
      },
      { status: 500 }
    );
  }
}
