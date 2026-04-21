# 계획: 수요재무회 — 상장/비상장 분리 + 깔끔 UI + 외부 데이터 통합 (v4)

> v3 기반에 한솔 님 추가 요구사항 반영하여 v4로 확장.
> 추가: ① 차트=숫자 원칙(중복 금지) ② AI 분석 길이/깊이 강화 ③ 밸류에이션(PER/PBR) ④ 유사 업체 비교 (네이버 금융 + AI 추천)

## 목표 (한 문장)
상장은 **과거 실적 4섹션 + 밸류에이션 + 동종업계 비교**, 비상장은 **현금·Runway 8섹션 (VC 관점)**으로 분리해서, "지금 이 회사가 어떤 위치인지" 한눈에 보이는 분석 대시보드를 만든다.

---

## 전체 완료 기준 (Acceptance Criteria)

### 데이터 / 지표
- [x] **AC1 (스키마 + 신규 필드)**: 통합 `yearDataSchema`에 `inventory`, `restrictedCash` 추가, AI 1회 호출로 추출 (1단계 완료, PDF 검증 대기).
- [ ] **AC2 (상장 유동성 3종)**: 유동비율·당좌비율·현금비율 추가 + 신호등 배지.
- [ ] **AC3 (비상장 신규 4종)**: Runway 4시나리오·BEP 역산·현금 3분류·Burn YoY.

### 화면 구조
- [ ] **AC4 (상장 화면)**: 4섹션 카드(성장/수익/안정/유동) + 밸류에이션 카드 + 동종업계 비교 카드 + AI 종합. **각 지표 1회만 노출** (KPI 카드와 차트가 같은 숫자를 보여주지 않음).
- [ ] **AC5 (비상장 화면)**: 8섹션 (정보박스/회사+점수/현금포지션/Burn/Runway/BEP/자본·차입/AI).
- [ ] **AC6 (ResultView 분리)**: 1378줄 단일 파일 → Listed/Private + 공통 컴포넌트로 분리. 각 파일 500줄 이하.
- [ ] **AC7 (차트=숫자 원칙)**: 차트가 표시하는 숫자(매출·이익·비율 등)를 별도 KPI 카드로 중복 표시하지 않는다. 수치는 **차트 hover/툴팁 + 표 1군데**에서만.

### 외부 데이터 (신규)
- [ ] **AC8 (종목코드 자동 추출)**: AI가 PDF에서 종목코드(6자리)를 추출. 실패 시 fallback (종목명 → AI가 한국 상장사 코드 추론).
- [ ] **AC9 (네이버 금융 스크래핑)**: 종목코드로 시가총액·PER·PBR·EPS·BPS·52주 최고/최저 수집. API 라우트 `/api/peers`.
- [ ] **AC10 (밸류에이션 카드)**: 본 회사 PER·PBR·PSR + "업종평균 대비 할인/프리미엄" 표시.
- [ ] **AC11 (동종업계 비교)**: AI가 동종 한국 상장사 3개 추천 + 각 회사 데이터 가져와 표 비교 (외형/영업이익률/PER/PBR).

### AI / 톤
- [ ] **AC12 (AI 분석 강화)**: 상장·비상장 모두 AI 해설이 **10~15문장 이상 + 구체 수치 인용 + 강점/약점/리스크 각 섹션 분리**. 짧은 요약 톤 금지.
- [ ] **AC13 (AI 프롬프트 분기)**: 상장=재무 선배 톤 / 비상장=VC 심사역 톤. 둘 다 "## ACTION 제안" 헤더 + 3~5개 구체 행동.

### 스모크
- [ ] **AC14 (로컬 스모크)**: 상장·비상장 샘플 PDF → end-to-end 정상, 외부 데이터 정상 표시, 콘솔 에러 0, `npm run build` 성공.

---

## 범위 밖 (Out of Scope)
- **FCF, DuPont 3분해, 지원금 의존도** — 깔끔/간략 우선, 다음 라운드
- **Vercel 배포** — 본 라운드 완료 후 별도 단계
- **세미나·FDD 사례 반영** — 자료 추가 후 별도 작업
- **모바일 전용 레이아웃 재설계** — 기존 수준 유지
- **유사 업체 추천을 사용자가 수정** — 1차는 AI 자동만, UI는 v5

---

## 작업 단계 (총 9단계)

### 1단계: 신규 필드 추가 ✅ 완료 (2026-04-21)
- `inventory`, `restrictedCash` 추가, PDF 전체 텍스트 1회 호출 구조 정착
- `extractLineItems.ts` 정규식 폴백에도 키워드 추가
- **남은 검증**: 한솔 님이 상장 PDF 재업로드해서 모든 필드 채워지는지 확인

---

### 2단계: 상장 유동성 지표 3종 추가
- **목표**: 4섹션 중 "유동성"에 필요한 지표 3개 함수 추가 + 임계값 분류 객체
- **작업 목록**:
  - `src/lib/finance/metrics/listed.ts`
    - `calcCurrentRatio(y)` = currentAssets / currentLiabilities × 100
    - `calcQuickRatio(y)` = (currentAssets − inventory) / currentLiabilities × 100
    - `calcCashRatio(y)` = cashBalance / currentLiabilities × 100
  - `src/lib/finance/thresholds.ts` (신규)
    - 4카테고리 분류 객체 + 신호등 임계값
- **완료 기준**: 단위 테스트 또는 콘솔로 3개 지표값 확인
- **예상 변경**: `metrics/listed.ts`, `thresholds.ts`(신규)

---

### 3단계: 비상장 지표 4종 추가
- **목표**: Runway 4시나리오 / BEP 역산 / 현금 3분류 / Burn YoY 계산 함수
- **작업 목록**: `metrics/private.ts`
  - `calcRunwayScenarios(latest, prior?)` → 4시나리오 (baseline / tight / growth / worst)
  - `calcBepReverse(y)` → 흑자 전환 필요 매출 + 성장률
  - `calcCashPosition(y)` → immediate / restricted 분리 + 주석
  - `calcBurnYoY(latest, prior)` → Gross/Net Burn 전년 대비 %
- **완료 기준**: 비상장 샘플로 4시나리오 출력, BEP 양수, 현금 합계 일치
- **예상 변경**: `metrics/private.ts`

---

### 4단계: 외부 데이터 (네이버 금융 스크래핑) — 신규
- **목표**: 종목코드 → 시가총액·PER·PBR·EPS·BPS 등 가져오는 API 라우트
- **작업 목록**:
  - `src/app/api/peers/route.ts` (신규)
    - POST body: `{ stockCode: string }` → 단일 회사 데이터
    - POST body: `{ stockCodes: string[] }` → 다회사 데이터 배열
    - 네이버 금융 종목 페이지 HTML 스크래핑 (`https://finance.naver.com/item/main.naver?code=XXXXXX`)
    - 정규식 또는 cheerio로 추출: 시가총액, PER, PBR, EPS, BPS, 52주 최고/최저
    - 응답 캐시 (1시간 메모리 캐시 or Vercel KV — 1차는 메모리)
  - `src/lib/peers/types.ts` (신규) — `PeerData` 타입
  - `src/lib/peers/naverFinance.ts` (신규) — 스크래핑 로직
- **리스크**:
  - 네이버 HTML 구조 변경 시 깨짐 → 정규식을 느슨하게 + 실패 시 null 반환
  - User-Agent 없으면 차단 → fetch 헤더에 일반 브라우저 UA 설정
- **완료 기준**: `curl -X POST localhost:3000/api/peers -d '{"stockCode":"005930"}'` 정상 응답, 시가총액·PER·PBR 값 존재
- **예상 변경**: `api/peers/route.ts`(신규), `lib/peers/*`(신규)
- **의존성 추가**: 필요 시 `cheerio` (정규식으로 충분하면 생략)

---

### 5단계: AI 종목코드 + 동종업체 추천
- **목표**: AI가 PDF에서 종목코드 추출, 동종 한국 상장사 3개 추천 (코드 포함)
- **작업 목록**:
  - `src/lib/finance/types.ts` 확장
    - `FinancialData`에 `stockCode: string | null`, `peerSuggestions: { name: string; code: string }[]` 추가
  - `src/lib/ai/gateway.ts` 프롬프트에 추가:
    - "사업보고서에서 종목코드(KOSPI/KOSDAQ 6자리)를 찾아 stockCode에 기입"
    - "이 회사와 동종 업종의 **한국 상장사 3개**(시가총액 비슷한 수준)를 추천. 각 회사명+종목코드. 미국·해외 회사 제외"
  - `src/app/api/analyze/route.ts`에서 AI 추출 결과 그대로 반환 (스키마 변경만 영향)
- **완료 기준**: 삼성전자 PDF 업로드 시 stockCode="005930", peerSuggestions에 3개 회사 (예: SK하이닉스 000660, LG전자 066570 등)
- **예상 변경**: `types.ts`, `ai/gateway.ts`

---

### 6단계: ResultView 파일 분리
- **목표**: 1378줄 단일 파일을 6~7개로 분리 (이후 단계 작업 범위를 좁힘)
- **작업 목록**:
  - `src/components/analysis/ResultViewListed.tsx` (신규)
  - `src/components/analysis/ResultViewPrivate.tsx` (신규)
  - `src/components/analysis/shared/` (공통 컴포넌트)
    - `ScoreGauge.tsx`, `CategoryCard.tsx`, `KpiMini.tsx`, `SignalBadge.tsx`
  - `src/components/analysis/ResultView.tsx` → 단순 분기만
- **완료 기준**: 기존 화면 동작 그대로, 각 파일 500줄 이하

---

### 7단계: 상장 화면 재구성 (4섹션 + 밸류에이션 + 동종비교)
- **목표**: ResultViewListed 화면을 깔끔 재배치. **차트=숫자 원칙** 강제.
- **작업 목록**:
  - `ResultViewListed.tsx` 화면 구조:
    ```
    ① 회사명 + 종목코드 + 종합 점수 게이지
    ② AI 종합 의견 (재무 선배 톤, 길게)
    ③ 핵심 재무 요약표 (절대 금액, 1회만)
    ④ 4섹션 카드 (각각 차트 1개 + AI 해설. KPI 카드 별도 추가 금지)
       - 성장성: 매출/영업이익 콤보 차트 (숫자는 차트에서)
       - 수익성: 마진 추이 라인 차트 + ROE/ROA
       - 안정성: 부채비율·자기자본비율 추이 차트
       - 유동성: 유동비율·당좌비율·현금비율 막대 차트
    ⑤ 밸류에이션 카드 (PER, PBR, PSR + 업종평균 대비)
    ⑥ 동종업계 비교 카드 (3개 회사 표: 외형/영업이익률/PER/PBR)
    ⑦ 4축 레이더 차트 (성장/수익/안정/유동)
    ```
  - **삭제 대상** (중복):
    - 기존 `FinancialRatiosTable` (11개 합본 표) — 4섹션 차트로 분산
    - 기존 `ProfitFlowSection` KPI 카드 4개 — 차트와 중복
    - 기존 `EvaluationSection`, `RiskSection`, `BusinessModelSection` — AI 종합으로 흡수
  - **신규 컴포넌트**:
    - `src/components/analysis/listed/ValuationCard.tsx`
    - `src/components/analysis/listed/PeerComparisonTable.tsx`
- **완료 기준**:
  - 매출액·영업이익률·ROE 등 각 지표가 **화면에 1회만** 등장 (Grep 또는 시각 확인)
  - 밸류에이션·동종비교 카드 표시
  - `ResultViewListed.tsx` 500줄 이하

---

### 8단계: 비상장 8섹션 + AI 프롬프트 분기 + 자세한 톤
- **목표**: 비상장 화면 신규 + AI 프롬프트 두 톤으로 완전 분리 + 길게 작성
- **작업 목록**:
  - `ResultViewPrivate.tsx` 화면 구조:
    ```
    ① 비상장 분석 안내 박스 (파란 톤, 한 줄)
    ② 회사 한 줄 + 생존성 점수
    ③ 현금 포지션 (즉시가용/사용제한 스택바)
    ④ Burn Rate (Gross/Net/YoY)
    ⑤ Runway 4시나리오 표
    ⑥ BEP 역산 카드
    ⑦ 자본·차입 구조 (자본잠식 배지 + 부채vs자본 차트)
    ⑧ AI 해설 (VC 심사역 톤, 길게)
    ```
  - 신규 컴포넌트: `private/CashPositionBar.tsx`, `RunwayScenarioTable.tsx`, `BepReverseCard.tsx`
  - `src/app/api/explain/route.ts` 프롬프트 분기:
    - **LISTED_SYSTEM_PROMPT** (재무 선배):
      - **10~15문장 이상**, 구체 수치 인용 필수
      - 임계값 루브릭 (ROE ≥15% 우수, 부채비율 ≤100% 양호 등)
      - 출력 헤더: `## 종합 진단` `## 강점` `## 약점·리스크` `## 동종업계 대비` `## ACTION 제안 (3~5개)`
    - **PRIVATE_SYSTEM_PROMPT** (VC 심사역):
      - **10~15문장 이상**, Runway·Burn 수치 인용 필수
      - 임계값 (Runway <6개월=심각, BurnYoY +20%↑=경고)
      - 출력 헤더: `## 생존성 진단` `## 강점` `## 리스크` `## VC 핵심 질문 (3개)` `## ACTION 제안 (3~5개)`
- **완료 기준**: 비상장 8섹션 모두 렌더링, AI 응답 둘 다 10문장 이상, ACTION 헤더 존재

---

### 9단계: 로컬 스모크 + 현황.md 정리
- **목표**: 통합 검증, 결과 기록, **한 번에 git commit**
- **작업 목록**:
  - 상장 PDF 업로드 → 4섹션 + 밸류에이션 + 동종비교 + 자세한 AI 응답 확인
  - 비상장 PDF 업로드 → 8섹션 + 자세한 AI 응답 확인
  - `npm run build` 성공
  - `현황.md` 갱신 + `Plan.md` 체크박스
  - `git add` (참고자료/는 .gitignore) + 단일 커밋
- **완료 기준**: AC1~AC14 모두 체크

---

## 리스크 / 가정
1. **네이버 금융 HTML 변경**: 정규식을 느슨하게 + 추출 실패 시 카드에 "데이터 없음" 표시
2. **AI가 동종업체로 외국 회사 추천**: 프롬프트에 "한국 상장사만, 6자리 종목코드 필수" 명시
3. **AI가 잘못된 종목코드 추천**: 네이버 스크래핑 실패 시 그 회사만 빈 데이터로 표시
4. **18개 nullable + stockCode + peerSuggestions 추가로 스키마 더 커짐**: Gemini 2.5 flash는 충분히 처리 (실측 통과 시)
5. **AI 응답 길이 증가로 토큰 비용·시간 증가**: AI 해설 ~30초까지 늘어날 수 있음 → 스트리밍 UI 그대로 유지

## 의존성·외부 조건
- 환경변수: `AI_GATEWAY_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `GEMINI_API_KEY`
- 외부 의존: 네이버 금융 (https://finance.naver.com/item/main.naver?code=XXXXXX)
- 신규 npm 패키지: `cheerio` (선택, 정규식으로 충분하면 생략)

---

## 다음 에이전트로
- Coder에게: **2단계(상장 유동성 지표 3종)** 부터 착수
- 한솔 님 PDF 검증(1단계) 결과는 진행 중에 별도 확인

## 진행 기록
- `현황.md` 실시간 업데이트
- 각 단계 완료 시 체크박스, 단일 commit은 9단계에서
