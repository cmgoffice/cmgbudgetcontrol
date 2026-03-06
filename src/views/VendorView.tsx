// @ts-nocheck
import React, { useState, useEffect, useMemo, useCallback, useRef, useContext } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useAppData } from "../contexts/AppDataContext";
import { Card, Button, InputGroup } from "../components/ui";
import ResizableTh from "../components/ResizableTh";

const VendorView = React.memo(() => {
  const { vendors, addData, deleteData, showAlert, openConfirm, userRole, columnWidths, handleColumnResize } = useAppData();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ code: "", name: "", type: "", email: "", tel: "", note: "" });

  const handleAdd = async () => {
    const success = await addData("vendors", formData);
    if (success) {
      setIsModalOpen(false);
      setFormData({ code: "", name: "", type: "", email: "", tel: "", note: "" });
      showAlert("สำเร็จ", "เพิ่ม Vendor เรียบร้อย", "success");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800">E. ข้อมูล Vendor/Supplier</h2>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus size={14} /> เพิ่ม Vendor
        </Button>
      </div>
      <Card>
        <table className="w-full text-left text-xs text-slate-600">
          <thead className="bg-slate-50 text-slate-900 uppercase font-semibold">
            <tr>
              <ResizableTh tableId="vendor" colKey="code" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.vendor?.code}>Code</ResizableTh>
              <ResizableTh tableId="vendor" colKey="name" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.vendor?.name}>Name</ResizableTh>
              <ResizableTh tableId="vendor" colKey="type" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.vendor?.type}>Type</ResizableTh>
              <ResizableTh tableId="vendor" colKey="contact" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.vendor?.contact}>Contact</ResizableTh>
              <ResizableTh tableId="vendor" colKey="note" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.vendor?.note}>Note</ResizableTh>
              <th className="py-2 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {vendors.map((v) => (
              <tr key={v.id} className="hover:bg-slate-50">
                <td className="py-2 px-3 font-medium" title={v.code}><span className="cell-text">{v.code}</span></td>
                <td className="py-2 px-3" title={v.name}><span className="cell-text">{v.name}</span></td>
                <td className="py-2 px-3" title={v.type}><span className="cell-text">{v.type}</span></td>
                <td className="py-2 px-3 text-xs" title={`${v.email || ""} ${v.tel || ""}`.trim()}>
                  <span className="cell-text">{v.email}{v.tel ? ` / ${v.tel}` : ""}</span>
                </td>
                <td className="py-2 px-3 text-xs text-slate-500" title={v.note}><span className="cell-text">{v.note}</span></td>
                <td className="py-2 px-3 text-right">
                  <button
                    className="text-red-500"
                    onClick={() => openConfirm("ยืนยันการลบ", "คุณต้องการลบข้อมูล Vendor นี้ใช่หรือไม่?", async () => await deleteData("vendors", v.id), "danger")}
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
            <h3 className="text-lg font-bold mb-4">เพิ่ม Vendor</h3>
            <div className="grid grid-cols-2 gap-4">
              <InputGroup label="Vendor Code">
                <input type="text" className="w-full border rounded p-2 text-sm" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} />
              </InputGroup>
              <InputGroup label="Type">
                <input type="text" className="w-full border rounded p-2 text-sm" value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })} />
              </InputGroup>
              <div className="col-span-2">
                <InputGroup label="Name">
                  <input type="text" className="w-full border rounded p-2 text-sm" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                </InputGroup>
              </div>
              <InputGroup label="Email">
                <input type="email" className="w-full border rounded p-2 text-sm" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </InputGroup>
              <InputGroup label="Tel">
                <input type="text" className="w-full border rounded p-2 text-sm" value={formData.tel} onChange={(e) => setFormData({ ...formData, tel: e.target.value })} />
              </InputGroup>
              <div className="col-span-2">
                <InputGroup label="Note">
                  <textarea className="w-full border rounded p-2 text-sm" value={formData.note} onChange={(e) => setFormData({ ...formData, note: e.target.value })} />
                </InputGroup>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="secondary" onClick={() => setIsModalOpen(false)}>ยกเลิก</Button>
              <Button onClick={handleAdd}>บันทึก</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
});

export default VendorView;
