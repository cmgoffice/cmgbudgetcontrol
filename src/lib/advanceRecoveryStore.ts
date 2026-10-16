import { collection, doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { toSatang } from "./advancePayment";

export const canChangeAdvanceRecovery = (type: string, record: any, reversing = false) => {
  if (!record || record.inheritedAdvanceRecovery || record.sourceType === "payment" || record.isDeposit || record.depositSettled) return false;
  if (record.billingNo || record.payNo || record.invoiceId) return false;
  if (type === "invoices") return record.status === "Draft" || (reversing && record.status === "Invcredit");
  return type === "payments" && (record.status === "Active" || (reversing &&
    ["งวดงาน Pending CM", "งวดงาน Pending PM", "Reject", "Rejected", "Hold", "Wait Pay"].includes(record.status)));
};

/** The original work amount and tax/discount bases are never modified here. */
export const validateAdvanceRecovery = (type: string, record: any, advance: any, amountSatang: number, previousSatang: number) => {
  if (!Number.isSafeInteger(amountSatang) || amountSatang < 0 || !Number.isSafeInteger(previousSatang) || previousSatang < 0) throw new Error("ยอดหัก Advance ไม่ถูกต้อง");
  if (!canChangeAdvanceRecovery(type, record, amountSatang === 0)) throw new Error("เอกสารนี้ไม่อยู่ในสถานะที่แก้ไขรายการหัก Advance ได้");
  if (advance.status !== "Paid") throw new Error("Advance ต้องยืนยันจ่ายแล้วก่อนหักคืน");
  const linkedPoIds = type === "payments"
    ? [record.poId, record.sourcePoId, ...(record.selectedPrIds || []), ...(record.items || []).map((item: any) => item.poId || item.prId)]
    : [record.poId];
  const vendorId = record.vendorId || record.contractorId;
  if (record.projectId !== advance.projectId || !vendorId || vendorId !== advance.vendorId || !linkedPoIds.includes(advance.poId)) throw new Error("Advance ต้องตรงกับโครงการ PO และผู้รับเหมา/ผู้จำหน่ายของเอกสาร");
  if (amountSatang > toSatang(record.amount || 0)) throw new Error("ยอดหัก Advance มากกว่ายอดเอกสาร");
  const nextRecovered = advance.recoveredSatang - previousSatang + amountSatang;
  if (!Number.isSafeInteger(nextRecovered) || nextRecovered < 0 || nextRecovered > advance.paidSatang) throw new Error("ยอด Advance คงเหลือไม่เพียงพอ กรุณาตรวจสอบรายการล่าสุด");
  return nextRecovered;
};

export const saveAdvanceRecovery = async ({ db, appId, documentType, documentId, advanceId, amount, user }: any) => {
  if (!["payments", "invoices"].includes(documentType) || !documentId || !advanceId || !user?.uid) throw new Error("ข้อมูลรายการหัก Advance ไม่ครบ");
  const amountSatang = toSatang(amount);
  const base = ["artifacts", appId, "public", "data"] as const;
  const sourceRef = doc(db, ...base, documentType, documentId);
  const advanceRef = doc(db, ...base, "advances", advanceId);
  const ledgerRef = doc(db, ...base, "advanceRecoveries", `${documentType}-${documentId}`);
  const auditRef = doc(collection(db, ...base, "advanceTransactions"));
  return runTransaction(db, async (tx) => {
    const source = await tx.get(sourceRef);
    const advance = await tx.get(advanceRef);
    const ledger = await tx.get(ledgerRef);
    if (!source.exists() || !advance.exists()) throw new Error("ไม่พบเอกสารหรือ Advance");
    const record: any = source.data();
    if (documentType === "payments") {
      const invoice = await tx.get(doc(db, ...base, "invoices", `payment-invoice-${documentId}`));
      if (invoice.exists()) throw new Error("Payment นี้มี Invoice แล้ว กรุณาย้อนขั้นตอน Invoice ก่อนแก้รายการหัก");
    }
    const previous: any = ledger.exists() ? ledger.data() : null;
    const previousSatang = previous?.amountSatang || 0;
    if (previousSatang > 0 && previous.advanceId !== advanceId) throw new Error("กรุณาย้อนรายการหักเดิมก่อนเปลี่ยน Advance");
    const marker = record.advanceRecovery;
    if ((marker?.amountSatang || 0) !== previousSatang || (previousSatang > 0 && marker?.advanceId !== previous?.advanceId)) throw new Error("รายการหัก Advance ไม่ตรงกับประวัติ กรุณาติดต่อผู้ดูแล");
    const data: any = advance.data();
    const recoveredSatang = validateAdvanceRecovery(documentType, record, data, amountSatang, previousSatang);
    if (previousSatang === amountSatang) return false;
    tx.set(ledgerRef, {
      advanceId, amountSatang, projectId: data.projectId, poId: data.poId,
      documentType, documentId, lastTransactionId: auditRef.id, updatedAt: serverTimestamp(), updatedByUid: user.uid,
    });
    tx.update(sourceRef, {
      advanceRecovery: amountSatang > 0 ? { advanceId, amountSatang } : null,
      updatedAt: new Date().toISOString(),
    });
    tx.update(advanceRef, { recoveredSatang, lastRecoveryId: ledgerRef.id, updatedAt: serverTimestamp() });
    tx.set(auditRef, {
      advanceId, projectId: data.projectId, poId: data.poId,
      type: amountSatang > previousSatang ? "recovery" : "reversal",
      amountSatang: Math.abs(amountSatang - previousSatang), documentType, documentId,
      recoveryId: ledgerRef.id, createdAt: serverTimestamp(), createdByUid: user.uid,
    });
    return true;
  });
};
