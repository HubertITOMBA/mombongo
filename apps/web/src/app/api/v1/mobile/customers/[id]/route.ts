import type { NextRequest } from "next/server";
import { handleMobileCustomer } from "@/lib/auth/mobile-http";
export const runtime = "nodejs";
export function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return params.then(({ id }) => handleMobileCustomer(request, id));
}
