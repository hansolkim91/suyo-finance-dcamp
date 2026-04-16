# 계획: 수요재무회 — PDF 재무분석 MVP (v1)

## 목표 (한 문장)
상장/비상장 재무 PDF를 업로드하면 핵심 지표를 자동 계산하고 Claude AI가 해설해 주는 Next.js 15 웹서비스를 **6~8시간 안에** MVP로 완성해 Vercel에 배포한다.

## 완료 기준 (Acceptance Criteria)
- [ ] **AC1**: Vercel Production URL에서 탭 2개(상장/비상장)가 뜨고, 각각 PDF 업로드가 동작한다. (검증: 배포 URL 접속 → 각 탭에 PDF 업로드 성공)
- [ ] **AC2**: 텍스트 PDF 업로드 시 상장사는 6개 지표(영업이익률·순이익률·ROE·ROA·부채비율·YoY 매출성장률)가 표와 차트로 표시된다. (검증: `삼성전자_크래프톤_재무분석-1.xlsx` 원본 PDF로 수치 ±5% 이내 일치)
- [ ] **AC3**: 비상장사 PDF 업로드 시 4개 지표(Gross Burn·Net Burn·Runway·BEP)가 계산된다. (검증: `랜식_재무분석_BurnRate.xlsx` 원본과 Runway 값 일치)
- [ ] **AC4**: 지표 아래에 Claude Sonnet 4.6 해설이 **스트리밍**으로 표시된다. (검증: 분석 후 텍스트가 타자처럼 흘러나옴)
- [ ] **AC5**: 분석 완료 후 Vercel Blob에 업로드된 PDF가 즉시 삭제된다. (검증: 분석 후 Blob 대시보드에 해당 파일 없음)

## 범위 밖 (Out of Scope) — v2로 미룸
- DART API 자동 조회 / 동종업계 비교
- Q&A 후속 대화 채팅
- 스캔 PDF OCR (Claude Vision)
- 고급 지표: PER/PBR/PSR/EV·EBITDA/PEG/DuPont/LTV·CAC/Rule of 40/Default Alive·Dead/라운드 시뮬
- 5년 다년 추이 / 비용 구조 히트맵
- 로그인·결제·DB·모바일 앱·다국어

---

## 작업 단계 (총 9단계, 예상 6~7시간)

### 1단계: 프로젝트 초기화 + UI 기본 세팅
- 파일: `package.json`, `next.config.ts`, `.env.local.example`, `components.json`, `src/components/ui/*`
- 작업:
  - `pnpm create next-app@latest` (TS, App Router, Tailwind, ESLint)
  - `pnpm dlx shadcn@latest init` → `button`, `card`, `tabs`, `input`, `table`, `skeleton` 추가
  - `.env.local.example`에 `AI_GATEWAY_API_KEY`, `BLOB_READ_WRITE_TOKEN` 명시
- 완료 기준: `pnpm dev` → `http://localhost:3000`에 기본 페이지 + shadcn Button 렌더링 정상
- 예상 소요: **40분**
- 왜 한 단계로 합쳤나: 초기화·Tailwind·shadcn은 모두 한 번에 설치하는 게 자연스러워 단계를 잘게 쪼갤 실익이 없음.

### 2단계: 탭 뼈대 + 업로드 UI 레이아웃
- 파일: `src/app/layout.tsx`, `src/app/page.tsx`, `src/components/layout/Header.tsx`, `src/components/upload/PdfUploader.tsx` (껍데기)
- 작업:
  - 헤더("수요재무회" 로고 + 한 줄 설명)
  - `Tabs` 2개: "상장 주식 분석" / "비상장 주식 분석"
  - 각 탭 내부에 PDF 드롭존 자리만 배치(실제 업로드는 3단계)
- 완료 기준: 탭 전환 시 영역이 바뀌고, 드롭존 UI가 보인다
- 예상 소요: **30분**

### 3단계: Vercel Blob 클라이언트 업로드
- 파일: `src/app/api/blob/upload/route.ts`, `src/components/upload/PdfUploader.tsx`
- 작업:
  - `@vercel/blob/client` `handleUpload` 서버 라우트
  - 클라이언트 `upload()` 훅으로 직접 업로드 (PDF만, 최대 20MB)
  - 업로드 성공 시 상위 컴포넌트에 `{url, pathname}` 전달
- 완료 기준: 로컬에서 PDF 업로드 → Blob URL 반환, 브라우저에서 파일 접근 가능
- 예상 소요: **45분**
- 의존: `BLOB_READ_WRITE_TOKEN` 발급 필요
- 왜 클라이언트 직접 업로드인가: Hobby 플랜 4.5MB 서버 요청 제한을 우회하고 60초 타임아웃도 절약됨.

### 4단계: PDF 파싱 (unpdf + LLM 폴백 통합)
- 파일: `src/lib/pdf/extractText.ts`, `src/lib/finance/extractLineItems.ts`, `src/lib/ai/gateway.ts`, `src/app/api/analyze/route.ts`
- 작업:
  - `unpdf`의 `extractText({ mergePages: true })`로 Blob URL에서 텍스트 추출
  - 정규식 기반으로 매출/영업이익/당기순이익/자산/부채/자본/현금 키워드 1차 파싱
  - 1차 파싱이 불완전하면 AI SDK v6 + AI Gateway `generateObject`(Zod 스키마)로 보강
  - Route Handler: `runtime = 'nodejs'`, `maxDuration = 60`
- 완료 기준: `/api/analyze`에 Blob URL POST → 재무항목 JSON 반환 (최근 2~3개년)
- 예상 소요: **1시간 30분**
- 왜 한 단계로 합쳤나: 정규식과 LLM 폴백은 같은 함수의 두 브랜치라 분리 단계로 나누면 흐름만 끊김.

### 5단계: 지표 계산 엔진 (상장 + 비상장 동시 구현)
- 파일: `src/lib/finance/types.ts`, `src/lib/finance/metrics/listed.ts`, `src/lib/finance/metrics/private.ts`
- 작업:
  - 상장 6개: 영업이익률, 순이익률, ROE, ROA, 부채비율, YoY 매출성장률
  - 비상장 4개: Gross Burn Rate, Net Burn Rate, Runway(개월), BEP
  - 순수함수 + Zod 입력 검증. 각 함수 상단에 공식 주석(초보자 이해용)
- 완료 기준:
  - 삼성전자 샘플로 6개 지표 계산값이 엑셀 원본과 ±5% 일치
  - 랜식 샘플로 Runway 값 일치
- 예상 소요: **1시간**
- 왜 한 번에: 같은 입력 타입(`FinancialInput`)에서 분기만 되는 순수함수이므로 두 단계로 나눌 이유 없음.

### 6단계: 결과 화면 (표 + 차트)
- 파일: `src/components/analysis/ResultView.tsx`, `src/components/charts/MetricsChart.tsx`
- 작업:
  - shadcn `Table`로 지표 한 줄씩 표시 (값 + 단위 + 간단 설명 툴팁)
  - Recharts 1~2개 차트: 상장은 수익성 지표 막대그래프, 비상장은 현금잔고/Runway 라인
  - `Skeleton`으로 로딩 상태
- 완료 기준: Mock 지표 JSON으로 렌더링 시 표와 차트가 정상 표시
- 예상 소요: **45분**

### 7단계: AI 해설 스트리밍
- 파일: `src/app/api/explain/route.ts`, `src/components/analysis/AiExplanation.tsx`
- 작업:
  - `streamText` + `gateway('anthropic/claude-sonnet-4.6')`
  - 시스템 프롬프트에 계산된 지표 JSON 주입 → "강약점·리스크" 마크다운 스트리밍
  - 클라이언트는 AI SDK `useCompletion` 또는 `readStreamableValue`로 수신
- 완료 기준: 업로드/분석 후 해설이 타자처럼 스트리밍되어 나타남
- 예상 소요: **1시간**

### 8단계: Blob 정리 + 에러 UX
- 파일: `src/lib/blob/cleanup.ts`, 기존 `/api/analyze` 수정, `src/components/common/ErrorState.tsx`
- 작업:
  - 분석 성공/실패 무관 `del(blobUrl)` 호출 (`finally` 블록)
  - 에러 메시지 한국어: "PDF를 읽을 수 없습니다" / "재무항목을 추출하지 못했습니다" / "타임아웃"
- 완료 기준: 분석 후 Blob 대시보드에서 파일 사라짐 + 깨진 PDF 업로드 시 친절한 에러 메시지 표시
- 예상 소요: **30분**

### 9단계: GitHub 푸시 + Vercel 배포 + 스모크 테스트
- 파일: `README.md`(실행 안내 5줄), `.gitignore` 점검
- 작업:
  - `git init` → GitHub 신규 리포 `수요재무회` 생성 → 푸시
  - Vercel Dashboard에서 Import → 환경변수 2종(`AI_GATEWAY_API_KEY`, `BLOB_READ_WRITE_TOKEN`) 등록
  - Production 배포 → 상장/비상장 각 1개 샘플 PDF로 스모크 테스트
- 완료 기준: Production URL에서 상장·비상장 2가지 시나리오 모두 성공
- 예상 소요: **40분**

---

## 예상 총 소요
40 + 30 + 45 + 90 + 60 + 45 + 60 + 30 + 40 = **440분 ≒ 7시간 20분** (목표 6~8시간 이내)

## 리스크 / 가정
1. **unpdf 한국어 표 파싱 한계**: 재무제표 표 구조가 PDF마다 달라 정규식만으로는 부정확할 수 있음 → 4단계의 LLM 폴백이 1차 방어선.
2. **Hobby 60초 타임아웃**: 대용량 PDF는 LLM 호출이 길어질 수 있음 → Blob 직접 업로드로 서버 부담 최소화, 필요시 페이지 수 제한 안내 문구 추가.
3. **가정**: 사용자는 텍스트 기반 단일 PDF(감사·사업보고서 등)를 업로드. 스캔 PDF는 v2에서 Claude Vision으로 처리.
4. **AI Gateway 무료 쿼터 내 개발 가능**: 초기 트래픽 기준. 프로덕션 트래픽 늘면 유료 전환 필요.

## 의존성·외부 조건
- **환경변수 2종**: `AI_GATEWAY_API_KEY`(Vercel AI Gateway), `BLOB_READ_WRITE_TOKEN`(Vercel Blob Store)
- **계정**: Vercel Hobby, GitHub
- **런타임**: Node.js 20+, npm (pnpm은 이 Windows 환경에서 심볼릭 링크 이슈로 실패하여 npm으로 전환)
- **검증용 원본 데이터**: `C:\Users\디캠프\Desktop\삼성전자_크래프톤_재무분석-1.xlsx`, `C:\Users\디캠프\Desktop\랜식_재무분석_BurnRate.xlsx`

---

## v2 로드맵 (MVP 이후 확장)
- **데이터 소스**: DART API 자동 조회(기업명 검색 → 재무제표 자동 로드), 스캔 PDF OCR(Claude Vision)
- **지표 고도화 (상장)**: PER / PBR / PSR / EV·EBITDA / PEG / DuPont 분해 / EBITDA 마진 / 이자보상배율 / 순차입금·EBITDA / FCF / 유동비율 / 자기자본비율 / 회전율
- **지표 고도화 (비상장)**: Operating Burn, Runway 3시나리오(현상유지·성장·긴축), LTV / CAC / Payback, Rule of 40, Default Alive·Dead, 다음 라운드 시뮬레이션
- **시각화**: 5년 다년 추이 라인차트, 비용 구조 히트맵, DuPont 분해 막대차트, 동종업계 레이더차트
- **AI 기능**: Q&A 후속 대화(멀티턴 `useChat`), 동종업계 평균 비교
- **플랫폼**: 로그인·분석 이력 DB 저장, 결제·구독, 모바일 앱, 다국어(영문)

---

## 진행 기록
- 작업 중 진행 상황은 `현황.md`에 실시간 업데이트 (CLAUDE.md 작업 관리 프로세스 준수)
- 각 단계 완료 시 체크박스 표기 + 커밋
