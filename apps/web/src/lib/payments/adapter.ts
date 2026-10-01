export type PaymentProviderAdapter = {
  readonly connectorKey: string;
  testConnection(connectionId: string): Promise<{ ok: boolean; message: string }>;
};
