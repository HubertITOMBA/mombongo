import { AuthFlowError } from "@/lib/auth/rate-limit";
import type { ElectronicInvoicingProvider } from "@/generated/prisma/client";
import { requireAvailableConnector } from "@/lib/integrations/registry";
import type { EInvoiceProviderAdapter } from "./adapter";

const adapters = new Map<ElectronicInvoicingProvider, EInvoiceProviderAdapter>();

export function registerEInvoiceAdapter(adapter: EInvoiceProviderAdapter) {
  adapters.set(adapter.provider, adapter);
}

export function parseElectronicProvider(value: string): ElectronicInvoicingProvider | null {
  return value === "MOCK" ? "MOCK" : null;
}

export function getEInvoiceAdapter(provider: ElectronicInvoicingProvider): EInvoiceProviderAdapter {
  const adapter = adapters.get(provider);
  if (!adapter) throw new AuthFlowError("Ce fournisseur de facturation électronique n’est pas disponible.", 500);
  return adapter;
}

export function getEInvoiceAdapterForKey(connectorKey: string): EInvoiceProviderAdapter {
  requireAvailableConnector(connectorKey, "ELECTRONIC_INVOICING");
  const provider = parseElectronicProvider(connectorKey);
  if (!provider) throw new AuthFlowError("Ce connecteur n’est pas reconnu par Mombongo.", 400);
  return getEInvoiceAdapter(provider);
}
