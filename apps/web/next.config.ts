import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@mombongo/contracts"],
  serverExternalPackages: ["pdfkit", "pdf-lib", "xmlbuilder2"],
  outputFileTracingIncludes: {
    "/api/v1/documents/[id]/pdf": ["./src/lib/pdf/fonts/**/*"],
    "/api/v1/mobile/documents/[id]/pdf": ["./src/lib/pdf/fonts/**/*"],
    "/api/v1/documents/[id]/factur-x": ["./src/lib/pdf/fonts/**/*", "./src/lib/einvoice/icc/**/*"],
    "/api/v1/mobile/documents/[id]/factur-x": ["./src/lib/pdf/fonts/**/*", "./src/lib/einvoice/icc/**/*"],
  },
};
export default config;
