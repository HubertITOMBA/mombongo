import type { NextRequest } from "next/server";
import { handleMobileStart } from "@/lib/auth/mobile-http";
export const runtime = "nodejs";
export function POST(request: NextRequest) { return handleMobileStart(request, "login"); }
