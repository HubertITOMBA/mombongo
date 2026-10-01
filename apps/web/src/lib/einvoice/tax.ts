import type { LineTaxCategory } from "@mombongo/contracts";
import { taxCategoryNeedsExemptionReason } from "@mombongo/contracts";

export type En16931VatCategory = "S" | "Z" | "E" | "AE" | "O";

export function en16931Category(taxCategory: string | null | undefined, vatBps: number): En16931VatCategory | null {
  if (taxCategory === "STANDARD" && vatBps > 0) return "S";
  if (taxCategory === "ZERO_RATED" && vatBps === 0) return "Z";
  if (taxCategory === "EXEMPT" && vatBps === 0) return "E";
  if (taxCategory === "REVERSE_CHARGE" && vatBps === 0) return "AE";
  if (taxCategory === "OUT_OF_SCOPE" && vatBps === 0) return "O";
  if (!taxCategory && vatBps > 0) return "S";
  return null;
}

export function exemptionReasonCodeXml(
  taxCategory: string | null | undefined,
  reasonCode: string | null | undefined,
) {
  if (taxCategory === "REVERSE_CHARGE") return "VATEX-EU-AE";
  if (taxCategory === "OUT_OF_SCOPE") return "VATEX-EU-O";
  if (taxCategory === "EXEMPT" && reasonCode === "FRANCE_FRANCHISE") return "VATEX-FR-FRANCHISE";
  return null;
}

export function lineNeedsExemptionReason(taxCategory: string | null | undefined) {
  return taxCategoryNeedsExemptionReason(taxCategory);
}

export function isSupportedTaxCategory(value: string | null | undefined): value is LineTaxCategory {
  return value === "STANDARD"
    || value === "ZERO_RATED"
    || value === "EXEMPT"
    || value === "REVERSE_CHARGE"
    || value === "OUT_OF_SCOPE";
}
