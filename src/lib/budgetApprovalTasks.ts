import { PO_REVISION_PENDING_GM, PO_REVISION_PENDING_PCM, PR_PENDING_ACTIVE } from "./constants";
import { canActivatePR } from "./prAllocation";

const PR_APPROVAL_ROLES: Record<string, string> = {
  "Pending CM": "CM",
  "Pending PM": "PM",
  "Pending GM": "GM",
  "Pending MD": "MD",
  [PR_PENDING_ACTIVE]: "PCM",
};

const PO_APPROVAL_ROLES: Record<string, string> = {
  "Pending PCM": "PCM",
  "Pending GM": "GM",
  [PO_REVISION_PENDING_PCM]: "PCM",
  [PO_REVISION_PENDING_GM]: "GM",
};

// Count only tasks supported by the Budget approval table. Closing documents
// and editing budgets are handled in their respective PR/PO menus.
export function isBudgetPrApprovalTask(pr: any, roles: string[], pos: any[]): boolean {
  const approverRole = PR_APPROVAL_ROLES[pr?.status];
  if (!approverRole || (!roles.includes("Administrator") && !roles.includes(approverRole))) return false;
  return pr.status !== PR_PENDING_ACTIVE || canActivatePR(pr, pos);
}

export function isBudgetPoApprovalTask(po: any, roles: string[]): boolean {
  const approverRole = PO_APPROVAL_ROLES[po?.status];
  return Boolean(approverRole && (roles.includes("Administrator") || roles.includes(approverRole)));
}
