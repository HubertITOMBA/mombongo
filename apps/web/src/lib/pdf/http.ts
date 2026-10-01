import { NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/auth/http";
import { buildOrganizationDocumentPdf } from "./service";

export function documentPdfResponse(pdf: Buffer, filename: string) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function handleDocumentPdf(organizationId: string, documentId: string) {
  try {
    const { model, pdf } = await buildOrganizationDocumentPdf(organizationId, documentId);
    return documentPdfResponse(pdf, model.filename);
  } catch (error) {
    return authErrorResponse(error);
  }
}
