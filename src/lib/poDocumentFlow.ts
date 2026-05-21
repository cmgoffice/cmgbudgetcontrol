// @ts-nocheck

import { generateReceiveNo, getPrNoFromPo, isPayBeforeReceiveType, isReceiveAutoType } from "./receiveAuto";

export function hasConfiguredPayBeforeReceive(po) {
  return Boolean(
    po?.payBeforeReceiveChecked &&
    po?.payBeforeReceiveInvoiceSetup &&
    Array.isArray(po?.payBeforeReceiveInvoiceSetup?.items) &&
    po.payBeforeReceiveInvoiceSetup.items.length > 0
  );
}

export function hasConfiguredReceiveAfterPayment(po) {
  return Boolean(
    hasConfiguredPayBeforeReceive(po) &&
    po?.receivedAfterPaymentChecked &&
    po?.receivedAfterPaymentSetup &&
    Array.isArray(po?.receivedAfterPaymentSetup?.items) &&
    po.receivedAfterPaymentSetup.items.length > 0
  );
}

export function getPoFinalApprovalStatus(po) {
  if (hasConfiguredReceiveAfterPayment(po)) return "Paid";
  if (hasConfiguredPayBeforeReceive(po)) return "Approved";
  if (isReceiveAutoType(po?.receiveType)) return "Received";
  if (isPayBeforeReceiveType(po?.receiveType)) return "Wait Invoice";
  return "Approved";
}

export function syncInvoiceSetupItems(items = [], setupItems = []) {
  return (items || []).map((item, idx) => {
    const existing = (setupItems || []).find((entry) => Number(entry?.poItemIndex) === idx) || {};
    const quantity = Number(item?.quantity || 0);
    const price = Number(item?.price || 0);
    const invoiceQtyRaw = Number(existing?.invoiceQty);
    const invoiceQty =
      Number.isFinite(invoiceQtyRaw) && invoiceQtyRaw >= 0
        ? Math.min(invoiceQtyRaw, quantity)
        : quantity;
    return {
      poItemIndex: idx,
      materialNo: item?.materialNo || "",
      description: item?.description || "",
      unit: item?.unit || "",
      quantity,
      price,
      invoiceQty,
      amount: Number(item?.amount) || (invoiceQty * price),
    };
  });
}

export function syncReceiveSetupItems(items = [], setupItems = []) {
  return (items || []).map((item, idx) => {
    const existing = (setupItems || []).find((entry) => Number(entry?.poItemIndex) === idx) || {};
    const orderedQty = Number(item?.quantity || 0);
    const receivedQtyRaw = Number(existing?.receivedQty);
    const receivedQty = Number.isFinite(receivedQtyRaw) && receivedQtyRaw > 0 ? receivedQtyRaw : orderedQty;
    const price = Number(item?.price || 0);
    return {
      poItemIndex: idx,
      materialNo: item?.materialNo || "",
      description: item?.description || "",
      unit: item?.unit || "",
      orderedQty,
      price,
      amount: Number(item?.amount) || (receivedQty * price),
      receivedQty,
    };
  });
}

export function getInvoiceStatusByPaymentType(paymentType = "เครดิต") {
  return String(paymentType || "").trim() === "เครดิต" ? "Invcredit" : "paid";
}

export function buildConfiguredInvoiceData({
  po,
  setup,
  vendors = [],
  userData = null,
  now = new Date(),
}) {
  if (!po || !setup) return null;

  const vendor = vendors.find((entry) => entry.id === po.vendorId);
  const vendorName = vendor?.name || po.vendorName || "";
  const selectedItems = (setup.items || []).map((item) => {
    const qty = Number(item?.invoiceQty || 0);
    const price = Number(item?.price || 0);
    return {
      poItemIndex: Number(item?.poItemIndex || 0),
      materialNo: item?.materialNo || "",
      description: item?.description || "",
      unit: item?.unit || "",
      quantity: qty,
      price,
      amount: qty * price,
    };
  });
  const calculatedAmount = selectedItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const isDeposit = Boolean(setup?.isDeposit);
  const depositAmount = Number(setup?.depositAmount || 0);
  const amount = isDeposit && depositAmount > 0 ? depositAmount : calculatedAmount;
  const description = selectedItems[0]?.description || po?.description || "-";

  return {
    invNo: String(setup.invNo || "").trim(),
    invDate: setup.invDate || now.toISOString().split("T")[0],
    paymentType: setup.paymentType || "เครดิต",
    bankAccountNo: setup.paymentType === "โอน" ? String(setup.bankAccountNo || "").trim() : "",
    poId: po.id,
    poNo: po.poNo,
    poRef: po.poNo,
    vendorId: po.vendorId,
    vendorName,
    items: selectedItems,
    amount,
    description,
    projectId: po.projectId,
    status: getInvoiceStatusByPaymentType(setup.paymentType),
    isDeposit,
    depositAmount: isDeposit ? depositAmount : 0,
    createdBy: `${userData?.firstName || ""} ${userData?.lastName || ""}`.trim() || userData?.name || "System",
    createdAt: now.toISOString(),
    autoCreatedFromPoApproval: true,
    invoiceMode: "pay_before_receive",
  };
}

export function buildConfiguredReceiveData({
  po,
  setup,
  prs = [],
  vendors = [],
  receives = [],
  project = null,
  user = null,
  userData = null,
  now = new Date(),
}) {
  if (!po || !setup) return null;

  const receiveNo = generateReceiveNo({
    project,
    projectId: po.projectId,
    receives,
    now,
  });
  const resolvedPrNo = getPrNoFromPo(po, prs);
  const resolvedProjectCode =
    po.projectItemCode || (resolvedPrNo ? resolvedPrNo.split(",")[0].trim().substring(0, 3) : "");
  const vendor = vendors.find((entry) => entry.id === po.vendorId);
  const vendorName =
    String(setup.vendorName || "").trim() ||
    vendor?.name ||
    po.vendorName ||
    "";
  const receivedByName = `${userData?.firstName || ""} ${userData?.lastName || ""}`.trim() || userData?.name || "System";

  return {
    receiveNo,
    receiveData: {
      receiveNo,
      rpNo: receiveNo,
      poId: po.id,
      poNo: po.poNo,
      prNo: resolvedPrNo,
      projectItemCode: resolvedProjectCode,
      vendorName,
      documentNo: String(setup.documentNo || "").trim(),
      projectId: po.projectId,
      items: (setup.items || []).map((item) => ({
        poItemIndex: Number(item?.poItemIndex || 0),
        materialNo: item?.materialNo || "",
        description: item?.description || "",
        unit: item?.unit || "",
        orderedQty: Number(item?.orderedQty || 0),
        price: Number(item?.price || 0),
        amount: Number(item?.receivedQty || 0) * Number(item?.price || 0),
        receivedQty: Number(item?.receivedQty || 0),
        photos: [],
      })),
      receivedDate: setup.receivedDate || now.toISOString().split("T")[0],
      receivedByUid: user?.uid || null,
      receivedByName,
      note: String(setup.note || "").trim(),
      createdAt: now.toISOString(),
      autoCreatedFromPoApproval: true,
      autoCreatedFromPayBeforeReceiveFlow: true,
    },
  };
}
