import type { NextRequest } from "next/server";
import { handleMobileCatalog } from "@/lib/auth/mobile-http";
export const runtime = "nodejs";
export function GET(request: NextRequest) { return handleMobileCatalog(request); }
