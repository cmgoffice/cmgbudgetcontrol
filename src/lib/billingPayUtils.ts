export const isPaidStatus = (value: any) => String(value || "").trim().toLowerCase() === "paid";

export const isSpentInvoiceStatus = (value: any) => {
  const status = String(value || "").trim().toLowerCase();
  return status === "paid" || status === "invcredit";
};

export const isSpentInvoiceRecord = (invoice: any) =>
  isSpentInvoiceStatus(invoice?.status) || isSpentInvoiceStatus(invoice?.statusNow);

export const getInvoiceAmount = (invoice: any) =>
  Number(invoice?.amount) ||
  (Number(invoice?.invoiceQty || 0) * Number(invoice?.price || 0)) ||
  0;

/**
 * BudgetView's PO Total is based on item subtotal after the PO discount.
 * Keep invoice-entry validation on the same basis so a discount cannot make
 * an otherwise valid invoice look like it exceeds the PO.
 */
export const getPoGrossAmount = (po: any) => {
  const items = Array.isArray(po?.items) ? po.items : [];
  const itemSubtotal = items.reduce(
    (sum: number, item: any) =>
      sum + (Number(item?.amount) || (Number(item?.quantity || 0) * Number(item?.price || 0))),
    0
  );

  return itemSubtotal > 0
    ? itemSubtotal
    : Number(po?.amount || po?.grandTotal || po?.totalAmount || 0) || 0;
};

export const getPoInvoiceLimit = (po: any) => {
  const itemSubtotal = getPoGrossAmount(po);

  if (itemSubtotal > 0) {
    return Math.max(0, itemSubtotal - Number(po?.discount || 0));
  }

  return Number(po?.amount || po?.grandTotal || po?.totalAmount || 0) || 0;
};

/**
 * Invoice records store line-price totals before the PO-level discount.
 * Budget/Spent reports use the PO net basis, so apply that discount
 * proportionally to each invoice amount without changing the source record.
 */
export const getInvoiceAmountForPo = (invoice: any, po: any) => {
  const invoiceAmount = getInvoiceAmount(invoice);
  const grossAmount = getPoGrossAmount(po);
  const netAmount = getPoInvoiceLimit(po);

  if (grossAmount <= 0 || netAmount >= grossAmount) return invoiceAmount;
  return invoiceAmount * (netAmount / grossAmount);
};

const sameText = (left: any, right: any) =>
  String(left || "").trim() !== "" && String(left || "") === String(right || "");

export const getSpentInvoiceAmountForPo = (
  invoices: any[] = [],
  po: any,
  excludedInvoiceId: any = ""
) => {
  if (!po) return 0;

  return invoices.reduce((sum: number, invoice: any) => {
    if (!invoice || !isSpentInvoiceRecord(invoice)) return sum;
    if (excludedInvoiceId && sameText(invoice.id, excludedInvoiceId)) return sum;

    const belongsToPo =
      sameText(invoice.poId, po.id) ||
      (!invoice.poId && (sameText(invoice.poRef, po.poNo) || sameText(invoice.poNo, po.poNo)));

    return belongsToPo ? sum + getInvoiceAmountForPo(invoice, po) : sum;
  }, 0);
};

export const validateInvoiceAmountForPo = ({
  invoices = [],
  po,
  candidateAmount = 0,
  candidateStatus = "",
  excludedInvoiceId = "",
  tolerance = 0.01,
}: any) => {
  const poLimit = getPoInvoiceLimit(po);
  const existingSpent = getSpentInvoiceAmountForPo(invoices, po, excludedInvoiceId);
  const candidateSpent = isSpentInvoiceStatus(candidateStatus)
    ? getInvoiceAmountForPo({ amount: candidateAmount }, po)
    : 0;
  const projectedSpent = existingSpent + candidateSpent;
  const excessAmount = Math.max(0, projectedSpent - poLimit);

  return {
    ok: excessAmount <= tolerance,
    poLimit,
    existingSpent,
    candidateSpent,
    projectedSpent,
    excessAmount,
  };
};

export const isPaidInvoiceRecord = (invoice: any) => {
  if (isPaidStatus(invoice?.status) || isPaidStatus(invoice?.statusNow)) return true;
  const paymentType = String(invoice?.paymentType || "").trim();
  if (["เงินสด", "โอน", "เช็ค"].includes(paymentType)) return true;
  return false;
};

export const normalizeIdList = (ids: any) =>
  Array.isArray(ids) ? ids.map(String) : typeof ids === "string" ? ids.split(",").map((s) => s.trim()) : [];

export const getProjectPayHistoryTotal = (projectId: string, invoices: any[], payments: any[], pos: any[]) => {
  if (!projectId) return 0;

  const projectPoNos = new Set(
    pos.filter((po: any) => po.projectId === projectId).map((po: any) => po.poNo).filter(Boolean)
  );

  const paidInvoiceHistoryRows = invoices
    .filter((invoice: any) => {
      const invoiceProjectId =
        invoice?.projectId ||
        pos.find((po: any) => String(po.id) === String(invoice?.poId || ""))?.projectId ||
        "";
      
      const belongsToProject = 
        invoiceProjectId === projectId || 
        projectPoNos.has(invoice?.poRef) || 
        projectPoNos.has(invoice?.poNo);

      return belongsToProject && isSpentInvoiceRecord(invoice);
    })
    .map((invoice: any) => ({
      invoiceId: invoice.id,
      amount: getInvoiceAmountForPo(
        invoice,
        pos.find((po: any) =>
          String(po.id) === String(invoice?.poId || "") ||
          String(po.poNo || "") === String(invoice?.poRef || invoice?.poNo || "")
        )
      ),
    }));

  const totalPaidInvoices = paidInvoiceHistoryRows.reduce((sum, row) => sum + row.amount, 0);
  return totalPaidInvoices;
};
