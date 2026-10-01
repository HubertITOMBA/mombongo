import type { AddressPartsSnapshot } from "@/lib/documents/snapshot";
import type { ElectronicAddress } from "./types";

function countryCodeOf(value: unknown) {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

export function parseAddressJson(value: unknown): AddressPartsSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const address = value as Record<string, unknown>;
  if (typeof address.line1 !== "string" || typeof address.postalCode !== "string" || typeof address.city !== "string") return null;
  return {
    type: typeof address.type === "string" ? address.type as AddressPartsSnapshot["type"] : "BILLING",
    label: typeof address.label === "string" ? address.label : "",
    line1: address.line1,
    line2: typeof address.line2 === "string" ? address.line2 : null,
    postalCode: address.postalCode,
    city: address.city,
    countryCode: countryCodeOf(address.countryCode) ?? "",
  };
}

export function toElectronicAddress(json: unknown, fallbackCountry: string | null): ElectronicAddress | null {
  const parts = parseAddressJson(json);
  if (!parts) return null;
  return {
    line1: parts.line1,
    line2: parts.line2,
    postalCode: parts.postalCode,
    city: parts.city,
    countryCode: countryCodeOf(parts.countryCode) || countryCodeOf(fallbackCountry),
  };
}
