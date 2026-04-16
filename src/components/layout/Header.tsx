export function Header() {
  return (
    <header className="border-b">
      <div className="mx-auto max-w-5xl px-6 py-5">
        <h1 className="text-2xl font-semibold tracking-tight">수요재무회</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          PDF를 올리면 재무분석을 해드려요
        </p>
      </div>
    </header>
  );
}
