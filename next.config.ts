import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist와 unpdf는 Node.js 네이티브 모듈이라 번들링하면 깨짐
  // 서버 외부 패키지로 등록해서 번들링에서 제외
  serverExternalPackages: ["pdfjs-dist", "unpdf"],
};

export default nextConfig;
