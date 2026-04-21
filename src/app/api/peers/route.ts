import { NextResponse } from "next/server";
import { fetchPeerData, fetchPeersData } from "@/lib/peers/naverFinance";

/**
 * POST /api/peers
 *
 * Body:
 *   { stockCode: "005930" }         — 단일 조회
 *   { stockCodes: ["005930", ...] } — 다중 조회 (병렬)
 *
 * Response: PeerData | PeerData[]
 *
 * 왜 POST인가 (GET 대신):
 * - 다중 조회 시 쿼리스트링 길이·가독성 문제
 * - 향후 필터 파라미터 추가 확장 용이
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (Array.isArray(body.stockCodes)) {
      if (body.stockCodes.length === 0) {
        return NextResponse.json({ error: "stockCodes is empty" }, { status: 400 });
      }
      if (body.stockCodes.length > 10) {
        return NextResponse.json(
          { error: "stockCodes cannot exceed 10" },
          { status: 400 }
        );
      }
      const data = await fetchPeersData(body.stockCodes);
      return NextResponse.json(data);
    }

    if (typeof body.stockCode === "string") {
      const data = await fetchPeerData(body.stockCode);
      return NextResponse.json(data);
    }

    return NextResponse.json(
      { error: "stockCode or stockCodes required" },
      { status: 400 }
    );
  } catch (err) {
    console.error("[/api/peers] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
