"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";

type SearchResult = { corpName: string; stockCode: string };

type StockSearchInputProps = {
  onSelect: (stockCode: string, corpName: string) => void;
};

/**
 * DART 상장사 회사명 자동완성 입력 컴포넌트.
 *
 * 동작:
 *   1. 사용자가 회사명 입력 (1자 이상)
 *   2. 250ms debounce 후 /api/dart/search 호출
 *   3. 결과 드롭다운 (최대 10개)
 *   4. 키보드(↑↓ Enter ESC) 또는 클릭으로 선택
 *   5. 선택 시 onSelect(stockCode, corpName) 호출 → 부모가 분석 시작
 *
 * 왜 debounce 250ms:
 *   - 한 글자씩 입력할 때마다 호출 안 함 (네트워크/서버 절약)
 *   - 250ms는 자연스러운 입력 속도와 응답 사이 균형
 *
 * 왜 keyDown 핸들러:
 *   - 마우스 없이 키보드만으로도 선택 가능 → 접근성·속도 ↑
 *   - 자동완성 UX 표준
 */
export function StockSearchInput({ onSelect }: StockSearchInputProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── debounce 검색 ──
  // 핵심: isOpen은 query 입력 즉시 true, results/loading 상태는 드롭다운 안에서 분기.
  // 그래야 ① 응답 대기 동안 "검색 중…" 표시, ② 결과 0개일 때 "결과 없음" 박스가 뜸.
  useEffect(() => {
    if (selected) return;
    const trimmed = query.trim();
    if (trimmed.length < 1) {
      setResults([]);
      setIsOpen(false);
      setLoading(false);
      return;
    }

    setIsOpen(true); // 입력 시작 즉시 드롭다운 컨테이너 보이게
    setResults([]); // 이전 결과 제거 (질의 바뀌면 stale 표시 방지)
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/dart/search?q=${encodeURIComponent(trimmed)}&limit=10`
        );
        const json = await res.json();
        setResults(json.results ?? []);
        setHighlightIdx(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, selected]);

  // ── 외부 클릭 시 드롭다운 닫기 ──
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const handlePick = useCallback(
    (r: SearchResult) => {
      setSelected(r);
      setQuery(`${r.corpName} (${r.stockCode})`);
      setIsOpen(false);
      onSelect(r.stockCode, r.corpName);
    },
    [onSelect]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || results.length === 0) {
      // 결과 없을 때 ESC면 입력 초기화
      if (e.key === "Escape") {
        setQuery("");
        setSelected(null);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[highlightIdx];
      if (r) handlePick(r);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setSelected(null); // 입력이 바뀌면 선택 해제
  };

  return (
    <div ref={containerRef} className="space-y-4">
      {/* 안내 헤더 — 별도 칸으로 분리해서 시각적 강조 */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent>
          <div className="py-3">
            <h3 className="text-base font-semibold text-foreground">
              상장사 DART 직조회
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              회사명을 입력하면 KOSPI·KOSDAQ 상장사 추천 목록이 떠요. 선택하면
              전자공시시스템(DART)에서 사업보고서 재무제표를 1~2초 안에
              가져옵니다.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 큰 검색 입력 박스 — 메인 액션 강조.
          overflow-visible로 덮어쓰는 이유: Card 기본 overflow-hidden이
          absolute로 펼쳐지는 자동완성 드롭다운(ul.top-full)을 잘라버림 */}
      <Card className="overflow-visible">
        <CardContent>
          <div className="py-2">
            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onFocus={() => results.length > 0 && setIsOpen(true)}
                placeholder="회사명 입력 (예: 삼성전자, SK하이닉스, 카카오)"
                className="w-full rounded-xl border-2 border-input bg-background px-6 py-5 text-lg font-medium shadow-sm placeholder:text-base placeholder:font-normal placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15"
                autoComplete="off"
                spellCheck={false}
              />
              {/* 통합 드롭다운: isOpen일 때만 컨테이너 표시, 내부는 loading/results로 분기 */}
              {isOpen && (
                <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-80 overflow-auto rounded-xl border-2 border-border bg-popover shadow-xl">
                  {loading && (
                    <div className="px-6 py-4 text-sm text-muted-foreground">
                      검색 중…
                    </div>
                  )}

                  {!loading && results.length > 0 && (
                    <ul>
                      {results.map((r, idx) => (
                        <li
                          key={`${r.stockCode}-${idx}`}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handlePick(r);
                          }}
                          onMouseEnter={() => setHighlightIdx(idx)}
                          className={`flex cursor-pointer items-center justify-between px-6 py-3.5 text-base transition-colors ${
                            idx === highlightIdx
                              ? "bg-accent text-accent-foreground"
                              : "hover:bg-accent/50"
                          }`}
                        >
                          <span className="font-medium">{r.corpName}</span>
                          <span className="ml-3 rounded-md bg-muted px-2.5 py-1 font-mono text-sm text-muted-foreground">
                            {r.stockCode}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {!loading && results.length === 0 && query.trim() && (
                    <div className="px-6 py-4 text-sm text-muted-foreground">
                      검색 결과가 없습니다. PDF 모드로 시도해보세요.
                    </div>
                  )}
                </div>
              )}
            </div>

            {selected && (
              <div className="mt-4 rounded-lg bg-primary/10 px-4 py-3 text-sm text-primary">
                ✓ 선택됨:{" "}
                <span className="font-semibold">{selected.corpName}</span>{" "}
                <span className="font-mono text-xs opacity-80">
                  ({selected.stockCode})
                </span>{" "}
                — DART에서 재무제표를 가져오는 중입니다…
              </div>
            )}

            {!selected && (
              <p className="mt-3 px-1 text-xs text-muted-foreground">
                ↑ ↓ 키로 이동, Enter로 선택, ESC로 취소
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
