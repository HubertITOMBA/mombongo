import { quantityToMilli } from "@/lib/documents/money";

export function centsToXmlAmount(cents: number) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(cents));
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function milliToXmlQuantity(milli: number) {
  const sign = milli < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(milli));
  const fraction = String(abs % 1000).padStart(3, "0").replace(/0+$/, "");
  return `${sign}${Math.trunc(abs / 1000)}${fraction ? `.${fraction}` : ""}`;
}

export function quantityXml(value: { toString(): string } | number | string) {
  return milliToXmlQuantity(quantityToMilli(value));
}

export function netUnitPriceCents(unitPriceCents: number, discountBps: number) {
  if (!discountBps) return unitPriceCents;
  const netBps = BigInt(10_000 - discountBps);
  return Number((BigInt(unitPriceCents) * netBps + BigInt(5_000)) / BigInt(10_000));
}

export function bpsToXmlPercent(bps: number) {
  const whole = Math.trunc(bps / 100);
  const fraction = Math.abs(bps % 100);
  return `${whole}.${String(fraction).padStart(2, "0")}`;
}

export function xmlCalendarDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = parts.find(part => part.type === "year")?.value;
  const month = parts.find(part => part.type === "month")?.value;
  const day = parts.find(part => part.type === "day")?.value;
  return `${year}${month}${day}`;
}
