import { assertMaterialManualReceive, buildMaterialPoSnapshot, buildReceiveQueueResetPatch, canReceiveAfterMaterial, getMaterialApproveRefs, isMaterialPending, isMaterialPoFormRequired, validateMaterialCertificate } from "./materialReceive";
import { buildAutoReceiveData } from "./receiveAuto";
import { buildConfiguredInvoiceData, buildConfiguredReceiveData, getPoFinalApprovalStatus, hasConfiguredReceiveAfterPayment } from "./poDocumentFlow";
import { isPoReadyForManualReceive } from "./constants";
import { getPoAmountExVat } from "./poDiscount";
import { getPoNetPrAllocations } from "./prBudgetReturn";
import { getBudgetPrTotal } from "./budgetPrUsage";

const items = [{ prId: "pr-1", poItemIndex: 0, materialNo: "MAT-1", description: "Steel", unit: "kg", quantity: 10, price: 100, amount: 1000, receivedQty: 10, invoiceQty: 10 }];
const original = { id: "po-1", poNo: "PO-001", projectId: "project-1", poType: "CR", status: "Approved", receiveType: "Material", selectedPrIds: ["pr-1"], items, discount: 100, vatType: "ex-vat", grandTotal: 963 };
const material = { ...original, materialReceiveRequired: true };
const passed = { ...material, materialReceive: { status: "passed", certificates: [], note: "ตรวจแล้ว" } };
const pr = { id: "pr-1", prNo: "PR-001", projectId: "project-1", budgetId: "budget-1", materialApprove: true, materialApproveNo: "MA-123", items, totalAmount: 1000 };
const setup = { items, invNo: "INV-1", paymentType: "เครดิต" };
const configured = { ...original, payBeforeReceiveChecked: true, payBeforeReceiveInvoiceSetup: setup, receivedAfterPaymentChecked: true, receivedAfterPaymentSetup: setup };

describe("Delete from the pending Receive queue", () => {
  test.each([undefined, false, true])("Material returns to inspection regardless of the old PR flag (%s)", (required) => {
    const po = { ...passed, materialReceiveRequired: required, materialReceive: { status: "passed", certificates: [{ name: "certificate.pdf" }], note: "keep" } };
    const before = JSON.stringify(po);
    const patch = buildReceiveQueueResetPatch(po);
    expect(patch).toEqual({ status: "Approved", statusNow: "Approved", materialReceiveRequired: true, "materialReceive.status": "pending" });
    // Firestore dotted updates preserve the rest of the inspection and all business fields.
    const next = { ...po, status: patch.status, statusNow: patch.statusNow, materialReceiveRequired: patch.materialReceiveRequired,
      materialReceive: { ...po.materialReceive, status: patch["materialReceive.status"] } };
    expect(isMaterialPending(next)).toBe(true);
    expect(canReceiveAfterMaterial(next)).toBe(false);
    expect(next.materialReceive.certificates).toBe(po.materialReceive.certificates);
    expect(next.materialReceive.note).toBe("keep");
    expect(next.items).toBe(po.items);
    expect(getPoAmountExVat(next)).toBe(getPoAmountExVat(po));
    expect(getPoNetPrAllocations(next)).toEqual(getPoNetPrAllocations(po));
    expect(JSON.stringify(po)).toBe(before);
  });
  test.each(["EQM", "Service", "Subcontractor", "Pay before receive", "Receive Auto", "RE", "Material Approve", "", undefined])("keeps %s on its existing reset behaviour even if PR Material is checked", (receiveType) => {
    expect(buildReceiveQueueResetPatch({ ...passed, receiveType })).toEqual({ status: "Approved", statusNow: "Approved" });
  });
});

describe("Material routing without changing existing receive/payment behaviour", () => {
  test.each(["Approved", "Approve", "Partial Receive", "Wait Invoice", "Deposit", "Invcredit", "Inpay", "paid"])("keeps unpaid/paid PO %s visible for inspection", (status) => {
    const po = { ...material, status, statusNow: status };
    expect(isMaterialPending(po)).toBe(true);
    expect(canReceiveAfterMaterial(po)).toBe(false);
    expect(isMaterialPending({ ...po, materialReceive: passed.materialReceive })).toBe(false);
  });
  test.each(["Draft", "Rejected", "Pending PCM", "Pending GM", "PO Edit Pending PCM", "PO Edit Pending GM", "Pending Close PO", "Closed PO", "Cancelled"])("blocks %s even with a stale financial status", (status) => {
    expect(isMaterialPending({ ...material, status, statusNow: "paid" })).toBe(false);
  });
  test("does not place ordinary/legacy POs in Material", () => {
    expect(isMaterialPending(original)).toBe(false);
    expect(canReceiveAfterMaterial(original)).toBe(true);
    expect(buildMaterialPoSnapshot(original, [pr], original)).toEqual({});
  });
  test("payment alone does not pass Material; passing Material does not bypass payment readiness", () => {
    expect(() => assertMaterialManualReceive({ ...material, receiveType: "Pay before receive", status: "paid" })).toThrow("Material Received");
    expect(() => assertMaterialManualReceive({ ...passed, receiveType: "Pay before receive", status: "Wait Invoice" })).toThrow("ยังไม่พร้อม");
    expect(() => assertMaterialManualReceive({ ...passed, receiveType: "Pay before receive", status: "paid" })).not.toThrow();
    expect(() => assertMaterialManualReceive(passed)).not.toThrow();
    expect(isPoReadyForManualReceive({ ...passed, status: "Partial Receive" })).toBe(true);
  });
  test.each(["autoCreatedFromPoApproval", "autoCreatedFromPayDocument", "autoCreatedFromPayBeforeReceiveFlow"])("blocks %s even after inspection", (flag) => {
    expect(() => assertMaterialManualReceive(passed, { [flag]: true })).toThrow("บันทึกจำนวนรับเอง");
  });
  test("snapshot covers mixed PRs and multiple POs without mutating source data", () => {
    const mixed = { ...original, selectedPrIds: ["pr-1", "pr-2"] };
    const before = JSON.stringify(mixed);
    const snapshot = buildMaterialPoSnapshot(mixed, [pr, { id: "pr-2" }]);
    expect(snapshot).toEqual({ materialReceiveRequired: true, materialApproveRefs: [{ prId: "pr-1", prNo: "PR-001", no: "MA-123" }] });
    expect(buildMaterialPoSnapshot({ ...mixed, id: "po-2" }, [pr])).toEqual(snapshot);
    expect(JSON.stringify(mixed)).toBe(before);
    expect(getMaterialApproveRefs({ items: [{ disPrAllocations: [{ prId: "pr-1" }] }] }, [pr])).toHaveLength(1);
  });
  test("freezes source decision and number when PR is changed after submission", () => {
    const previous = { ...material, materialSnapshotLocked: true, materialApproveRefs: [{ prId: pr.id, no: "MA-OLD" }] };
    expect(buildMaterialPoSnapshot(original, [{ ...pr, materialApproveNo: "NEW" }], previous).materialApproveRefs[0].no).toBe("MA-OLD");
    expect(buildMaterialPoSnapshot(original, [pr], { ...original, materialReceiveRequired: false, materialSnapshotLocked: true }).materialReceiveRequired).toBe(false);
    expect(() => buildMaterialPoSnapshot({ ...original, selectedPrIds: ["pr-2"], items: [] }, [pr], previous)).toThrow("เปลี่ยน PR");
    expect(() => buildMaterialPoSnapshot({ ...original, items: [{ ...items[0], quantity: 11 }] }, [pr], passed)).toThrow("ผ่าน Material");
    expect(buildMaterialPoSnapshot({ ...original, discount: 150, reason: "Updated" }, [pr], passed).materialReceiveRequired).toBe(true);
  });
  test.each(["SP", "DC"])("rejects unsupported %s without changing subcontract flows", (poType) => {
    expect(() => buildMaterialPoSnapshot({ ...original, poType }, [pr])).toThrow("SP/DC");
    expect(isMaterialPending({ ...material, poType })).toBe(false);
  });
  test("requires an approval number", () => {
    expect(() => buildMaterialPoSnapshot(original, [{ ...pr, materialApproveNo: "  " }])).toThrow("No.");
  });
  test("drafts can change PRs before submission; locked decisions also govern the PO controls", () => {
    const changed = { ...original, selectedPrIds: ["pr-2"], items: [] };
    expect(buildMaterialPoSnapshot(changed, [pr], { ...material, status: "Draft" }).materialReceiveRequired).toBe(false);
    expect(buildMaterialPoSnapshot({ ...changed, poType: "SP" }, [pr], { ...material, status: "Draft" }).materialReceiveRequired).toBe(false);
    expect(isMaterialPoFormRequired(original, [pr], { ...original, materialReceiveRequired: false, materialSnapshotLocked: true })).toBe(false);
    expect(isMaterialPoFormRequired(original, [], { ...material, materialSnapshotLocked: true })).toBe(true);
    expect(() => assertMaterialManualReceive({ ...passed, status: "Closed PO", statusNow: "Approved" })).toThrow("ยังไม่พร้อม");
  });
});

describe("Auto Receive exclusions and financial regression", () => {
  test.each([false, true])("never creates auto receipts for Material, passed=%s", (isPassed) => {
    const po = { ...configured, ...(isPassed ? passed : material), receiveType: "Receive Auto" };
    expect(buildAutoReceiveData({ po })).toBeNull();
    expect(buildConfiguredReceiveData({ po, setup })).toBeNull();
    expect(hasConfiguredReceiveAfterPayment(po)).toBe(false);
    expect(getPoFinalApprovalStatus(po)).toBe("Approved");
  });
  test("ordinary PO auto receipts and approval statuses remain intact", () => {
    expect(getPoFinalApprovalStatus(original)).toBe("Approved");
    expect(getPoFinalApprovalStatus({ ...original, receiveType: "Pay before receive" })).toBe("Wait Invoice");
    expect(getPoFinalApprovalStatus({ ...original, receiveType: "Receive Auto" })).toBe("Received");
    expect(getPoFinalApprovalStatus(configured)).toBe("Paid");
    expect(buildAutoReceiveData({ po: original }).receiveData.items[0]).toMatchObject({ receivedQty: 10, amount: 1000 });
    expect(buildConfiguredReceiveData({ po: configured, setup }).receiveData.items[0]).toMatchObject({ receivedQty: 10, amount: 1000 });
  });
  test.each([false, true])("Invoice, discount, net PR allocations and budget totals are identical, deposit=%s", (isDeposit) => {
    const invoiceSetup = { ...setup, isDeposit, depositAmount: 250 };
    const now = new Date("2026-10-15T03:00:00Z");
    const before = JSON.stringify({ original, pr, items });
    expect(buildConfiguredInvoiceData({ po: material, setup: invoiceSetup, now })).toEqual(buildConfiguredInvoiceData({ po: original, setup: invoiceSetup, now }));
    expect(buildConfiguredInvoiceData({ po: passed, setup: invoiceSetup, now })).toEqual(buildConfiguredInvoiceData({ po: original, setup: invoiceSetup, now }));
    expect(getPoAmountExVat(passed)).toBe(getPoAmountExVat(original));
    expect(getPoNetPrAllocations(passed)).toEqual(getPoNetPrAllocations(original));
    const args = { budget: { id: "budget-1", projectId: "project-1" }, projectId: "project-1" };
    expect(getBudgetPrTotal({ ...args, prs: [pr] })).toBe(getBudgetPrTotal({ ...args, prs: [{ ...pr, materialApprove: false, materialApproveNo: "" }] }));
    expect(JSON.stringify({ original, pr, items })).toBe(before);
  });
});

test("Certificate validation accepts allowed documents and rejects empty, oversized and executable files", () => {
  expect(() => validateMaterialCertificate({ name: "certificate.pdf", type: "application/pdf", size: 100 })).not.toThrow();
  expect(() => validateMaterialCertificate({ name: "certificate.jpg", type: "image/jpeg", size: 100 })).not.toThrow();
  expect(() => validateMaterialCertificate({ name: "certificate.pdf", type: "application/pdf", size: 0 })).toThrow();
  expect(() => validateMaterialCertificate({ name: "certificate.pdf", type: "application/pdf", size: 21 * 1024 * 1024 })).toThrow();
  expect(() => validateMaterialCertificate({ name: "certificate.exe", type: "application/pdf", size: 100 })).toThrow();
});
