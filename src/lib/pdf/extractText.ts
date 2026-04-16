import { getDocumentProxy } from "unpdf";
import path from "path";

/**
 * Blob URL에서 PDF를 다운로드한 뒤 텍스트를 추출한다.
 *
 * 왜 getDocumentProxy를 직접 사용하나:
 * - unpdf의 extractText는 cMap 옵션을 넘길 수 없음
 * - 한국어 PDF는 cMap(Character Map) 데이터가 있어야 텍스트 추출 가능
 * - pdfjs-dist 패키지의 로컬 cMap 파일을 직접 지정
 *
 * Private Blob은 Bearer 토큰 인증이 필요하므로 BLOB_READ_WRITE_TOKEN을 사용.
 */

// pdfjs-dist의 cMap 디렉토리 경로
// require.resolve 대신 process.cwd() 사용 — Turbopack 번들링 호환
const CMAP_DIR = path.join(
  process.cwd(),
  "node_modules",
  "pdfjs-dist",
  "cmaps"
);

export async function extractTextFromBlob(blobUrl: string): Promise<string> {
  // 1. Private Blob에서 PDF 다운로드 (Bearer 토큰 인증)
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const response = await fetch(blobUrl, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error(`PDF 다운로드 실패: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();

  // 2. getDocumentProxy로 PDF 로드 (한국어 cMap 설정 포함)
  const doc = await getDocumentProxy(new Uint8Array(arrayBuffer), {
    cMapUrl: CMAP_DIR + "/",
    cMapPacked: true,
  });

  // 3. 모든 페이지에서 텍스트 추출 (위치 기반 행/열 구분)
  //    같은 y좌표 = 같은 행, x좌표 차이가 크면 = 열 구분(탭)
  let fullText = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();

    // y좌표로 그룹핑 (같은 행)하고, x좌표 순으로 정렬
    type TextItem = { str: string; x: number; y: number; width: number };
    const items: TextItem[] = [];
    for (const item of content.items) {
      if ("str" in item && item.str && "transform" in item) {
        const transform = item.transform as number[];
        items.push({
          str: item.str,
          x: transform[4],
          y: Math.round(transform[5]), // y좌표 반올림 (미세 차이 무시)
          width: item.width as number,
        });
      }
    }

    // y좌표 기준 행 그룹핑 (2px 이내 차이는 같은 행)
    items.sort((a, b) => b.y - a.y || a.x - b.x); // y 내림차순, x 오름차순

    let lastY = items[0]?.y ?? 0;
    let lastEndX = 0;
    for (const item of items) {
      const yDiff = Math.abs(item.y - lastY);
      if (yDiff > 2) {
        // 새로운 행
        fullText += "\n";
        lastEndX = 0;
      } else if (item.x - lastEndX > 15) {
        // 같은 행이지만 x 간격이 크면 탭으로 구분 (열 구분)
        fullText += "\t";
      }
      fullText += item.str;
      lastY = item.y;
      lastEndX = item.x + (item.width || 0);
    }
    fullText += "\n";
  }

  if (!fullText || fullText.trim().length === 0) {
    throw new Error(
      "PDF에서 텍스트를 추출할 수 없습니다. 스캔된 PDF는 아직 지원하지 않습니다."
    );
  }

  return fullText;
}
