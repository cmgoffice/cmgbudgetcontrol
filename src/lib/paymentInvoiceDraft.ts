import { collection, doc, getDocsFromServer, query, runTransaction, where } from "firebase/firestore";
import { isHiddenDuplicateDraft, selectPaymentInvoicePrimary } from "./invoiceDuplicateVisibility";

export const getPaymentInvoiceDraftId = (paymentId: string) => `payment-invoice-${paymentId}`;

/** Shared by both automatic Draft creators. Existing legacy invoices are kept;
 * a stable document id + transaction prevents concurrent new Drafts. */
export const ensurePaymentInvoiceDraft = async (db: any, appId: string, payload: any): Promise<string> => {
  const paymentId = String(payload.paymentId || payload.poId || "");
  if (!paymentId || !payload.projectId) throw new Error("Payment Invoice ไม่มี Payment ID หรือ Project ID");
  const base = ["artifacts", appId, "public", "data"] as const;
  const invoices = collection(db, ...base, "invoices");
  const matches = await Promise.all(["poId", "paymentId"].map((field) => getDocsFromServer(query(
    invoices, where("projectId", "==", payload.projectId), where(field, "==", paymentId),
  ))));
  const existing = Array.from(new Map(matches.flatMap((snapshot) => snapshot.docs)
    .map((snapshot) => [snapshot.id, { ...snapshot.data(), id: snapshot.id }])).values());
  const primary = selectPaymentInvoicePrimary(existing);
  if (primary) return primary.id;
  if (existing.some(isHiddenDuplicateDraft)) throw new Error("พบ Draft ที่ซ่อนไว้ แต่ไม่พบใบหลัก กรุณาให้ผู้ดูแลตรวจสอบก่อนสร้าง Invoice");

  const draftRef = doc(db, ...base, "invoices", getPaymentInvoiceDraftId(paymentId));
  return runTransaction(db, async (transaction) => {
    const draft = await transaction.get(draftRef);
    if (draft.exists() && isHiddenDuplicateDraft(draft.data())) throw new Error("Draft นี้ถูกซ่อนไว้ กรุณาตรวจใบหลักก่อนสร้าง Invoice");
    if (!draft.exists()) transaction.set(draftRef, payload);
    return draftRef.id;
  });
};
