import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { extractFinancialDataFromPDF } from "@/lib/ai/gateway";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/analyze
 * Body: { blobUrl: string, type: "listed" | "private" }
 *
 * 흐름: PDF 다운로드 → AI가 PDF 직접 읽기 → 구조화된 재무 데이터 반환
 */
export async function POST(request: Request) {
  let blobUrl: string | undefined;

  try {
    const body = await request.json();
    blobUrl = body.blobUrl;
    const type = body.type;

    if (!blobUrl || !type) {
      return NextResponse.json(
        { error: "blobUrl과 type은 필수입니다." },
        { status: 400 }
      );
    }

    // 1. Blob에서 PDF 다운로드
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    const res = await fetch(blobUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `PDF 다운로드 실패: ${res.status}` },
        { status: 502 }
      );
    }
    const pdfBuffer = Buffer.from(await res.arrayBuffer());

    // 2. AI에 PDF 텍스트 전달 → 구조화된 재무 데이터
    const financialData = await extractFinancialDataFromPDF(pdfBuffer);

    console.log("=== AI 추출 결과 ===");
    console.log(JSON.stringify(financialData, null, 2));

    return NextResponse.json({ data: financialData, method: "llm" });
  } catch (error) {
    const message = (error as Error).message;
    console.error("분석 에러:", message);

    return NextResponse.json(
      { error: "분석 중 오류가 발생했습니다.", detail: message },
      { status: 500 }
    );
  } finally {
    if (blobUrl) {
      try {
        await del(blobUrl);
      } catch {
        console.error("Blob 삭제 실패:", blobUrl);
      }
    }
  }
}
