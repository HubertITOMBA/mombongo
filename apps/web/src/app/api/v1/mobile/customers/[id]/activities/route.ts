import type { NextRequest } from "next/server";
import { handleMobileActivity } from "@/lib/auth/mobile-http";
export const runtime = "nodejs";
export function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return params.then(({ id }) => handleMobileActivity(request, id));
}