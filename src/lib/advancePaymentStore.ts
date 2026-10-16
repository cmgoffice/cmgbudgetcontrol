import { collection, doc, runTransaction, serverTimestamp, Timestamp } from "firebase/firestore";
import { approvalNext, canApproveAdvance, getAdvancePoBalance, isAdvancePoEligible, toSatang } from "./advancePayment";

const text = (value: any): string => typeof value === "string" ? value.trim() : "";
const required = (value: any, label: string): string => {
  const result = text(value);
  if (!result) throw new Error(`${label} is required`);
  return result;
};
const vendor = (po: any) => ({
  id: text(po?.vendorId) || text(po?.supplierId),
  name: text(po?.vendorName) || text(po?.supplierName) || text(po?.vendor),
});
const actor = (user: any) => ({
  uid: required(user?.uid, "User uid"),
  name: text(user?.displayName) || text(user?.name) || text(user?.email) || text(user?.uid),
});
const records = (db: any, appId: string, name: string) => collection(db, "artifacts", required(appId, "App id"), "public", "data", name);

/** form.amount/workUnclaimedAmount are baht. Returns the new Advance ID. */
export async function createAdvance({ db, appId, po, form, payments = [], user }: any): Promise<string> {
  const by = actor(user);
  const poId = required(po?.id, "PO id");
  const projectId = required(po?.projectId, "Project id");
  const expectedVendor = vendor(po);
  required(expectedVendor.id, "Vendor id");
  const amountSatang = toSatang(form?.amount);
  if (amountSatang <= 0) throw new Error("Advance amount must be positive");
  const workUnclaimedAmount = toSatang(form?.workUnclaimedAmount) / 100;
  const recoveryTerms = required(form?.recoveryTerms, "Recovery terms");
  const reason = required(form?.reason, "Reason");
  const advanceRef = doc(records(db, appId, "advances"));
  const auditRef = doc(records(db, appId, "advanceTransactions"));
  const poRef = doc(records(db, appId, "pos"), poId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(poRef);
    if (!snapshot.exists()) throw new Error("PO not found");
    const current = snapshot.data();
    if (!isAdvancePoEligible(current)) throw new Error("PO is no longer eligible for an Advance");
    const currentVendor = vendor(current);
    if (current.projectId !== projectId || (form.projectId != null && form.projectId !== projectId)) throw new Error("PO project changed or does not match");
    if (currentVendor.id !== expectedVendor.id || currentVendor.name !== expectedVendor.name ||
      (form.vendorId != null && form.vendorId !== currentVendor.id)) throw new Error("PO vendor changed or does not match");
    const vendorName = required(currentVendor.name, "Vendor name");
    const poNo = required(current.poNo, "PO number");
    // Concrete Timestamp is required inside arrays: serverTimestamp cannot be nested in history[].
    const event = { id: auditRef.id, action: "create", fromStatus: "", toStatus: "Pending PD", byUid: by.uid, byName: by.name, note: "", at: Timestamp.now() };
    transaction.set(advanceRef, {
      status: "Pending PD", amountSatang, paidSatang: 0, recoveredSatang: 0,
      projectId, poId, poNo, vendorId: currentVendor.id, vendorName,
      workUnclaimedAmount, balanceSnapshot: getAdvancePoBalance({ ...current, id: poId }, payments),
      recoveryTerms, reason, createdByUid: by.uid, createdByName: by.name,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(), history: [event],
    });
    transaction.set(auditRef, { ...event, advanceId: advanceRef.id, projectId, poId, amountSatang, createdAt: serverTimestamp() });
  });
  return advanceRef.id;
}

/** Uses persisted status and amount; audit documents are only ever created, never updated. */
export async function advanceAction({ db, appId, id, action, roles = [], user, note, paidDate, paymentReference }: {
  db: any; appId: string; id: string; action: "approve" | "reject" | "pay";
  roles: string[]; user: any; note?: string; paidDate?: string; paymentReference?: string;
}): Promise<string> {
  const by = actor(user);
  const advanceRef = doc(records(db, appId, "advances"), required(id, "Advance id"));
  const auditRef = doc(records(db, appId, "advanceTransactions"));
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(advanceRef);
    if (!snapshot.exists()) throw new Error("Advance not found");
    const advance = snapshot.data();
    if (!Number.isSafeInteger(advance.amountSatang) || advance.amountSatang <= 0) throw new Error("Invalid stored amount");
    let status: string;
    const changes: Record<string, any> = {};
    if (action === "pay") {
      const profileSnapshot = await transaction.get(doc(records(db, appId, "users"), by.uid));
      const permissionsSnapshot = await transaction.get(doc(records(db, appId, "settings"), "functionPermissions"));
      if (!profileSnapshot.exists()) throw new Error("User profile not found");
      const profile = profileSnapshot.data();
      const currentRoles = [profile.role, ...(Array.isArray(profile.roles) ? profile.roles : [])];
      const configured = permissionsSnapshot.exists()
        ? permissionsSnapshot.data()?.["advance-payment"]?.confirmPay : undefined;
      const allowed = configured === undefined ? ["Administrator"] : configured;
      if (!currentRoles.includes("Administrator") &&
        (!Array.isArray(allowed) || !currentRoles.some(role => allowed.includes(role)))) {
        throw new Error("Not authorized to confirm Advance payment");
      }
      if (advance.status !== "Approved" || advance.paidSatang !== 0 || advance.recoveredSatang !== 0) throw new Error("Advance is not eligible for payment");
      const date = required(paidDate, "Paid date");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error("Invalid paid date");
      Object.assign(changes, { paidSatang: advance.amountSatang, paidDate: date, paymentReference: required(paymentReference, "Payment reference"), paidByUid: by.uid, paidByName: by.name, paidAt: serverTimestamp() });
      status = "Paid";
    } else if (action === "approve" || action === "reject") {
      if (!canApproveAdvance(advance.status, roles)) throw new Error("Not authorized for this approval stage");
      status = action === "approve" ? approvalNext(advance.status, advance.amountSatang) : "Rejected";
      if (action === "reject") changes.rejectionReason = required(note, "Rejection reason");
    } else throw new Error("Invalid advance action");
    const event = {
      id: auditRef.id, action, fromStatus: advance.status, toStatus: status,
      byUid: by.uid, byName: by.name, note: text(note), at: Timestamp.now(),
      ...(action === "pay" ? { amountSatang: advance.amountSatang, paidDate: changes.paidDate, paymentReference: changes.paymentReference } : {}),
    };
    if (!Array.isArray(advance.history)) throw new Error("Invalid advance history");
    transaction.update(advanceRef, { ...changes, status, updatedAt: serverTimestamp(), history: [...advance.history, event] });
    transaction.set(auditRef, { ...event, advanceId: id, projectId: advance.projectId, poId: advance.poId, amountSatang: advance.amountSatang, createdAt: serverTimestamp() });
  });
  return id;
}
