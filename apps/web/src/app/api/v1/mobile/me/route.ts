import type { NextRequest } from "next/server";
import { handleMobileMe } from "@/lib/auth/mobile-http";
export const runtime = "nodejs";
export function GET(request: NextRequest) { return handleMobileMe(request); }
