import type { NextRequest } from "next/server";
import { handleMobileRefresh } from "@/lib/auth/mobile-http";
export const runtime = "nodejs";
export function POST(request: NextRequest) { return handleMobileRefresh(request); }
