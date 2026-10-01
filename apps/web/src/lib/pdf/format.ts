import { documentKindLabels, vatRates } from "@mombongo/contracts";

export function documentPdfFilename(kind: "QUOTE" | "INVOICE" | "CREDIT_NOTE", number: string | null, draft: boolean) {
  const prefix = kind === "QUOTE" ? "devis" : kind === "INVOICE" ? "facture" : "avoir";
  const token = !draft && number ? number : "brouillon";
  const safe = token.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `${prefix}-${safe || "document"}.pdf`;
}

export function documentKindTitle(kind: "QUOTE" | "INVOICE" | "CREDIT_NOTE") {
  return documentKindLabels[kind].toUpperCase();
}

export function formatVatRate(bps: number) {
  return vatRates.find(rate => rate.bps === bps)?.label ?? formatBpsPercent(bps);
}

export function formatBpsPercent(bps: number) {
  if (!Number.isFinite(bps) || bps === 0) return "0 %";
  const whole = Math.trunc(bps / 100);
  const fraction = Math.abs(bps % 100);
  if (fraction === 0) return `${whole} %`;
  return `${whole},${String(fraction).padStart(2, "0").replace(/0+$/, "")} %`;
}

export function formatDiscount(discountBps: number) {
  if (!discountBps) return "—";
  return formatBpsPercent(discountBps);
}
