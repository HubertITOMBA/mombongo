import type { NextRequest } from "next/server";
import { handleMobileCreateQuote, handleMobileQuotes } from "@/lib/auth/mobile-http";
export const runtime = "nodejs";
export function GET(request: NextRequest) { return handleMobileQuotes(request); }
export function POST(request: NextRequest) { return handleMobileCreateQuote(request); }
