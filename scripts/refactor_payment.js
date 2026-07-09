// @ts-nocheck
// Script: Refactor PaymentView — New Auto-display SP/DC PO flow
const fs = require('fs');
const path = 'src/views/PaymentView.tsx';
let code = fs.readFileSync(path, 'utf8');
let changed = 0;

// ─── 1. ลบปุ่ม "สร้าง Payment" ─────────────────────────────────────────────
const createBtnOld = `        <div className="flex items-center gap-2">
          {canCreatePayment && (
            <Button
              onClick={openCreate}
              className="bg-orange-500 hover:bg-orange-600 text-white shadow-md shadow-orange-100 border-none rounded-xl px-4 py-2 text-sm font-bold flex items-center gap-2 transition-all active:scale-95"
            >
              <Plus size={16} /> สร้าง Payment
            </Button>
          )}
        </div>`;
const createBtnNew = `        <div className="flex items-center gap-2">
          {/* ปุ่ม "สร้าง Payment" ถูกลบออกแล้ว — PO SP/DC ที่ Approved จะแสดง Auto เป็น Draft */}
        </div>`;

if (code.includes(createBtnOld)) { code = code.replace(createBtnOld, createBtnNew); changed++; console.log('✅ 1. ลบปุ่ม "สร้าง Payment"'); }
else console.warn('⚠️  1. ไม่พบปุ่ม "สร้าง Payment"');

// ─── 2. เปลี่ยน empty state message ────────────────────────────────────────
const emptyMsgOld = `                  ยังไม่มีรายการ Payment — กด "สร้าง Payment" เพื่อเริ่มต้น`;
const emptyMsgNew = `                  ยังไม่มีรายการ Payment — PO ประเภท SP/DC ที่ได้รับการอนุมัติจะแสดงที่นี่โดยอัตโนมัติ`;
if (code.includes(emptyMsgOld)) { code = code.replace(emptyMsgOld, emptyMsgNew); changed++; console.log('✅ 2. แก้ empty state message'); }

// ─── 3. เพิ่ม unlinkedSPDCPos + handleActivatePayment หลัง projectPayments ─
const projectPaymentsOld = `  // ─── Filtered payments for current project ───────────────────────────────────
  const projectPayments = useMemo(() => {
    return (payments || []).filter((p: any) => p.projectId === selectedProjectId);
  }, [payments, selectedProjectId]);`;

const projectPaymentsNew = `  // ─── Filtered payments for current project ───────────────────────────────────
  const projectPayments = useMemo(() => {
    return (payments || []).filter((p: any) => p.projectId === selectedProjectId);
  }, [payments, selectedProjectId]);

  // ─── PO SP/DC ที่ Approved แต่ยังไม่ถูก link กับ Payment ใดๆ (Auto Draft) ─
  const linkedPoIds = useMemo(() => {
    const set = new Set<string>();
    (payments || []).forEach((pay: any) => {
      if (pay.projectId !== selectedProjectId) return;
      (pay.selectedPrIds || []).forEach((id: string) => set.add(id));
    });
    return set;
  }, [payments, selectedProjectId]);

  const unlinkedSPDCPos = useMemo(() => {
    return (pos || []).filter((po: any) =>
      po.projectId === selectedProjectId &&
      (po.poType === 'SP' || po.poType === 'DC') &&
      po.status === 'Approved' &&
      !linkedPoIds.has(po.id)
    );
  }, [pos, selectedProjectId, linkedPoIds]);

  // ─── Permission: PM/PCM/Admin สามารถ Activate Payment ได้ ─────────────────
  const canActivatePayment =
    myRoles.includes('Administrator') ||
    myRoles.some((r) => ['PM', 'PCM'].includes(r)) ||
    canUseFunction?.('payment-subcontract', 'activate') !== false;

  // ─── Activate: สร้าง Payment document จาก PO ──────────────────────────────
  const handleActivatePayment = async (po: any) => {
    if (!canActivatePayment) {
      showAlert('ไม่มีสิทธิ์', 'เฉพาะ PM หรือ Administrator เท่านั้นที่สามารถ Activate Payment ได้', 'warning');
      return;
    }
    setActioning(true);
    try {
      const vendor = vendors.find((v: any) => v.id === po.vendorId);
      const items = (po.items || []).map((item: any, idx: number) => ({
        prId: po.id,
        prItemIndex: idx,
        description: item.description || '',
        unit: item.unit || '',
        contractQty: Number(item.quantity) || 0,
        contractPrice: Number(item.price) || Number(item.unitPrice) || 0,
        contractAmount: (Number(item.quantity) || 0) * (Number(item.price) || Number(item.unitPrice) || 0),
        thisPeriodQty: 0,
        thisPeriodAmount: 0,
        thisPeriodPct: 0,
        prevAccumQty: 0,
        prevAccumAmount: 0,
        remark: '',
        budgetId: item.budgetId || null,
        budgetSubItemId: item.budgetSubItemId || null,
      }));

      const payload = {
        paymentNo: po.poNo || po.id,
        paymentType: po.poType,
        contractorId: po.vendorId || '',
        contractTitle: po.contractTitle || po.poNo || '',
        periodNo: '1',
        openDate: new Date().toISOString().split('T')[0],
        billingCycle: '',
        note: '',
        selectedPrIds: [po.id],
        items,
        amount: 0,
        projectId: selectedProjectId,
        status: 'Active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: userData?.name || user?.email || '',
        activatedBy: userData?.name || user?.email || '',
        activatedAt: new Date().toISOString(),
        rejectReason: null,
        rejectedBy: null,
        rejectedAt: null,
      };

      await addData('payments', payload, null, { skipLog: true });
      await logAction(
        'Activate Payment',
        \`PM เปิด Active Payment จาก PO \${po.poNo} (\${po.poType})\`,
        selectedProjectId
      );
      showAlert('สำเร็จ', \`เปิด Payment จาก PO \${po.poNo} เป็น Active แล้ว — สามารถเริ่มใส่ปริมาณงวดได้\`, 'success');
    } catch (e) {
      showAlert('เกิดข้อผิดพลาด', String(e), 'error');
    } finally {
      setActioning(false);
    }
  };`;

if (code.includes(projectPaymentsOld)) { code = code.replace(projectPaymentsOld, projectPaymentsNew); changed++; console.log('✅ 3. เพิ่ม unlinkedSPDCPos + handleActivatePayment'); }
else console.warn('⚠️  3. ไม่พบ projectPayments block');

// ─── 4. เพิ่ม Draft rows ในตาราง (หลัง tbody opening ก่อน projectPayments) ─
const tbodyOld = `          <tbody className="divide-y divide-slate-100">
            {projectPayments.length === 0 ? (
              <tr>
                <td colSpan={["paymentNo","type","contractor","billingCycle","totalAmount","accumAmount","periodAmount","progress","status","actions"].filter(k => isColumnVisible("payment", k)).length} className="py-10 text-center text-slate-400 text-sm">
                  ยังไม่มีรายการ Payment — PO ประเภท SP/DC ที่ได้รับการอนุมัติจะแสดงที่นี่โดยอัตโนมัติ
                </td>
              </tr>
            ) : (
              projectPayments.map((p: any) => {`;

const tbodyNew = `          <tbody className="divide-y divide-slate-100">
            {/* ── Draft rows: PO SP/DC ที่ Approved แต่ยังไม่ Active ── */}
            {unlinkedSPDCPos.map((po: any) => {
              const vendor = vendors.find((v: any) => v.id === po.vendorId);
              const contractTotal = (po.items || []).reduce(
                (s: number, it: any) => s + ((Number(it.quantity) || 0) * (Number(it.price) || Number(it.unitPrice) || 0)), 0
              );
              const colCount = ["paymentNo","type","contractor","billingCycle","totalAmount","accumAmount","periodAmount","progress","status","actions"].filter(k => isColumnVisible("payment", k)).length;
              return (
                <tr key={\`po-draft-\${po.id}\`} className="bg-slate-50/80 border-b border-slate-200 hover:bg-blue-50/30 transition-colors">
                  {isColumnVisible("payment", "paymentNo") && (
                    <td className="py-2 px-3 font-medium text-blue-700">{po.poNo}</td>
                  )}
                  {isColumnVisible("payment", "type") && (
                    <td className="py-2 px-3 text-center">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200">{po.poType}</span>
                    </td>
                  )}
                  {isColumnVisible("payment", "contractor") && (
                    <td className="py-2 px-3 truncate text-slate-600">{vendor?.name || '-'}</td>
                  )}
                  {isColumnVisible("payment", "billingCycle") && (
                    <td className="py-2 px-3 text-slate-400 italic text-xs">-</td>
                  )}
                  {isColumnVisible("payment", "totalAmount") && (
                    <td className="py-2 px-3 text-right font-semibold text-slate-700">{formatCurrency(contractTotal)}</td>
                  )}
                  {isColumnVisible("payment", "accumAmount") && (
                    <td className="py-2 px-3 text-right text-slate-400">-</td>
                  )}
                  {isColumnVisible("payment", "periodAmount") && (
                    <td className="py-2 px-3 text-right text-slate-400">-</td>
                  )}
                  {isColumnVisible("payment", "progress") && (
                    <td className="py-1 px-2">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 rounded overflow-hidden border border-slate-200 flex bg-slate-100 flex-1 min-w-0">
                          {[10,20,30,40,50,60,70,80,90,100].map((step) => (
                            <div key={step} className="h-full flex-1" style={{ backgroundColor: '#e5e7eb' }} />
                          ))}
                        </div>
                        <span className="text-[10px] text-slate-400">0%</span>
                      </div>
                    </td>
                  )}
                  {isColumnVisible("payment", "status") && (
                    <td className="py-2 px-3 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                        Draft
                      </span>
                      <div className="text-[9px] text-blue-500 mt-0.5">รอ PM Activate</div>
                    </td>
                  )}
                  {isColumnVisible("payment", "actions") && (
                    <td className="py-2 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {canActivatePayment && (
                        <Button
                          variant="success"
                          size="sm"
                          className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                          disabled={actioning}
                          onClick={() => handleActivatePayment(po)}
                        >
                          Active
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {unlinkedSPDCPos.length === 0 && projectPayments.length === 0 ? (
              <tr>
                <td colSpan={["paymentNo","type","contractor","billingCycle","totalAmount","accumAmount","periodAmount","progress","status","actions"].filter(k => isColumnVisible("payment", k)).length} className="py-10 text-center text-slate-400 text-sm">
                  ยังไม่มีรายการ Payment — PO ประเภท SP/DC ที่ได้รับการอนุมัติจะแสดงที่นี่โดยอัตโนมัติ
                </td>
              </tr>
            ) : (
              projectPayments.map((p: any) => {`;

if (code.includes(tbodyOld)) { code = code.replace(tbodyOld, tbodyNew); changed++; console.log('✅ 4. เพิ่ม Draft rows ในตาราง'); }
else console.warn('⚠️  4. ไม่พบ tbody block');

// ─── 5. ลบ Create/Edit Modal (AnimatePresence block 1950-2384) ────────────
const createModalOld = `      {/* ─── Create / Edit Modal ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isModalOpen && (`;
const createModalEnd = `      </AnimatePresence>
    </div>
  );
});`;
const createModalNewLine = `      {/* Create/Edit Modal ถูกลบออกแล้ว — ใช้ handleActivatePayment แทน */}
    </div>
  );
});`;

const startIdx = code.indexOf(createModalOld);
const endIdx = code.indexOf(createModalEnd);
if (startIdx !== -1 && endIdx !== -1) {
  code = code.slice(0, startIdx) + createModalNewLine;
  changed++;
  console.log('✅ 5. ลบ Create/Edit Modal');
} else {
  console.warn('⚠️  5. ไม่พบ Create/Edit Modal block');
}

// ─── 6. ลบปุ่ม Submit Draft→Pending และ EditButton ในตาราง ──────────────
const submitDraftBtn = `                          {/* Draft → Submit */}
                          {(p.status || "Draft") === "Draft" && canSubmitPayment && (
                            <button
                              title="ส่งอนุมัติ"
                              className="p-1 rounded text-orange-500 hover:text-orange-700 hover:bg-orange-50 transition-colors"
                              onClick={() => handleSubmit(p)}
                            >
                              <Send size={13} />
                            </button>
                          )}`;
if (code.includes(submitDraftBtn)) { code = code.replace(submitDraftBtn, `{/* Submit button removed — ใช้ Active flow แทน */}`); changed++; console.log('✅ 6. ลบปุ่ม Submit Draft'); }

// ลบ flow approve buttons (Draft stage pending approvals)
const approveFlowBtn = `                          {/* Pending → Approve/Reject (ยกเว้น Pending Procurement ซึ่งใช้ปุ่ม Active แทน) */}
                          {canApproveFlow && isFlowActive(p.status) && p.status !== "Pending Procurement" && !p.revisionRequested && isPendingForMe(p.status, myRoles) && (
                            <>
                              <Button variant="success" size="sm" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleApprove(p)}>
                                Approve
                              </Button>
                              {canRejectFlow && <Button variant="danger" size="sm" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => { setRejectModalPayment(p); setRejectReason(""); }}>
                                Reject
                              </Button>}
                            </>
                          )}
                          {/* Pending Procurement → Active + Reject */}
                          {canApproveFlow && p.status === "Pending Procurement" && !p.revisionRequested && isPendingForMe(p.status, myRoles) && (
                            <>
                              <Button variant="success" size="sm" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleApprove(p)}>
                                Active
                              </Button>
                              {canRejectFlow && <Button variant="danger" size="sm" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => { setRejectModalPayment(p); setRejectReason(""); }}>
                                Reject
                              </Button>}
                            </>
                          )}`;
if (code.includes(approveFlowBtn)) { code = code.replace(approveFlowBtn, `{/* Approve flow removed — PM กด Active จาก Draft row แทน */}`); changed++; console.log('✅ 7. ลบ Approve flow buttons'); }

// ลบปุ่ม Edit ในตาราง
const editBtnTable = `                          {/* Edit (Draft or Rejected) */}
                          {["Draft", "Rejected"].includes(p.status || "Draft") && canEditPayment && (
                            <button title="แก้ไข" className={\`p-1 rounded transition-colors \${p.status === "Rejected" ? "text-red-500 hover:text-red-700 hover:bg-red-50" : "text-blue-500 hover:text-blue-700 hover:bg-blue-50"}\`} onClick={() => openEdit(p)}>
                              <Edit size={13} />
                            </button>
                          )}`;
if (code.includes(editBtnTable)) { code = code.replace(editBtnTable, `{/* Edit button removed — ไม่ต้องแก้ไข Draft อีกต่อไป */}`); changed++; console.log('✅ 8. ลบปุ่ม Edit ในตาราง'); }

// ─── Save ─────────────────────────────────────────────────────────────────
fs.writeFileSync(path, code);
console.log(\`\nDone! \${changed} changes applied.\`);
