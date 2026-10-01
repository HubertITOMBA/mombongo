import type { NextRequest } from "next/server";
import { handleMobilePipeline } from "@/lib/auth/mobile-http";
export const runtime = "nodejs";
export function GET(request: NextRequest) { return handleMobilePipeline(request); }
