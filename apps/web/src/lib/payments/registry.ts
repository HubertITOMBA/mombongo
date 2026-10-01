import { AuthFlowError } from "@/lib/auth/rate-limit";
import { requireConnectorDescriptor } from "@/lib/integrations/registry";
import type { PaymentProviderAdapter } from "./adapter";

const adapters = new Map<string, PaymentProviderAdapter>();

export function registerPaymentAdapter(adapter: PaymentProviderAdapter) {
  adapters.set(adapter.connectorKey, adapter);
}

export function getPaymentAdapter(connectorKey: string): PaymentProviderAdapter {
  requireConnectorDescriptor(connectorKey, "PAYMENT");
  const adapter = adapters.get(connectorKey);
  if (!adapter) throw new AuthFlowError("Ce connecteur de paiement n’est pas encore disponible dans Mombongo.", 409);
  return adapter;
}
