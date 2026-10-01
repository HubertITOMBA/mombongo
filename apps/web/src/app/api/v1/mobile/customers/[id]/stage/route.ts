import type { NextRequest } from "next/server";
import { handleMobileStage } from "@/lib/auth/mobile-http";
export const runtime = "nodejs";
export function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return params.then(({ id }) => handleMobileStage(request, id));
}
