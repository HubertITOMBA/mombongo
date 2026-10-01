import { NextResponse } from "next/server";
import { handleElectronicInvoicingWebhook } from "@/lib/einvoice-platform/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  return handleElectronicInvoicingWebhook(provider, request);
}

export function GET() {
  return NextResponse.json({ error: "Méthode non autorisée." }, { status: 405 });
}
