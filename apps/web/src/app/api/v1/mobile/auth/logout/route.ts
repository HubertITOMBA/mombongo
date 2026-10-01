import type { NextRequest } from "next/server";
import { handleMobileLogout } from "@/lib/auth/mobile-http";
export const runtime = "nodejs";
export function POST(request: NextRequest) { return handleMobileLogout(request); }
