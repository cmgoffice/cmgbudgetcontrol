import { collection, doc, getDocsFromServer, query, runTransaction, where } from "firebase/firestore";

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
  const existing = matches.flatMap((snapshot) => snapshot.docs)
    .sort((a, b) => String(a.data().createdAt || "").localeCompare(String(b.data().createdAt || "")) || a.id.localeCompare(b.id));
  if (existing.length > 0) return existing[0].id;

  const draftRef = doc(db, ...base, "invoices", getPaymentInvoiceDraftId(paymentId));
  return runTransaction(db, async (transaction) => {
    const draft = await transaction.get(draftRef);
    if (!draft.exists()) transaction.set(draftRef, payload);
    return draftRef.id;
  });
};
