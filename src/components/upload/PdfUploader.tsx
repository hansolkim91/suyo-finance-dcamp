"use client";

import { useRef, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";

type UploadResult = {
  url: string;
  pathname: string;
};

type PdfUploaderProps = {
  tabType: "listed" | "private";
  onUploadComplete?: (result: UploadResult) => void;
};

export function PdfUploader({ tabType, onUploadComplete }: PdfUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [fileName, setFileName] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);

  const subText =
    tabType === "listed"
      ? "감사보고서·사업보고서 등 재무제표 PDF"
      : "스타트업 재무자료 PDF";

  const handleFile = useCallback(
    async (file: File) => {
      if (file.type !== "application/pdf") {
        setStatus("error");
        setErrorMsg("PDF 파일만 업로드할 수 있습니다.");
        return;
      }

      if (file.size > 20 * 1024 * 1024) {
        setStatus("error");
        setErrorMsg("파일 크기는 20MB 이하여야 합니다.");
        return;
      }

      setStatus("uploading");
      setFileName(file.name);
      setErrorMsg("");

      try {
        // FormData로 서버에 직접 전송
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/blob/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "업로드에 실패했습니다.");
        }

        setStatus("done");
        onUploadComplete?.({ url: data.url, pathname: data.pathname });
      } catch (err) {
        setStatus("error");
        setErrorMsg(
          err instanceof Error ? err.message : "업로드에 실패했습니다."
        );
      }
    },
    [onUploadComplete]
  );

  const handleClick = () => {
    if (status === "uploading") return;
    fileInputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <Card>
      <CardContent>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleChange}
        />
        <div
          onClick={handleClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-16 text-center transition-colors ${
            isDragging
              ? "border-primary bg-primary/10"
              : status === "error"
                ? "border-destructive/50 bg-destructive/5"
                : status === "done"
                  ? "border-green-500/50 bg-green-500/5"
                  : "border-muted-foreground/30 bg-muted/20 hover:border-muted-foreground/50 hover:bg-muted/40"
          }`}
        >
          {status === "idle" && (
            <>
              <p className="text-base font-medium">
                PDF 파일을 드래그하거나 클릭해 업로드하세요
              </p>
              <p className="text-sm text-muted-foreground">{subText}</p>
            </>
          )}

          {status === "uploading" && (
            <>
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-base font-medium">업로드 중...</p>
              <p className="text-sm text-muted-foreground">{fileName}</p>
            </>
          )}

          {status === "done" && (
            <>
              <p className="text-base font-medium text-green-700">
                업로드 완료!
              </p>
              <p className="text-sm text-muted-foreground">{fileName}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                다른 파일을 업로드하려면 클릭하세요
              </p>
            </>
          )}

          {status === "error" && (
            <>
              <p className="text-base font-medium text-destructive">
                {errorMsg}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                다시 시도하려면 클릭하세요
              </p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
