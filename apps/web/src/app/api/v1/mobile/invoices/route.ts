import type { NextRequest } from "next/server";
import { handleMobileInvoices } from "@/lib/auth/mobile-http";
export const runtime = "nodejs";
export function GET(request: NextRequest) { return handleMobileInvoices(request); }
