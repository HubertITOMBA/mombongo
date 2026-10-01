export type VatBreakdownRate = {
  vatBps: number;
  htCents: number;
  vatCents: number;
};

export type LineAmountInput = {
  quantity: number;
  unitPriceCents: number;
  vatBps: number;
  discountBps?: number;
};

function roundHalfUp(numerator: bigint, divisor: bigint) {
  if (divisor <= BigInt(0)) throw new Error("Diviseur invalide.");
  return (numerator + divisor / BigInt(2)) / divisor;
}

export function quantityToMilli(quantity: number | { toString(): string }) {
  return Math.round(Number(quantity) * 1000);
}

export function lineAmounts(input: LineAmountInput) {
  const discountBps = input.discountBps ?? 0;
  const milli = BigInt(quantityToMilli(input.quantity));
  const netBps = BigInt(10_000 - discountBps);
  const htCents = Number(roundHalfUp(milli * BigInt(input.unitPriceCents) * netBps, BigInt(10_000_000)));
  const vatCents = Number(roundHalfUp(BigInt(htCents) * BigInt(input.vatBps), BigInt(10_000)));
  return { htCents, vatCents, ttcCents: htCents + vatCents };
}

export function sumLineTotals(lines: { htCents: number; vatCents: number; ttcCents: number }[]) {
  return lines.reduce(
    (sum, line) => ({
      htCents: sum.htCents + line.htCents,
      vatCents: sum.vatCents + line.vatCents,
      ttcCents: sum.ttcCents + line.ttcCents,
    }),
    { htCents: 0, vatCents: 0, ttcCents: 0 },
  );
}

export function vatBreakdown(lines: { vatBps: number; htCents: number; vatCents: number }[]): VatBreakdownRate[] {
  const grouped = new Map<number, VatBreakdownRate>();
  for (const line of lines) {
    const current = grouped.get(line.vatBps) ?? { vatBps: line.vatBps, htCents: 0, vatCents: 0 };
    current.htCents += line.htCents;
    current.vatCents += line.vatCents;
    grouped.set(line.vatBps, current);
  }
  return [...grouped.values()].sort((left, right) => left.vatBps - right.vatBps);
}

export function addCalendarDays(from: Date, days: number) {
  const next = new Date(from.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function quantityNumber(value: { toString(): string } | number | string) {
  return Number(value);
}

export function formatQuantity(value: { toString(): string } | number | string) {
  const raw = typeof value === "number" ? value.toFixed(3) : String(value).trim().replace(",", ".");
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return String(value);
  const [whole, fraction = ""] = Math.abs(numeric).toFixed(3).split(".");
  const trimmed = fraction.replace(/0+$/, "");
  const formatted = trimmed ? `${whole},${trimmed}` : whole;
  return numeric < 0 ? `-${formatted}` : formatted;
}
