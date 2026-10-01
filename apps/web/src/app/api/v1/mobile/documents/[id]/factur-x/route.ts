import type { NextRequest } from "next/server";
import { allowMobileRequest, authErrorResponse } from "@/lib/auth/http";
import { requireMobileOrganization } from "@/lib/auth/mobile";
import { ORGANIZATION_HEADER } from "@/lib/auth/organization";
import { handleDocumentFacturX } from "@/lib/einvoice/http";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!allowMobileRequest(request)) return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });
  try {
    const { organization } = await requireMobileOrganization(request.headers.get("authorization"), request.headers.get(ORGANIZATION_HEADER));
    const { id } = await params;
    return handleDocumentFacturX(organization.id, id);
  } catch (error) {
    return authErrorResponse(error);
  }
}
