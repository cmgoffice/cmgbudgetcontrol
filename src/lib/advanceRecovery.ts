export type AdvanceRecovery = { advanceId: string; amountSatang: number };

export const hasOwnAdvanceRecovery = (record: any): boolean => record?.advanceRecovery != null;

export const invoiceRecoveryAmountsUnchanged = (record: any, selectedItems: any[], amount: number): boolean => {
  const savedItems = record?.items || [];
  return Number.isFinite(amount) && Math.round(amount * 100) === Math.round(Number(record?.amount) * 100)
    && selectedItems.length === savedItems.length && selectedItems.every((item, index) => {
      const saved = savedItems[index];
      return Number(item.invoiceQty) === Number(saved.quantity ?? saved.invoiceQty)
        && Number(item.price || 0) === Number(saved.price || 0)
        && ["description", "materialNo", "unit"].every((key) => String(item[key] || "") === String(saved[key] || ""));
    });
};

export const recoverySatang = (recovery: any): number => {
  if (recovery == null) return 0;
  if (!recovery.advanceId || !Number.isSafeInteger(recovery.amountSatang) || recovery.amountSatang <= 0) {
    throw new Error("Invalid Advance recovery metadata");
  }
  return recovery.amountSatang;
};

export const inheritedRecoveryFromPayment = (payment: any) => {
  if (!hasOwnAdvanceRecovery(payment)) return null;
  recoverySatang(payment.advanceRecovery);
  if (!payment.id) throw new Error("Missing Payment ID for Advance recovery");
  return { paymentId: payment.id, advanceId: payment.advanceRecovery.advanceId, amountSatang: payment.advanceRecovery.amountSatang };
};

/** Deduplicate invoice selections and inherited allocations by their ledger owner. */
export const sumInvoiceAdvanceRecovery = (invoices: any[]): number => {
  const allocations = new Map<string, { advanceId: string; amount: number }>();
  for (const invoice of invoices) {
    for (const [key, recovery] of [
      [`invoices:${invoice.id}`, invoice.advanceRecovery],
      [`payments:${invoice.inheritedAdvanceRecovery?.paymentId}`, invoice.inheritedAdvanceRecovery],
    ] as [string, any][]) {
      if (recovery == null) continue;
      if (!invoice.id || (recovery === invoice.inheritedAdvanceRecovery && !recovery.paymentId)) throw new Error("Missing Advance recovery owner");
      const amount = recoverySatang(recovery);
      const previous = allocations.get(key);
      if (previous && (previous.amount !== amount || previous.advanceId !== recovery.advanceId)) throw new Error("Conflicting Advance recovery snapshots");
      allocations.set(key, { advanceId: recovery.advanceId, amount });
    }
  }
  const total = Array.from(allocations.values()).reduce((sum, allocation) => sum + allocation.amount, 0);
  if (!Number.isSafeInteger(total)) throw new Error("Advance recovery total exceeds safe integer range");
  return total / 100;
};

/** Preserve legacy arithmetic exactly when no Advance is selected. Values here are baht. */
export const deductAdvanceRecovery = (existingNet: number, recoveryAmount: number): number => {
  if (recoveryAmount === 0) return existingNet;
  const netSatang = Math.round(existingNet * 100);
  const deductionSatang = Math.round(recoveryAmount * 100);
  if (!Number.isSafeInteger(netSatang) || !Number.isSafeInteger(deductionSatang) || deductionSatang < 0 || deductionSatang > netSatang) {
    throw new Error("ยอดหัก Advance มากกว่ายอดสุทธิ กรุณาย้อนรายการหักก่อน");
  }
  return (netSatang - deductionSatang) / 100;
};

/** Old Billings can have dangling Invoice links. Only recovery-bearing snapshots require completeness. */
export const sumBillingAdvanceRecovery = (billings: any[], invoices: any[]): number => {
  const selected = new Map<string, any>();
  for (const billing of billings) {
    const ids = Array.isArray(billing.invoiceIds) ? billing.invoiceIds.map(String)
      : typeof billing.invoiceIds === "string" ? billing.invoiceIds.split(",").map((id: string) => id.trim()).filter(Boolean) : [];
    const linked = ids.map((id: string) => invoices.find((invoice) => String(invoice.id) === id));
    if (Number(billing.advanceRecoveryAmount) > 0 && (!ids.length || linked.some((invoice: any) => !invoice))) {
      throw new Error("กรุณารอข้อมูล Invoice ให้ครบก่อนคำนวณ Advance");
    }
    const present = linked.filter(Boolean);
    if (Number(billing.advanceRecoveryAmount) > 0 && Math.round(sumInvoiceAdvanceRecovery(present) * 100) !== Math.round(Number(billing.advanceRecoveryAmount) * 100)) {
      throw new Error("ยอด Advance ใน Billing ไม่ตรงกับ Invoice กรุณาตรวจสอบก่อนจ่าย");
    }
    present.forEach((invoice: any) => selected.set(String(invoice.id), invoice));
  }
  return sumInvoiceAdvanceRecovery(Array.from(selected.values()));
};
