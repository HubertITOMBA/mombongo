import { NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/auth/http";
import { documentPdfResponse } from "@/lib/pdf/http";
import { ElectronicInvoiceError } from "./errors";
import { buildOrganizationFacturX } from "./service";

export function electronicInvoiceErrorResponse(error: unknown) {
  if (error instanceof ElectronicInvoiceError) {
    return NextResponse.json({ error: error.message, issues: error.issues }, { status: 422 });
  }
  return authErrorResponse(error);
}

export async function handleDocumentFacturX(organizationId: string, documentId: string) {
  try {
    const artifact = await buildOrganizationFacturX(organizationId, documentId);
    return documentPdfResponse(artifact.bytes, artifact.filename);
  } catch (error) {
    return electronicInvoiceErrorResponse(error);
  }
}
