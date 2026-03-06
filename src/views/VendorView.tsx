// @ts-nocheck
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Plus, Trash2, Edit, Download, FileSpreadsheet, Search, Building2,
  CheckSquare, Square, ChevronDown
} from "lucide-react";
import { collection, doc, writeBatch } from "firebase/firestore";
import { useAppData } from "../contexts/AppDataContext";
import { Card, Button, InputGroup } from "../components/ui";
import ResizableTh from "../components/ResizableTh";

const PAGE_SIZE_OPTIONS = [100, 200, 500];
const BATCH_SIZE = 500;

const VendorView = React.memo(() => {
  const { vendors, addData, updateData, deleteData, showAlert, openConfirm, userRole, columnWidths, handleColumnResize, db, appId, loadVendors } = useAppData();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState([]);
  const fileInputRef = useRef(null);

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [actionDropdownOpen, setActionDropdownOpen] = useState(false);
  const actionDropdownRef = useRef(null);

  const [pageSize, setPageSize] = useState(100);
  const [customPageSize, setCustomPageSize] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });

  const emptyForm = { code: "", name: "", address: "", tel: "", creditTerm: "" };
  const [formData, setFormData] = useState(emptyForm);

  const vendorsColRef = useMemo(() => db && appId ? collection(db, "artifacts", appId, "public", "data", "vendors") : null, [db, appId]);

  useEffect(() => {
    loadVendors();
  }, [loadVendors]);

  useEffect(() => {
    const onOutside = (e) => { if (actionDropdownRef.current && !actionDropdownRef.current.contains(e.target)) setActionDropdownOpen(false); };
    document.addEventListener("click", onOutside);
    return () => document.removeEventListener("click", onOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = searchText.toLowerCase();
    return vendors.filter(
      (v) =>
        !q ||
        (v.code || "").toLowerCase().includes(q) ||
        (v.name || "").toLowerCase().includes(q) ||
        (v.address || "").toLowerCase().includes(q) ||
        (v.tel || "").toLowerCase().includes(q) ||
        String(v.creditTerm || "").toLowerCase().includes(q)
    );
  }, [vendors, searchText]);

  const effectivePageSize = useMemo(() => {
    const custom = parseInt(customPageSize, 10);
    if (!Number.isNaN(custom) && custom >= 1 && custom <= 10000) return custom;
    return pageSize;
  }, [pageSize, customPageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / effectivePageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * effectivePageSize;
    return filtered.slice(start, start + effectivePageSize);
  }, [filtered, safePage, effectivePageSize]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1);
  }, [totalPages, currentPage]);

  const startItem = (safePage - 1) * effectivePageSize + 1;
  const endItem = Math.min(safePage * effectivePageSize, filtered.length);

  const handleOpenAdd = () => {
    setFormData(emptyForm);
    setEditingId(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (v) => {
    setFormData({
      code: v.code || "",
      name: v.name || "",
      address: v.address || "",
      tel: v.tel || "",
      creditTerm: v.creditTerm ?? "",
    });
    setEditingId(v.id);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return showAlert("กรุณากรอกข้อมูล", "ต้องระบุชื่ออย่างน้อย", "warning");
    const payload = {
      code: (formData.code || "").trim(),
      name: (formData.name || "").trim(),
      address: (formData.address || "").trim(),
      tel: (formData.tel || "").trim(),
      creditTerm: (formData.creditTerm || "").trim(),
    };
    if (editingId) {
      await updateData("vendors", editingId, payload);
      showAlert("สำเร็จ", "แก้ไข Vendor เรียบร้อย", "success");
    } else {
      await addData("vendors", payload);
      showAlert("สำเร็จ", "เพิ่ม Vendor เรียบร้อย", "success");
    }
    setIsModalOpen(false);
    setFormData(emptyForm);
    setEditingId(null);
  };

  const handleDelete = (id) => {
    openConfirm("ยืนยันการลบ", "คุณต้องการลบ Vendor นี้ใช่หรือไม่?", async () => {
      await deleteData("vendors", id);
    }, "danger");
  };

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAllOnPage = useCallback((checked) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) paginated.forEach((v) => next.add(v.id));
      else paginated.forEach((v) => next.delete(v.id));
      return next;
    });
  }, [paginated]);

  const allOnPageSelected = paginated.length > 0 && paginated.every((v) => selectedIds.has(v.id));
  const someSelected = selectedIds.size > 0;

  const handleBulkDelete = useCallback(() => {
    if (selectedIds.size === 0) {
      showAlert("ไม่มีการเลือก", "กรุณาเลือกรายการที่ต้องการลบ", "warning");
      return;
    }
    openConfirm("ยืนยันการลบ", `ต้องการลบ ${selectedIds.size} รายการที่เลือกใช่หรือไม่?`, async () => {
      const ids = Array.from(selectedIds);
      setSelectedIds(new Set());
      setActionDropdownOpen(false);
      for (const id of ids) await deleteData("vendors", id);
      showAlert("สำเร็จ", `ลบ ${ids.length} รายการเรียบร้อย`, "success");
    }, "danger");
  }, [selectedIds, deleteData, openConfirm, showAlert]);

  const handleDownloadTemplate = () => {
    const bom = "\uFEFF";
    const headers = "รหัส,ชื่อ,ที่อยู่,โทร,เครดิตเทอม\n";
    const sample = "V001,บริษัท ก. จำกัด,123 ถ.สุขุมวิท กทม.,02-1234567,30\nV002,ร้าน ข. จำกัด,456 ถ.พระราม 4,02-7654321,60";
    const uri = "data:text/csv;charset=utf-8," + encodeURIComponent(bom + headers + sample);
    const a = document.createElement("a");
    a.setAttribute("href", uri);
    a.setAttribute("download", "vendor_template.csv");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const parseCsvRow = (row) => {
    const cols = [];
    let inQ = false, cur = "";
    for (const ch of row) {
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) { cols.push(cur); cur = ""; }
      else cur += ch;
    }
    cols.push(cur);
    const clean = (s) => (s || "").trim().replace(/^"|"$/g, "").replace(/""/g, '"').trim();
    return { code: clean(cols[0]), name: clean(cols[1]), address: clean(cols[2]), tel: clean(cols[3]), creditTerm: clean(cols[4]) };
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const rows = text.split(/\r?\n/).slice(1).filter((r) => r.trim());
      const parsed = rows.map((row) => parseCsvRow(row)).filter((r) => r.name);
      setImportPreview(parsed);
      setIsImportOpen(true);
    };
    reader.readAsText(file, "UTF-8");
  };

  const handleConfirmImport = useCallback(async () => {
    if (!importPreview.length || !vendorsColRef) return;
    const total = importPreview.length;
    setUploadProgress({ done: 0, total });
    let count = 0;
    try {
      for (let i = 0; i < total; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = importPreview.slice(i, i + BATCH_SIZE);
        chunk.forEach((item) => {
          const ref = doc(vendorsColRef);
          batch.set(ref, {
            code: (item.code || "").trim(),
            name: (item.name || "").trim(),
            address: (item.address || "").trim(),
            tel: (item.tel || "").trim(),
            creditTerm: (item.creditTerm || "").trim(),
          });
        });
        await batch.commit();
        count += chunk.length;
        setUploadProgress((prev) => ({ ...prev, done: count }));
      }
      setIsImportOpen(false);
      setImportPreview([]);
      setUploadProgress({ done: 0, total: 0 });
      showAlert("นำเข้าสำเร็จ", `นำเข้า ${count} รายการเรียบร้อย`, "success");
    } catch (e) {
      setUploadProgress({ done: 0, total: 0 });
      showAlert("Error", "เกิดข้อผิดพลาด: " + (e.message || e), "error");
    }
  }, [importPreview, vendorsColRef, db, showAlert]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Building2 size={20} className="text-slate-600" /> Vendor Management
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2 text-slate-400" />
            <input
              type="text"
              placeholder="ค้นหา..."
              className="pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:border-slate-400 focus:ring-1 focus:ring-slate-100 w-44"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <Button variant="outline" className="text-xs h-8" onClick={handleDownloadTemplate}>
            <Download size={13} /> Template
          </Button>
          <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium text-xs shadow-sm bg-green-600 text-white hover:bg-green-700 cursor-pointer h-8 transition-colors">
            <FileSpreadsheet size={13} /> Import CSV
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
          </label>
          {someSelected && (
            <div className="relative" ref={actionDropdownRef}>
              <Button variant="secondary" className="h-8 text-xs flex items-center gap-1" onClick={() => setActionDropdownOpen((o) => !o)}>
                Action <ChevronDown size={12} />
              </Button>
              {actionDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 py-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 min-w-[140px]">
                  <button type="button" className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2" onClick={handleBulkDelete}>
                    <Trash2 size={14} /> ลบที่เลือก ({selectedIds.size})
                  </button>
                </div>
              )}
            </div>
          )}
          <Button onClick={handleOpenAdd} className="h-8 text-xs">
            <Plus size={13} /> เพิ่ม Vendor
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        {filtered.length > 0 && (
          <div className="flex justify-end items-center gap-4 px-3 py-2 bg-slate-50 border-b border-slate-200 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600">แสดง</span>
              <select
                value={customPageSize ? "custom" : pageSize}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "custom") { setCustomPageSize(effectivePageSize.toString()); return; }
                  setCustomPageSize("");
                  setPageSize(Number(v));
                  setCurrentPage(1);
                }}
                className="text-xs border border-slate-300 rounded px-2 py-1 bg-white focus:ring-1 focus:ring-slate-400 focus:border-slate-400"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (<option key={n} value={n}>{n}</option>))}
                <option value="custom">กำหนดเอง</option>
              </select>
              {customPageSize !== "" && (
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={customPageSize}
                  onChange={(e) => { setCustomPageSize(e.target.value); setCurrentPage(1); }}
                  onBlur={() => {
                    const n = parseInt(customPageSize, 10);
                    if (Number.isNaN(n) || n < 1) setCustomPageSize("100");
                    else if (n > 10000) setCustomPageSize("10000");
                  }}
                  className="w-16 text-xs border border-slate-300 rounded px-2 py-1 text-right"
                />
              )}
              <span className="text-xs text-slate-600">รายการต่อหน้า</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-slate-500 mr-1">หน้า</span>
              <button type="button" disabled={safePage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} className="px-2 py-1 text-xs rounded border border-slate-300 bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50">‹</button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum = totalPages <= 5 ? i + 1 : safePage <= 3 ? i + 1 : safePage >= totalPages - 2 ? totalPages - 4 + i : safePage - 2 + i;
                return (
                  <button key={pageNum} type="button" onClick={() => setCurrentPage(pageNum)} className={`min-w-[28px] px-2 py-1 text-xs rounded border ${safePage === pageNum ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 bg-white hover:bg-slate-50"}`}>{pageNum}</button>
                );
              })}
              <button type="button" disabled={safePage >= totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} className="px-2 py-1 text-xs rounded border border-slate-300 bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50">›</button>
            </div>
            <span className="text-xs text-slate-500">
              {startItem}-{endItem} จาก {filtered.length}{searchText ? ` (จาก ${vendors.length})` : ""} รายการ
            </span>
          </div>
        )}
        <table className="w-full text-left text-xs text-slate-600">
          <thead className="bg-slate-50 text-slate-800 font-semibold border-b border-slate-200">
            <tr>
              <th className="py-2 px-2 w-10 text-center">
                <button type="button" className="p-0.5 rounded hover:bg-slate-200" onClick={() => selectAllOnPage(!allOnPageSelected)} title={allOnPageSelected ? "ยกเลิกเลือกทั้งหมด" : "เลือกทั้งหมดในหน้านี้"}>
                  {allOnPageSelected ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} className="text-slate-400" />}
                </button>
              </th>
              <th className="py-2 px-3 w-12 text-center">ลำดับ</th>
              <ResizableTh tableId="vendor" colKey="code" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.vendor?.code}>รหัส</ResizableTh>
              <ResizableTh tableId="vendor" colKey="name" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.vendor?.name}>ชื่อ</ResizableTh>
              <ResizableTh tableId="vendor" colKey="address" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.vendor?.address}>ที่อยู่</ResizableTh>
              <ResizableTh tableId="vendor" colKey="tel" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.vendor?.tel}>โทร</ResizableTh>
              <ResizableTh tableId="vendor" colKey="creditTerm" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.vendor?.creditTerm}>เครดิตเทอม</ResizableTh>
              <th className="py-2 px-3 w-20 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400">
                  <Building2 size={32} className="mx-auto mb-2 opacity-30" />
                  ยังไม่มีรายการ Vendor
                </td>
              </tr>
            ) : (
              paginated.map((v, idx) => (
                <tr key={v.id} className="hover:bg-slate-50 odd:bg-white even:bg-slate-50/40">
                  <td className="py-1.5 px-2 text-center">
                    <button type="button" className="p-0.5 rounded hover:bg-slate-200" onClick={() => toggleSelect(v.id)}>
                      {selectedIds.has(v.id) ? <CheckSquare size={15} className="text-blue-600" /> : <Square size={15} className="text-slate-400" />}
                    </button>
                  </td>
                  <td className="py-1.5 px-3 text-center text-slate-400 font-mono text-[11px]">{startItem + idx}</td>
                  <td className="py-1.5 px-3 font-medium text-slate-700" title={v.code}><span className="cell-text">{v.code || "-"}</span></td>
                  <td className="py-1.5 px-3" title={v.name}><span className="cell-text">{v.name || "-"}</span></td>
                  <td className="py-1.5 px-3 text-slate-600 max-w-[200px] truncate" title={v.address}><span className="cell-text">{v.address || "-"}</span></td>
                  <td className="py-1.5 px-3" title={v.tel}><span className="cell-text">{v.tel || "-"}</span></td>
                  <td className="py-1.5 px-3" title={v.creditTerm}><span className="cell-text">{v.creditTerm || "-"}</span></td>
                  <td className="py-1.5 px-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button className="text-blue-500 hover:text-blue-700 p-1 hover:bg-blue-50 rounded" onClick={() => handleOpenEdit(v)} title="แก้ไข"><Edit size={13} /></button>
                      <button className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded" onClick={() => handleDelete(v.id)} title="ลบ"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
          <Card className="w-full max-w-lg p-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Building2 size={18} /> {editingId ? "แก้ไข Vendor" : "เพิ่ม Vendor"}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <InputGroup label="รหัส">
                <input type="text" className="w-full border rounded-lg p-2 text-sm" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} placeholder="V001" />
              </InputGroup>
              <InputGroup label="โทร">
                <input type="text" className="w-full border rounded-lg p-2 text-sm" value={formData.tel} onChange={(e) => setFormData({ ...formData, tel: e.target.value })} placeholder="02-xxx-xxxx" />
              </InputGroup>
              <div className="col-span-2">
                <InputGroup label="ชื่อ *">
                  <input type="text" className="w-full border rounded-lg p-2 text-sm" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="ชื่อร้านค้า/บริษัท" />
                </InputGroup>
              </div>
              <div className="col-span-2">
                <InputGroup label="ที่อยู่">
                  <input type="text" className="w-full border rounded-lg p-2 text-sm" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="ที่อยู่" />
                </InputGroup>
              </div>
              <InputGroup label="เครดิตเทอม">
                <input type="text" className="w-full border rounded-lg p-2 text-sm" value={formData.creditTerm} onChange={(e) => setFormData({ ...formData, creditTerm: e.target.value })} placeholder="30, 60..." />
              </InputGroup>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="secondary" onClick={() => { setIsModalOpen(false); setFormData(emptyForm); setEditingId(null); }}>ยกเลิก</Button>
              <Button onClick={handleSave}>{editingId ? "บันทึกการแก้ไข" : "เพิ่มรายการ"}</Button>
            </div>
          </Card>
        </div>
      )}

      {isImportOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
          <Card className="w-full max-w-2xl p-6">
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              <FileSpreadsheet size={18} /> ตรวจสอบข้อมูลก่อน Import ({importPreview.length} รายการ)
            </h3>
            {uploadProgress.total > 0 && (
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-medium text-blue-800">กำลังอัพโหลด...</span>
                  <span className="text-2xl font-bold tabular-nums text-blue-600 animate-pulse">{uploadProgress.done.toLocaleString()} <span className="text-slate-400 font-normal">/</span> {uploadProgress.total.toLocaleString()}</span>
                </div>
                <div className="mt-2 h-2 bg-blue-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 transition-all duration-300 ease-out" style={{ width: `${(uploadProgress.done / uploadProgress.total) * 100}%` }} />
                </div>
              </div>
            )}
            <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg mb-4">
              <table className="w-full text-xs text-left text-slate-600">
                <thead className="bg-slate-100 text-slate-800 font-semibold sticky top-0">
                  <tr>
                    <th className="py-1.5 px-3 w-8 text-center">#</th>
                    <th className="py-1.5 px-3 w-20">รหัส</th>
                    <th className="py-1.5 px-3">ชื่อ</th>
                    <th className="py-1.5 px-3">ที่อยู่</th>
                    <th className="py-1.5 px-3 w-24">โทร</th>
                    <th className="py-1.5 px-3 w-20">เครดิตเทอม</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {importPreview.map((row, i) => (
                    <tr key={i} className="odd:bg-white even:bg-slate-50/40">
                      <td className="py-1 px-3 text-center text-slate-400">{i + 1}</td>
                      <td className="py-1 px-3 font-medium">{row.code || "-"}</td>
                      <td className="py-1 px-3">{row.name}</td>
                      <td className="py-1 px-3 max-w-[180px] truncate">{row.address || "-"}</td>
                      <td className="py-1 px-3">{row.tel || "-"}</td>
                      <td className="py-1 px-3">{row.creditTerm || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" disabled={uploadProgress.total > 0} onClick={() => { setIsImportOpen(false); setImportPreview([]); setUploadProgress({ done: 0, total: 0 }); }}>ยกเลิก</Button>
              <Button onClick={handleConfirmImport} disabled={uploadProgress.total > 0}>
                <FileSpreadsheet size={13} /> ยืนยัน Import ({importPreview.length} รายการ)
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
});

export default VendorView;
