import type { NextRequest } from "next/server";
import { handleMobileResend } from "@/lib/auth/mobile-http";
export const runtime = "nodejs";
export function POST(request: NextRequest) { return handleMobileResend(request); }
