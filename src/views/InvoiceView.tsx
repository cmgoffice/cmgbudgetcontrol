// @ts-nocheck
import React, { useState, useEffect, useMemo, useCallback, useRef, useContext } from "react";
import {
  Plus, Trash2, Edit, CheckCircle, XCircle, FileInput, DollarSign, Info,
  ChevronDown, ChevronRight, AlertCircle, Save, Calendar, Briefcase,
  FileText, Search, ListFilter, Clock, Package
} from "lucide-react";
import { useAppData } from "../contexts/AppDataContext";
import { useUI } from "../contexts/UIContext";
import { Card, Button, InputGroup, Badge, ProjectSelect, formatCurrency } from "../components/ui";
import ResizableTh from "../components/ResizableTh";
const InvoiceView = React.memo(() => {
  const { invoices, pos, addData, updateData, deleteData, showAlert, userRole, columnWidths, handleColumnResize, visibleProjects } = useAppData();
  const { selectedProjectId, handleProjectChange } = useUI();
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
    if (inv.status === "Pending PM" && userRole === "PM")
      newStatus = "Pending GM";
    if (inv.status === "Pending GM" && userRole === "GM") newStatus = "Paid";

    if (newStatus !== inv.status) {
      await updateData("invoices", id, { status: newStatus });
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <h2 className="text-xl font-bold text-slate-800">
          F. รับวางบิล (Invoice Receive)
        </h2>
        <ProjectSelect
          projects={visibleProjects}
          selectedId={selectedProjectId}
          onChange={(e) => handleProjectChange(e.target.value)}
        />
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus size={14} /> รับ Invoice
        </Button>
      </div>
      <div className="bg-purple-50 p-3 rounded-md border border-purple-100 text-xs text-purple-800 mb-4 flex items-center gap-2">
        <Info size={16} />
        <strong>Flow การวางบิล:</strong> Pending PM (ตรวจหน้างาน) → Pending GM
        (อนุมัติจ่าย) → Paid
      </div>
      <Card>
        <table className="w-full text-left text-xs text-slate-600">
          <thead className="bg-slate-50 text-slate-900 uppercase font-semibold">
            <tr>
              <ResizableTh tableId="invoice" colKey="invNo" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.invoice?.invNo}>INV No.</ResizableTh>
              <ResizableTh tableId="invoice" colKey="poRef" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.invoice?.poRef}>Ref. PO</ResizableTh>
              <ResizableTh tableId="invoice" colKey="description" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.invoice?.description}>รายละเอียด</ResizableTh>
              <ResizableTh tableId="invoice" colKey="amount" className="py-2 px-3 text-right" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.invoice?.amount}>จำนวนเงิน</ResizableTh>
              <ResizableTh tableId="invoice" colKey="status" className="py-2 px-3 text-center" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.invoice?.status}>สถานะ</ResizableTh>
              <th className="py-2 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoices
              .filter((inv) => inv.projectId === selectedProjectId)
              .map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="py-2 px-3 font-medium" title={inv.invNo}><span className="cell-text">{inv.invNo}</span></td>
                  <td className="py-2 px-3 text-blue-600" title={inv.poRef}><span className="cell-text">{inv.poRef}</span></td>
                  <td className="py-2 px-3" title={inv.description}><span className="cell-text">{inv.description}</span></td>
                  <td className="py-2 px-3 text-right font-semibold">
                    {formatCurrency(inv.amount)}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <Badge status={inv.status} />
                  </td>
                  <td className="py-2 px-3 text-right flex justify-end gap-1">
                    {userRole === "PM" && inv.status === "Pending PM" && (
                      <Button
                        variant="success"
                        size="sm"
                        className="px-2 py-0.5 text-[10px]"
                        onClick={() => handleAction(inv.id, "approve")}
                      >
                        PM เห็นชอบ
                      </Button>
                    )}
                    {userRole === "GM" && inv.status === "Pending GM" && (
                      <Button
                        variant="success"
                        size="sm"
                        className="px-2 py-0.5 text-[10px]"
                        onClick={() => handleAction(inv.id, "approve")}
                      >
                        GM อนุมัติจ่าย
                      </Button>
                    )}
                    <button
                      className="text-red-500 hover:text-red-700"
                      onClick={() => deleteData("invoices", inv.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </Card>
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
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