export function facturXFilename(kind: "INVOICE" | "CREDIT_NOTE", number: string | null) {
  const prefix = kind === "INVOICE" ? "facture" : "avoir";
  const safe = (number ?? "document").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `${prefix}-${safe || "document"}-factur-x.pdf`;
}
