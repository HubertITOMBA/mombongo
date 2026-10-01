import { AuthFlowError } from "@/lib/auth/rate-limit";
import type {
  ConnectorCapabilityKey,
  ConnectorDescriptor,
  ConnectorFamily,
  PublicConnectorView,
} from "./types";

const mockElectronic: ConnectorDescriptor = {
  key: "MOCK",
  family: "ELECTRONIC_INVOICING",
  displayName: "Connecteur interne de test",
  description: "Simule une transmission électronique en local. Ce n’est pas une plateforme agréée.",
  availability: "available",
  enabled: true,
  environments: ["TEST"],
  configurationFields: [
    {
      name: "externalAccountId",
      label: "Identifiant de compte de test",
      required: false,
      maxLength: 120,
      placeholder: "Compte MOCK, pas un secret fournisseur",
    },
  ],
  capabilities: {
    OUTBOUND_INVOICE: { supportedByProvider: true, implementedByMombongo: true },
    OUTBOUND_CREDIT_NOTE: { supportedByProvider: true, implementedByMombongo: true },
    E_REPORTING: { supportedByProvider: true, implementedByMombongo: true },
    PAYMENT_REPORTING: { supportedByProvider: true, implementedByMombongo: true },
    INBOUND_INVOICE: { supportedByProvider: true, implementedByMombongo: true },
    DIRECTORY_LOOKUP: { supportedByProvider: false, implementedByMombongo: false },
    WEBHOOKS: { supportedByProvider: true, implementedByMombongo: true },
  },
};

const stripePayment: ConnectorDescriptor = {
  key: "STRIPE",
  family: "PAYMENT",
  displayName: "Stripe",
  description: "Cartes et encaissements en ligne. Non branché dans Mombongo.",
  availability: "coming_soon",
  enabled: false,
  environments: ["SANDBOX", "PRODUCTION"],
  configurationFields: [],
  capabilities: {
    CARD_PAYMENT: { supportedByProvider: true, implementedByMombongo: false },
    DIRECT_DEBIT: { supportedByProvider: true, implementedByMombongo: false },
    REFUND: { supportedByProvider: true, implementedByMombongo: false },
    WEBHOOKS: { supportedByProvider: true, implementedByMombongo: false },
  },
};

const paypalPayment: ConnectorDescriptor = {
  key: "PAYPAL",
  family: "PAYMENT",
  displayName: "PayPal",
  description: "Paiement PayPal. Non branché dans Mombongo.",
  availability: "coming_soon",
  enabled: false,
  environments: ["SANDBOX", "PRODUCTION"],
  configurationFields: [],
  capabilities: {
    PAYPAL_PAYMENT: { supportedByProvider: true, implementedByMombongo: false },
    REFUND: { supportedByProvider: true, implementedByMombongo: false },
    WEBHOOKS: { supportedByProvider: true, implementedByMombongo: false },
  },
};

const descriptors: readonly ConnectorDescriptor[] = [mockElectronic, stripePayment, paypalPayment];

const byKey = new Map(descriptors.map(item => [item.key, item]));

function assertUniqueKeys() {
  if (byKey.size !== descriptors.length) throw new Error("Les connecteurs du registre doivent avoir une clé unique.");
}

assertUniqueKeys();

export function listConnectorDescriptors(family?: ConnectorFamily) {
  return family ? descriptors.filter(item => item.family === family) : [...descriptors];
}

export function getConnectorDescriptor(key: string): ConnectorDescriptor | null {
  return byKey.get(key) ?? null;
}

export function requireConnectorDescriptor(key: string, family?: ConnectorFamily): ConnectorDescriptor {
  const descriptor = getConnectorDescriptor(key);
  if (!descriptor || (family && descriptor.family !== family)) {
    throw new AuthFlowError("Ce connecteur n’est pas reconnu par Mombongo.", 400);
  }
  return descriptor;
}

export function requireAvailableConnector(key: string, family: ConnectorFamily): ConnectorDescriptor {
  const descriptor = requireConnectorDescriptor(key, family);
  if (!descriptor.enabled || descriptor.availability !== "available") {
    throw new AuthFlowError("Ce connecteur n’est pas encore disponible dans Mombongo.", 409);
  }
  return descriptor;
}

export function assertEnvironmentAllowed(descriptor: ConnectorDescriptor, environment: string) {
  if (!descriptor.environments.includes(environment)) {
    throw new AuthFlowError("Cet environnement n’est pas disponible pour ce connecteur.", 422);
  }
}

export function isCapabilityImplemented(key: string, capability: ConnectorCapabilityKey) {
  const descriptor = getConnectorDescriptor(key);
  return descriptor?.capabilities[capability]?.implementedByMombongo === true;
}

export function assertCapabilityImplemented(key: string, capability: ConnectorCapabilityKey) {
  if (!isCapabilityImplemented(key, capability)) {
    throw new AuthFlowError("Cette opération n’est pas disponible dans Mombongo pour ce connecteur.", 409);
  }
}

export function publicConnectorView(descriptor: ConnectorDescriptor): PublicConnectorView {
  return {
    key: descriptor.key,
    family: descriptor.family,
    displayName: descriptor.displayName,
    description: descriptor.description,
    availability: descriptor.availability,
    enabled: descriptor.enabled,
    environments: descriptor.environments,
    configurationFields: descriptor.configurationFields,
    capabilities: Object.entries(descriptor.capabilities).map(([key, value]) => ({
      key: key as ConnectorCapabilityKey,
      supportedByProvider: value.supportedByProvider,
      implementedByMombongo: value.implementedByMombongo,
    })),
  };
}

export const electronicOperationCapabilities = {
  SUBMIT_INVOICE: "OUTBOUND_INVOICE",
  SUBMIT_CREDIT_NOTE: "OUTBOUND_CREDIT_NOTE",
  SUBMIT_E_REPORTING: "E_REPORTING",
  PREPARE_PAYMENT_REPORTING: "PAYMENT_REPORTING",
  RECEIVE_INVOICE: "INBOUND_INVOICE",
} as const;
