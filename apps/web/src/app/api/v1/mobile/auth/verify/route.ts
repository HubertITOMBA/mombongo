import type { NextRequest } from "next/server";
import { handleMobileVerify } from "@/lib/auth/mobile-http";
export const runtime = "nodejs";
export function POST(request: NextRequest) { return handleMobileVerify(request); }
