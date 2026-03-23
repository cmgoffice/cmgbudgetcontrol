// @ts-nocheck
import React, { useState, useEffect, useMemo, useCallback, useRef, useContext } from "react";
import {
  Plus, Trash2, Edit, CheckCircle, XCircle, FileInput, DollarSign,
  ChevronDown, ChevronRight, AlertCircle, Save, Calendar, Briefcase,
  FileText, Search, ListFilter, Clock, Package
} from "lucide-react";
import { useAppData } from "../contexts/AppDataContext";
import { useUI } from "../contexts/UIContext";
import { Card, Button, InputGroup, Badge, formatCurrency } from "../components/ui";
import ResizableTh from "../components/ResizableTh";
import ColumnVisibilityToggle from "../components/ColumnVisibilityToggle";
import { useProportionalTableLayout } from "../hooks/useProportionalTableLayout";
import { TABLE_LAYOUT_DEFAULTS } from "../lib/tableLayoutDefaults";
const InvoiceView = React.memo(() => {
  const { invoices, pos, addData, updateData, deleteData, showAlert, userRole, userRoles, columnWidths, handleColumnResize, visibleProjects, canUseFunction, isColumnVisible } = useAppData();
  const { selectedProjectId } = useUI();
  const invoiceTableRef = useRef(null);
  const invoiceTableLayout = useProportionalTableLayout({
    tableId: "invoice",
    defaultWeights: TABLE_LAYOUT_DEFAULTS.invoice,
    savedWidths: columnWidths.invoice,
    containerRef: invoiceTableRef,
    enabled: true,
    driftKey: "description",
    handleColumnResize,
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    invNo: "",
    poRef: "",
    description: "",
    amount: 0,
    receiveDate: "",
  });
  const projectPOs = pos.filter((po) => po.projectId === selectedProjectId);
  const handleAdd = async () => {
    const refPO = pos.find((po) => po.poNo === formData.poRef);
    if (!refPO)
      return showAlert("ไม่พบ PO", "ไม่พบเลขที่ PO ที่ระบุ", "error");

    const existingInvSum = invoices
      .filter((inv) => inv.poRef === formData.poRef)
      .reduce((sum, inv) => sum + Number(inv.amount), 0);
    if (existingInvSum + formData.amount > refPO.amount) {
      return showAlert(
        "ยอดเกิน",
        `ยอด Invoice เกินยอด PO! คงเหลือ: ${formatCurrency(
          refPO.amount - existingInvSum
        )}`,
        "error"
      );
    }

    const success = await addData("invoices", {
      ...formData,
      projectId: selectedProjectId,
      status: "Pending PM",
    });

    if (success) {
      setIsModalOpen(false);
      setFormData({
        invNo: "",
        poRef: "",
        description: "",
        amount: 0,
        receiveDate: "",
      });
      showAlert("สำเร็จ", "บันทึกรับ Invoice เรียบร้อย", "success");
    }
  };
  const handleAction = async (id, action) => {
    const inv = invoices.find((i) => i.id === id);
    if (!inv) return;

    let newStatus = inv.status;
    if (inv.status === "Pending PM" && (userRoles.includes("PM") || userRoles.includes("Administrator")))
      newStatus = "Pending GM";
    if (inv.status === "Pending GM" && (userRoles.includes("GM") || userRoles.includes("Administrator"))) newStatus = "Paid";

    if (newStatus !== inv.status) {
      await updateData("invoices", id, { status: newStatus });
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-slate-800">
            F. รับวางบิล (Invoice Receive)
          </h2>
          <ColumnVisibilityToggle tableId="invoice" />
        </div>
        <div className="flex items-center gap-2">
        {canUseFunction("invoice", "add") && (
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus size={14} /> รับ Invoice
          </Button>
        )}
        </div>
      </div>
      <Card className="overflow-hidden w-full min-w-0">
        <div ref={invoiceTableRef} className="w-full min-w-0">
        <table className="w-full text-left text-xs text-slate-600 table-fixed">
          <thead className="bg-slate-50 text-slate-900 uppercase font-semibold">
            <tr>
              {isColumnVisible("invoice", "invNo") && <ResizableTh tableId="invoice" colKey="invNo" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={invoiceTableLayout.handleResize} currentWidth={invoiceTableLayout.scaled.invNo}>INV No.</ResizableTh>}
              {isColumnVisible("invoice", "poRef") && <ResizableTh tableId="invoice" colKey="poRef" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={invoiceTableLayout.handleResize} currentWidth={invoiceTableLayout.scaled.poRef}>Ref. PO</ResizableTh>}
              {isColumnVisible("invoice", "description") && <ResizableTh tableId="invoice" colKey="description" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={invoiceTableLayout.handleResize} currentWidth={invoiceTableLayout.scaled.description}>รายละเอียด</ResizableTh>}
              {isColumnVisible("invoice", "amount") && <ResizableTh tableId="invoice" colKey="amount" className="py-2 px-3 text-right" isAdmin={userRole==="Administrator"} onResize={invoiceTableLayout.handleResize} currentWidth={invoiceTableLayout.scaled.amount}>จำนวนเงิน</ResizableTh>}
              {isColumnVisible("invoice", "status") && <ResizableTh tableId="invoice" colKey="status" className="py-2 px-3 text-center" isAdmin={userRole==="Administrator"} onResize={invoiceTableLayout.handleResize} currentWidth={invoiceTableLayout.scaled.status}>สถานะ</ResizableTh>}
              {isColumnVisible("invoice", "actions") && <th className="py-2 px-3 text-right" style={{ width: invoiceTableLayout.scaled.actions }}>Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoices
              .filter((inv) => inv.projectId === selectedProjectId)
              .map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  {isColumnVisible("invoice", "invNo") && <td className="py-2 px-3 font-medium" title={inv.invNo}><span className="cell-text">{inv.invNo}</span></td>}
                  {isColumnVisible("invoice", "poRef") && <td className="py-2 px-3 text-blue-600" title={inv.poRef}><span className="cell-text">{inv.poRef}</span></td>}
                  {isColumnVisible("invoice", "description") && <td className="py-2 px-3" title={inv.description}><span className="cell-text">{inv.description}</span></td>}
                  {isColumnVisible("invoice", "amount") && (
                  <td className="py-2 px-3 text-right font-semibold">
                    {formatCurrency(inv.amount)}
                  </td>
                  )}
                  {isColumnVisible("invoice", "status") && (
                  <td className="py-2 px-3 text-center">
                    <Badge status={inv.status} />
                  </td>
                  )}
                  {isColumnVisible("invoice", "actions") && (
                  <td className="py-2 px-3 text-right flex justify-end gap-1">
                    {canUseFunction("invoice", "approve") && (userRoles.includes("PM") || userRoles.includes("Administrator")) && inv.status === "Pending PM" && (
                      <Button
                        variant="success"
                        size="sm"
                        className="px-2 py-0.5 text-[10px]"
                        onClick={() => handleAction(inv.id, "approve")}
                      >
                        PM เห็นชอบ
                      </Button>
                    )}
                    {canUseFunction("invoice", "approve") && (userRoles.includes("GM") || userRoles.includes("Administrator")) && inv.status === "Pending GM" && (
                      <Button
                        variant="success"
                        size="sm"
                        className="px-2 py-0.5 text-[10px]"
                        onClick={() => handleAction(inv.id, "approve")}
                      >
                        GM อนุมัติจ่าย
                      </Button>
                    )}
                    {canUseFunction("invoice", "delete") && (
                      <button
                        className="text-red-500 hover:text-red-700"
                        onClick={() => deleteData("invoices", inv.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                  )}
                </tr>
              ))}
          </tbody>
        </table>
        </div>
      </Card>
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10010] animate-in fade-in duration-200">
          <Card className="w-full max-w-lg p-6">
            <h3 className="text-lg font-bold mb-4">บันทึกรับ Invoice</h3>
            <div className="space-y-4">
              <InputGroup label="Ref. PO No.">
                <select
                  className="w-full border rounded p-2 bg-white text-sm"
                  value={formData.poRef}
                  onChange={(e) =>
                    setFormData({ ...formData, poRef: e.target.value })
                  }
                >
                  <option value="">-- เลือก PO ที่จะวางบิล --</option>
                  {projectPOs.map((po) => (
                    <option key={po.id} value={po.poNo}>
                      {po.poNo} : {po.description} (
                      {formatCurrency(po.amount)})
                    </option>
                  ))}
                </select>
              </InputGroup>
              <InputGroup label="Invoice No.">
                <input
                  type="text"
                  className="w-full border rounded p-2 text-sm"
                  value={formData.invNo}
                  onChange={(e) =>
                    setFormData({ ...formData, invNo: e.target.value })
                  }
                />
              </InputGroup>
              <InputGroup label="รายละเอียด">
                <input
                  type="text"
                  className="w-full border rounded p-2 text-sm"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                />
              </InputGroup>
              <InputGroup label="จำนวนเงินตาม Invoice">
                <input
                  type="number"
                  className="w-full border rounded p-2 text-sm"
                  value={formData.amount}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      amount: Number(e.target.value),
                    })
                  }
                />
              </InputGroup>
              <InputGroup label="วันที่นัดรับเงิน">
                <input
                  type="date"
                  className="w-full border rounded p-2 text-sm"
                  value={formData.receiveDate}
                  onChange={(e) =>
                    setFormData({ ...formData, receiveDate: e.target.value })
                  }
                />
              </InputGroup>
            </div>
            <div className="flex justify-end gap-2 mt-6 border-t pt-4">
              <Button
                variant="secondary"
                onClick={() => setIsModalOpen(false)}
              >
                ยกเลิก
              </Button>
              <Button onClick={handleAdd}>บันทึก</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
});

// AppShell: the actual authenticated UI layout (sidebar + header + content)

// ─── PRView + POView (module-level, extracted from AppShell) ───────────────────


export default InvoiceView;
