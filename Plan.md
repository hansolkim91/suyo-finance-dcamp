# 계획: 수요재무회 v5 — 결정론적 점수 + DART 연동 (상장 직조회)

> v4(상장/비상장 분리·외부 데이터·UI 4섹션) 기반에 두 가지 큰 변화를 얹는다.
> ① **LLM은 추출만, 계산·검증은 결정론 함수** — 동일 입력 → 동일 출력 보장
> ② **상장사는 DART OpenAPI 직접 조회** — PDF 추출 우회, 정확도·속도 압승

## 목표 (한 문장)
"상장 종목코드만 입력하면 1~2초 안에 결정론적 점수와 차트까지 뜨고, AI는 자연어 해설만 담당한다."

---

## 핵심 설계 원칙

### 1. LLM 책임 경계
| LLM이 한다 | 결정론 함수가 한다 |
|---|---|
| `summary` (2~3문장 요약) | `categoryScores` (5카테고리 점수) |
| `insight` (10문장+ 종합 의견) | `overallScore` (가중평균) |
| `checklist[i].analysis` (5문장+ 분석 텍스트) | `checklist[i].status` (good/neutral/warning) |
| ~~점수 산정~~ | ~~~~ |

**왜**: 임계값 매핑·가중평균은 100% 결정론이므로 LLM에게 시키면 ① 토큰 낭비 ② 같은 입력에 다른 점수 ③ 잘못된 매핑 위험. 이미 explain/route.ts에 efficiency·profitability override가 있는 건 이 문제를 절반만 푼 상태.

### 2. 상장 데이터 소스 전환
- **현재**: PDF 업로드 → unpdf → AI 추출(30~60초) → metrics
- **v5 이후**: 종목코드 → DART fnlttSinglAcntAll(1~2초) → metrics
- **비상장은 그대로** PDF 경로 유지 (DART에 없으니 당연)

---

## 전체 완료 기준 (Acceptance Criteria)
- [x] **AC1 (옵션 A 결정론)**: explain 응답의 `categoryScores`/`overallScore`/`status`가 라우트에서 결정론 함수로 채워짐. AI 호출 스키마에는 없음 ✓
- [x] **AC2 (재현성)**: 동일 metrics 3회 호출 → categoryScores 100% 동일 ✓ (scoring.ts 순수함수)
- [x] **AC3 (DART 클라이언트)**: 005930 → revenue/operatingProfit/totalAssets 등 정상 매핑 ✓ (2023~2025 매출 258→301→334조)
- [x] **AC4 (상장 흐름)**: 회사명 검색 → 분석 → 4섹션 정상 렌더 ✓
- [x] **AC5 (비상장 회귀)**: 한솔 님 사전 확인 — 비상장 PDF 정상 ✓
- [x] **AC6 (빌드)**: `npm run build` 통과 ✓ (3.8s, warning 0, 라우트 8개)
- [ ] **AC7 (배포)**: Vercel production 자동 배포 + DART_API_KEY 환경변수 등록 — 진행 중

---

## 작업 단계 (총 8단계)

### 1단계: 결정론적 scoring 모듈 (DART 키 발급 대기 동안 가능)
- **목표**: 5카테고리 점수 + 종합 점수 + 체크리스트 status를 모두 코드로
- **신규 파일**: `src/lib/finance/scoring.ts`
- **함수**:
  - `scoreListed(metrics: ListedMetrics[]): CategoryScores` — 최신 연도 기준 5점수
    - profitability ← 영업이익률 임계값 (20/10/5/0)
    - stability ← 부채비율 (50/100/200, invert)
    - growth ← 매출 YoY (20/10/0)
    - efficiency ← ROE (20/15/10/5)
    - cashflow ← 영업이익률 + 부채비율 결합 룰 (현재 explain 프롬프트에 있는 규칙 그대로)
  - `scorePrivate(privateMetrics): CategoryScores` — VC 루브릭
    - stability ← Runway (≥18 / 12~18 / 6~12 / <6 / 흑자=95)
    - growth ← 매출 YoY (50/20/5/0/역성장)
    - profitability ← GM·OPM 결합
    - efficiency ← Burn YoY (감소 + 매출 성장 = 90)
    - cashflow ← 영업CF + 현금잔고
  - `calcOverall(scores: CategoryScores, type): number` — 가중평균
  - `calcChecklistStatus(metrics, category: string): SignalStatus` — thresholds 활용
- **완료 기준**: 임의 metrics로 5점수 출력, 동일 입력 동일 출력
- **예상 변경**: scoring.ts(신규)
- **WHY**: explain 프롬프트의 임계값을 코드로 옮겨 단일 진실원본화. 임계값을 바꾸려면 한 파일만 고침

---

### 2단계: explain 스키마 슬림화 + 라우트 조립
- **목표**: AI는 텍스트만, 점수는 라우트가 채움
- **변경**:
  - `explain/route.ts`의 `checklistSchema`에서 다음 제거:
    - `categoryScores` (스키마 키 제거)
    - `overallScore`
    - `checklist[].status`
  - 프롬프트에서 점수 산정 규칙 섹션 제거 (이제 코드가 함)
  - 라우트 흐름:
    1. AI 호출 → `summary`, `insight`, `checklist[].{category, keyItems, source, analysis}` 받음
    2. `scoring.scoreListed(metrics)` 또는 `scorePrivate` 호출
    3. `calcOverall()` 호출
    4. checklist 각 항목에 `status` 채움 (`calcChecklistStatus`)
    5. 합쳐서 응답
  - 기존 결정론적 override(254~282줄) 제거 (scoring으로 흡수)
- **완료 기준**: 동일 metrics 3회 → 점수 100% 동일, ResultView 회귀 없음
- **예상 변경**: explain/route.ts
- **WHY**: AI 출력 토큰 ~30% 감소, 응답 시간 단축, 결정론 보장

---

### 3단계: DART 키 + 클라이언트 골격
- **선행 조건**: 한솔 님 DART API 키 발급 → `.env.local`에 `DART_API_KEY=...`
- **신규 파일**:
  - `src/lib/dart/types.ts` — DART 응답 타입
  - `src/lib/dart/client.ts` — fetch 래퍼 + 에러 처리 + base URL
- **API 베이스**: `https://opendart.fss.or.kr/api/`
- **`.env.local.example`** 갱신: `DART_API_KEY=발급받은_40자_키`
- **완료 기준**: dart/client.ts에서 임의 GET 1회 성공 (테스트 가능)
- **WHY**: 모든 DART 호출이 한 곳을 거치게 해서 키 관리·로깅·에러 일관

---

### 4단계: corpCode 매핑 (종목코드 → corp_code)
- **배경**: DART는 자체 8자리 corp_code 키 사용. 사용자는 6자리 종목코드만 안다
- **신규 파일**: `src/lib/dart/corpCode.ts`
- **로직**:
  - 최초 1회 `https://opendart.fss.or.kr/api/corpCode.xml` 다운로드 (~3MB ZIP)
  - JSZip 또는 unzipper로 압축 해제 → XML 파싱 → 메모리 Map 캐시 (1일 TTL)
  - `findCorpCode(stockCode: string): Promise<string | null>`
- **의존성**: 가능하면 정규식으로 XML 파싱 (XML 단순), 안되면 fast-xml-parser 추가
- **완료 기준**: `findCorpCode("005930")` → `"00126380"` (삼성전자)
- **WHY**: corpCode.xml은 모든 회사 매핑표 1회 다운로드면 충분 — 매번 호출하면 낭비

---

### 5단계: DART 재무제표 조회 + yearDataSchema 매핑
- **신규 파일**: `src/lib/dart/financialStatement.ts`
- **API**: `fnlttSinglAcntAll` (단일회사 전체 재무제표)
  - 파라미터: `crtfc_key`, `corp_code`, `bsns_year`, `reprt_code=11011` (사업보고서)
  - 응답: 계정과목 리스트 (account_nm, thstrm_amount, frmtrm_amount, bfefrmtrm_amount)
- **함수**:
  - `fetchFinancialData(stockCode: string): Promise<FinancialData>`
  - 내부: corpCode 조회 → 최근 3개년 fnlttSinglAcntAll 호출 → 매핑
- **계정과목 → yearDataSchema 매핑 테이블**:
  - "매출액" / "수익(매출액)" → `revenue`
  - "매출원가" → `costOfGoodsSold`
  - "매출총이익" → `grossProfit`
  - "영업이익" / "영업이익(손실)" → `operatingProfit`
  - "당기순이익" / "당기순이익(손실)" → `netIncome`
  - "이자비용" → `interestExpense`
  - "자산총계" → `totalAssets`
  - "유동자산" → `currentAssets`
  - "재고자산" → `inventory`
  - "부채총계" → `totalLiabilities`
  - "유동부채" → `currentLiabilities`
  - "자본총계" → `totalEquity`
  - "영업활동현금흐름" / "영업활동으로인한현금흐름" → `operatingCashFlow`
  - "현금및현금성자산" → `cashBalance`
  - "판매비와관리비" → `sgaExpenses`
- **정규화**: 공백 제거, 괄호 내용 제거(예: "(손실)"), 부호 통일
- **완료 기준**: `fetchFinancialData("005930")` → years 3개, 모든 핵심 필드 채워짐
- **WHY**: AI 추출 30~60초 → DART 1~2초. 정확도는 XBRL 정형 데이터라 100%

---

### 6단계: analyze 라우트 분기 (PDF + DART 병행)
- **신규**: `src/app/api/analyze-by-code/route.ts`
  - 입력: `{ stockCode: string }` (상장 전용)
  - 흐름: DART corpCode 매핑 → fnlttSinglAcntAll → financialData → calculateListedMetrics → 응답
- **기존 `/api/analyze` (PDF)**: 그대로 유지 — 상장·비상장 모두 가능
  - 비공시 회사, 과거 자료, 내부 보고서 등 PDF가 필요한 케이스 대비
- **응답 형식**: 두 라우트 모두 `{ companyName, financialData, ... }` 동일 → AnalysisPanel·ResultView 호환
- **완료 기준**: `curl -X POST localhost:3000/api/analyze-by-code -d '{"stockCode":"005930"}'` → 정상 JSON
- **WHY**: 라우트 분리가 더 명확. PDF 흐름과 DART 흐름이 책임 다름

---

### 7단계: 상장 탭 UI — 입력 모드 토글 + 회사명 자동완성
- **상장 탭 UI**: 입력 모드 세그먼트/라디오
  ```
  [● DART 직조회 (빠름·정확)]   [○ PDF 업로드]
  ──────────────────────
   · DART 모드: 회사명 검색 박스 + 자동완성 드롭다운
       - 입력: "삼성" → 추천: ["삼성전자 (005930)", "삼성SDI (006400)", "삼성생명 (032830)", ...]
       - 추천 항목 클릭 → stockCode 채워지고 분석 버튼 활성화
       - 분석 버튼 → /api/analyze-by-code (1~2초)
   · PDF 모드: 기존 PdfUploader → /api/analyze (30~60초)
  ```
  - 디폴트: DART 모드 (빠르고 정확)
  - PDF는 비공시·과거자료·내부분석용으로 명시
- **자동완성 동작**:
  - 1자 이상 입력 시 200~300ms debounce 후 `/api/dart/search?q=...` 호출
  - 결과 최대 10개 드롭다운 표시 (회사명 + 종목코드)
  - 키보드 네비게이션 (↑↓ Enter ESC) 권장
  - 선택 후 입력박스에 회사명 + 옆에 종목코드 배지
- **비상장 탭**: PDF 업로더만 유지 (DART는 비상장에 없음)
- **AnalysisPanel 분기**:
  - 상장 + DART 모드 → analyze-by-code 흐름
  - 상장 + PDF 모드 → 기존 PDF 흐름
  - 비상장 → 기존 PDF 흐름
- **에러 처리**:
  - 검색 결과 없음 → "이 회사가 검색되지 않으면 PDF 모드로 시도해보세요" 안내
  - DART 응답 데이터 없음 → "사업보고서 미공시 — PDF로 시도해보세요" (PDF 모드 권유)
- **완료 기준**:
  - "삼성전자" 입력 → 자동완성 드롭다운 → 선택 → 분석 → 4섹션 + 동종비교 정상
  - PDF 모드도 기존처럼 동작
  - 비상장은 회귀 없음
- **WHY**: 종목코드를 외우는 사용자는 적음 — 회사명 검색이 자연. 자동완성은 잘못된 회사명으로 인한 실패를 입력 시점에 차단.

---

### 8단계: 회귀 테스트 + 커밋 + 배포
- **테스트**:
  - 상장 005930 (삼성전자), 000660 (SK하이닉스), 035720 (카카오) 3건
  - 비상장 PDF 1건 회귀
  - 동일 metrics 3회 → categoryScores 동일 확인
- **`npm run build`** 통과
- **현황.md** 갱신
- **git add + commit + push** → Vercel 자동 배포
- **Vercel 대시보드에서 `DART_API_KEY` 환경변수 추가** (Production)
- **완료 기준**: AC1~AC7 모두 체크, 프로덕션에서 005930 정상

---

## 범위 밖 (Out of Scope)
- 분기/반기 보고서 조회 (`reprt_code` 11013/11012/11014) — MVP는 사업보고서만
- DART 회사명 검색 (자동완성) — v6
- corpCode 캐시를 Vercel KV로 이전 — 트래픽 늘어난 후
- 도구 호출(Tool Use) 패턴 — 본 라운드 옵션 A로 충분, 진짜 외부 도구가 늘어날 때 도입
- 사용자가 동종업체를 직접 선택하는 UI — v6

---

## 리스크 / 가정
1. **DART 계정과목명이 회사마다 미세하게 다름**: 매핑 함수에 정규화(공백·괄호 제거) + 1차/2차 매칭. 매핑 실패 시 해당 필드 null로 두고 UI에서 "데이터 없음" 처리
2. **corpCode.xml.zip 다운로드 시간**: ~3MB, Vercel cold start에 1초 미만 추가. 메모리 캐시 1일 TTL이면 hot start에서는 무비용
3. **DART 사업보고서 미공시 회사**: 신규 상장사·소형주 일부. UI에서 "공시 데이터 없음" 안내
4. **Gemini가 categoryScores 필드 없으니 다른 형식으로 응답할 위험**: 스키마에서 빼면 generateObject가 자동으로 강제하므로 안전
5. **점수 임계값이 explain 프롬프트에서 코드로 이동 → 프롬프트와 코드 둘 다 갱신 필요한 부담**: 임계값은 코드 단일 출처, 프롬프트에선 점수 산정 지시문 자체를 삭제

---

## 의존성·외부 조건
- 환경변수 추가: `DART_API_KEY`
- 신규 npm 패키지 가능성: `jszip` (XML zip 압축 해제, 약 0.4MB) — 정규식만으로 부족하면 추가
- 외부 의존: DART OpenAPI (https://opendart.fss.or.kr)
- DART 호출 한도: 분당 1,000회 (개인 무료, 충분)

---

## 진행 기록
- 각 단계 완료 시 `현황.md` 실시간 업데이트
- 단일 commit은 단계별로 (이번엔 길어서 단일 commit 부담스러움)

## 다음 에이전트로
- Coder에게: **1단계(scoring.ts)** 부터 착수 — DART 키 발급 대기와 무관하게 즉시 가능
