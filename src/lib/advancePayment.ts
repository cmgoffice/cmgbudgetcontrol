import { getPoAmountExVat } from "./poDiscount";
import { getLatestPaymentForPo, getPaymentAccumulatedNetAmount } from "./poPaymentBalance";

/** Convert baht to satang, rejecting coercible non-money values and unsafe totals. */
export function toSatang(value: unknown): number {
  if (typeof value !== "number" && typeof value !== "string") throw new Error("Invalid amount");
  if (typeof value === "string" && !/^\d+(?:\.\d+)?$/.test(value.trim())) throw new Error("Invalid amount");
  const amount = Number(value);
  const cents = Math.round((amount + Number.EPSILON) * 100);
  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(cents) || amount * 100 > Number.MAX_SAFE_INTEGER) {
    throw new Error("Amount must be finite, nonnegative and within safe satang range");
  }
  return cents;
}

const approvalRoles: Record<string, string> = {
  "Pending PD": "PD", "Pending PCM": "PCM", "Pending GM": "GM", "Pending MD": "MD",
};

export function isAdvancePoEligible(po: any): boolean {
  const poType = String(po?.poType || "").trim().toUpperCase();
  return ["SP", "DL"].includes(poType) &&
    ["Approved", "Approve", "Partial Receive", "Received", "Wait Invoice", "Deposit", "Invcredit", "Inpay", "paid", "Paid"].includes(po?.status) &&
    !/draft|pending|reject|cancel|closed/i.test(String(po?.statusNow || ""));
}

export function approvalNext(status: string, amountSatang: number): string {
  if (!Number.isSafeInteger(amountSatang) || amountSatang < 0) throw new Error("Invalid amountSatang");
  switch (status) {
    case "Pending PD": return "Pending PCM";
    case "Pending PCM": return "Pending GM";
    case "Pending GM": return amountSatang > 10000000 ? "Pending MD" : "Approved";
    case "Pending MD": return "Approved";
    default: throw new Error("Advance is not pending approval");
  }
}

export function canApproveAdvance(status: string, roles: readonly string[] = []): boolean {
  return Object.prototype.hasOwnProperty.call(approvalRoles, status) && Array.isArray(roles) &&
    (roles.includes("Administrator") || roles.includes(approvalRoles[status]));
}

/** Remaining PO value in baht. Unsubmitted Drafts do not consume the snapshot. */
export function getAdvancePoBalance(po: any, payments: any[] = []): number {
  const submitted = payments.filter(payment => payment?.status !== "Draft");
  return Math.max(0, Math.round((getPoAmountExVat(po) -
    getPaymentAccumulatedNetAmount(getLatestPaymentForPo(po, submitted))) * 100) / 100);
}
