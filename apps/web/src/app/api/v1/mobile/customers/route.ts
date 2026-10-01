import type { NextRequest } from "next/server";
import { handleMobileCustomers } from "@/lib/auth/mobile-http";
export const runtime = "nodejs";
export function GET(request: NextRequest) { return handleMobileCustomers(request); }
