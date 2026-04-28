import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";

/**
 * 빌드 시점에 DART corpCode.xml.zip을 다운로드하고 JSON으로 변환해
 * src/lib/dart/corp-code-data.json에 저장한다.
 *
 * 왜 빌드 시점에 하나:
 * - 런타임에 cold start마다 3.5MB ZIP 다운로드 + 압축해제 + 100k 항목
 *   정규식 파싱은 60~90초 소요 (Vercel US East region에서)
 * - Hobby plan의 Fluid Compute maxDuration(300s) 안에 들어가긴 하지만
 *   사용자 첫 검색에 1분 대기는 UX 폐기
 * - 빌드는 일주일에 한 번 정도라 신선도 충분
 *
 * 환경변수:
 * - 로컬: .env.local에서 직접 파싱 (dotenv 의존성 추가 회피)
 * - Vercel CI: process.env.DART_API_KEY 자동 주입
 */

async function loadDartKey() {
  if (process.env.DART_API_KEY) return process.env.DART_API_KEY;
  if (!existsSync(".env.local")) return null;
  const raw = await readFile(".env.local", "utf-8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^DART_API_KEY\s*=\s*["']?([^"'\s]+)["']?\s*$/);
    if (m) return m[1];
  }
  return null;
}

async function main() {
  const KEY = await loadDartKey();
  if (!KEY) {
    console.warn(
      "[build-corp-code] DART_API_KEY 없음 — 빈 매핑으로 출력 (개발 환경 또는 키 미주입)"
    );
    await writeOutput([]);
    return;
  }

  console.log("[build-corp-code] DART corpCode.xml.zip 다운로드…");
  const t0 = Date.now();
  const res = await fetch(
    `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${KEY}`
  );
  if (!res.ok) {
    throw new Error(`DART HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const t1 = Date.now();

  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    // 인증 실패 등 에러 envelope
    const err = JSON.parse(buf.toString("utf-8"));
    throw new Error(`DART 응답: ${err.message ?? err.status}`);
  }

  const files = unzipSync(new Uint8Array(buf));
  const xml = strFromU8(Object.values(files)[0]);
  const t2 = Date.now();

  const entries = parseCorpCodeXml(xml);
  const t3 = Date.now();

  console.log(
    `[build-corp-code] 다운로드 ${t1 - t0}ms / 압축해제 ${t2 - t1}ms / 파싱 ${t3 - t2}ms`
  );
  console.log(`[build-corp-code] 상장사 ${entries.length}개`);

  await writeOutput(entries);
}

function parseCorpCodeXml(xml) {
  const entries = [];
  const listRegex = /<list>([\s\S]*?)<\/list>/g;
  const fieldRegex = (tag) =>
    new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);
  let match;
  while ((match = listRegex.exec(xml)) !== null) {
    const block = match[1];
    const corpCode = block.match(fieldRegex("corp_code"))?.[1]?.trim() ?? "";
    const corpName = block.match(fieldRegex("corp_name"))?.[1]?.trim() ?? "";
    const stockCode = block.match(fieldRegex("stock_code"))?.[1]?.trim() ?? "";
    if (corpCode && stockCode) {
      entries.push({ corpCode, corpName, stockCode });
    }
  }
  return entries;
}

async function writeOutput(entries) {
  await mkdir("src/lib/dart", { recursive: true });
  await writeFile(
    "src/lib/dart/corp-code-data.json",
    JSON.stringify(entries),
    "utf-8"
  );
  console.log(
    `[build-corp-code] → src/lib/dart/corp-code-data.json (${entries.length} entries)`
  );
}

main().catch((err) => {
  console.error("[build-corp-code] 실패:", err);
  process.exit(1);
});
