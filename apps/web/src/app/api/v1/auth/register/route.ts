import type { NextRequest } from "next/server";
import { handleAuthRequest } from "@/lib/auth/http";
export const runtime = "nodejs";
export function POST(request: NextRequest) { return handleAuthRequest(request, "register"); }
