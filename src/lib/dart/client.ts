import {
  DART_STATUS_MESSAGES,
  type DartResponse,
} from "./types";

/**
 * DART OpenAPI 호출 래퍼.
 *
 * 왜 별도 client인가:
 * - 모든 DART 호출이 한 곳을 거치면 키 관리·로깅·에러 변환 일관
 * - DART 응답 envelope가 HTTP 200 + status="011"(키 무효) 식으로 와서, 일반 fetch만으로는 에러 검출 못함
 * - 바이너리(corpCode.xml ZIP)와 JSON 두 종류 응답이 있어 분리 필요
 *
 * 공식 문서: https://opendart.fss.or.kr/guide/main.do
 */

const DART_BASE = "https://opendart.fss.or.kr/api/";

/**
 * DART 호출 실패 시 throw되는 에러 — statusCode로 분기 처리 가능.
 */
export class DartError extends Error {
  constructor(
    public statusCode: string,
    message: string
  ) {
    super(message);
    this.name = "DartError";
  }
}

/**
 * 환경변수에서 인증키 읽기.
 * 키가 없으면 즉시 throw (서버 시작 시점에 잡혀야 디버깅 쉬움).
 */
export function getDartKey(): string {
  const key = process.env.DART_API_KEY;
  if (!key) {
    throw new Error(
      "DART_API_KEY 환경변수가 설정되지 않았습니다. .env.local에 추가하세요."
    );
  }
  return key;
}

/**
 * 친화 메시지 변환 (UI 노출용).
 */
function friendlyMessage(statusCode: string, originalMessage?: string): string {
  return (
    DART_STATUS_MESSAGES[statusCode] ??
    originalMessage ??
    `알 수 없는 오류 (${statusCode})`
  );
}

/**
 * DART JSON 엔드포인트 호출.
 *
 * @param path 엔드포인트 경로 (예: "fnlttSinglAcntAll.json")
 * @param params 쿼리 파라미터 (crtfc_key는 자동 주입)
 * @param options.allowNoData true면 status=013("데이터 없음")일 때 throw 대신 빈 배열 반환
 *
 * @returns 응답의 list 배열 (없으면 빈 배열)
 */
export async function dartFetchJson<T>(
  path: string,
  params: Record<string, string>,
  options: { allowNoData?: boolean } = {}
): Promise<T[]> {
  const key = getDartKey();
  const query = new URLSearchParams({ crtfc_key: key, ...params });
  const url = `${DART_BASE}${path}?${query.toString()}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new DartError("HTTP", `DART HTTP ${res.status}`);
  }

  const json = (await res.json()) as DartResponse<T>;

  if (json.status !== "000") {
    if (json.status === "013" && options.allowNoData) {
      return [];
    }
    throw new DartError(
      json.status,
      `DART API: ${friendlyMessage(json.status, json.message)}`
    );
  }

  return json.list ?? [];
}

/**
 * DART 바이너리 엔드포인트 호출 (corpCode.xml ZIP 등).
 *
 * 인증 실패 시 DART는 JSON 에러 응답(application/json)을 보내므로,
 * Content-Type을 보고 분기해서 에러 envelope를 디코딩한다.
 */
export async function dartFetchBinary(
  path: string,
  params: Record<string, string> = {}
): Promise<Buffer> {
  const key = getDartKey();
  const query = new URLSearchParams({ crtfc_key: key, ...params });
  const url = `${DART_BASE}${path}?${query.toString()}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new DartError("HTTP", `DART HTTP ${res.status}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    // 바이너리 기대했는데 JSON이 옴 → 에러 envelope
    const json = (await res.json()) as DartResponse<unknown>;
    throw new DartError(
      json.status,
      `DART API: ${friendlyMessage(json.status, json.message)}`
    );
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
