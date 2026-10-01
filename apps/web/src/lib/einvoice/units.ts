import { uneceUnitByLineUnit, unitCodeFromUnit, type LineUnitValue } from "@mombongo/contracts";

/** Correspondances UNECE Rec. 20 explicites. Aucune unité hors table n’est inventée. */
export const uneceUnitCodes = {
  heure: "HUR",
  jour: "DAY",
  kg: "KGM",
  pièce: "H87",
  unité: "C62",
} as const;

export type MappedUnit = keyof typeof uneceUnitCodes;

export function mapUnitCode(unit: string | null | undefined, unitCode?: string | null) {
  const stored = unitCode?.trim().toUpperCase() || null;
  if (stored && /^[A-Z0-9]{2,3}$/.test(stored)) {
    return { code: stored, mapped: true as const, unit: unit?.trim() || stored };
  }
  const key = unit?.trim().toLowerCase() ?? "";
  if (!key) return { code: uneceUnitByLineUnit.unité, mapped: true as const, unit: "unité" };
  const code = unitCodeFromUnit(key);
  if (code) return { code, mapped: true as const, unit: key };
  return { code: null, mapped: false as const, unit: key as LineUnitValue | string };
}
