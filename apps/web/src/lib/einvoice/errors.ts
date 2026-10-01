import { AuthFlowError } from "@/lib/auth/rate-limit";
import type { ElectronicIssue } from "./types";

export class ElectronicInvoiceError extends AuthFlowError {
  constructor(public issues: ElectronicIssue[]) {
    super(issues.find(issue => issue.severity === "error")?.message ?? "Facture électronique invalide.", 422);
  }
}

export function issue(code: string, field: string, message: string, severity: ElectronicIssue["severity"] = "error"): ElectronicIssue {
  return { code, field, message, severity };
}
