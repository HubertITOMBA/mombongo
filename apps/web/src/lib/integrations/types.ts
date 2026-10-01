export const connectorFamilies = ["ELECTRONIC_INVOICING", "PAYMENT"] as const;
export type ConnectorFamily = (typeof connectorFamilies)[number];

export const connectorAvailabilities = ["available", "coming_soon"] as const;
export type ConnectorAvailability = (typeof connectorAvailabilities)[number];

export const electronicCapabilityKeys = [
  "OUTBOUND_INVOICE",
  "OUTBOUND_CREDIT_NOTE",
  "E_REPORTING",
  "PAYMENT_REPORTING",
  "INBOUND_INVOICE",
  "DIRECTORY_LOOKUP",
  "WEBHOOKS",
] as const;
export type ElectronicCapabilityKey = (typeof electronicCapabilityKeys)[number];

export const paymentCapabilityKeys = [
  "CARD_PAYMENT",
  "PAYPAL_PAYMENT",
  "DIRECT_DEBIT",
  "REFUND",
  "WEBHOOKS",
] as const;
export type PaymentCapabilityKey = (typeof paymentCapabilityKeys)[number];

export type ConnectorCapabilityKey = ElectronicCapabilityKey | PaymentCapabilityKey;

export type ConnectorCapability = {
  supportedByProvider: boolean;
  implementedByMombongo: boolean;
};

export type ConnectorConfigField = {
  name: string;
  label: string;
  required: boolean;
  maxLength?: number;
  placeholder?: string;
};

export type ConnectorDescriptor = {
  key: string;
  family: ConnectorFamily;
  displayName: string;
  description: string;
  availability: ConnectorAvailability;
  enabled: boolean;
  environments: readonly string[];
  capabilities: Partial<Record<ConnectorCapabilityKey, ConnectorCapability>>;
  configurationFields: readonly ConnectorConfigField[];
};

export type PublicConnectorView = {
  key: string;
  family: ConnectorFamily;
  displayName: string;
  description: string;
  availability: ConnectorAvailability;
  enabled: boolean;
  environments: readonly string[];
  capabilities: Array<{
    key: ConnectorCapabilityKey;
    supportedByProvider: boolean;
    implementedByMombongo: boolean;
  }>;
  configurationFields: readonly ConnectorConfigField[];
};
