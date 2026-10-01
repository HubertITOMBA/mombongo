import { AuthFlowError } from "@/lib/auth/rate-limit";

export type PaymentCreateInput = {
  organizationId: string;
  invoiceId: string;
  amountCents: number;
  currency: string;
  connectorKey: string;
};

export type PaymentGateway = {
  createPayment(input: PaymentCreateInput): Promise<never>;
  getPaymentStatus(input: { organizationId: string; connectorKey: string; providerPaymentId: string }): Promise<never>;
  refund(input: { organizationId: string; connectorKey: string; providerPaymentId: string }): Promise<never>;
};

const unavailable = () => new AuthFlowError("Aucun prestataire de paiement n’est branché. Les encaissements restent manuels (A10).", 501);

export const paymentGateway: PaymentGateway = {
  async createPayment() {
    throw unavailable();
  },
  async getPaymentStatus() {
    throw unavailable();
  },
  async refund() {
    throw unavailable();
  },
};
