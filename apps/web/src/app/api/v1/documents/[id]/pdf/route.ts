import { requireApiMembership } from "@/lib/auth/access";
import { authErrorResponse } from "@/lib/auth/http";
import { handleDocumentPdf } from "@/lib/pdf/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { organization } = await requireApiMembership();
    const { id } = await params;
    return handleDocumentPdf(organization.id, id);
  } catch (error) {
    return authErrorResponse(error);
  }
}
