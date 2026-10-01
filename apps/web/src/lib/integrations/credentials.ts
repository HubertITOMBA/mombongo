import { randomUUID } from "node:crypto";
import { AuthFlowError } from "@/lib/auth/rate-limit";
import type { ConnectorFamily } from "./types";

const secretFieldNames = [
  "apikey",
  "api_key",
  "clientsecret",
  "client_secret",
  "webhooksecret",
  "webhook_secret",
  "password",
  "privatekey",
  "private_key",
  "authorization",
  "token",
  "secret",
];

export function assertNoSecretFields(body: Record<string, unknown>) {
  for (const key of Object.keys(body)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (secretFieldNames.some(name => normalized === name.replace(/_/g, "") || normalized.includes("secret") || normalized.includes("password") || normalized.includes("privatekey"))) {
      throw new AuthFlowError("Les secrets fournisseurs ne sont pas acceptés dans cette configuration.", 400);
    }
  }
}

export function issueCredentialRef(organizationId: string, family: ConnectorFamily, connectorKey: string) {
  return `mombongo:${family}:${connectorKey}:${organizationId}:${randomUUID()}`;
}

export function redactCredentialRef(value: string | null | undefined) {
  return value ? "configured" : null;
}
