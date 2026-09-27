// @ts-nocheck
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Plus, Trash2, Edit, Download, FileSpreadsheet, Search, Building2,
  CheckSquare, Square, ChevronDown, ChevronUp, ChevronsUpDown, Merge
} from "lucide-react";
import { collection, doc, writeBatch } from "firebase/firestore";
import { useAppData } from "../contexts/AppDataContext";
import { uploadAttachment } from "../lib/uploadAttachment";
import { Card, Button, InputGroup } from "../components/ui";
import ResizableTh from "../components/ResizableTh";
import ColumnVisibilityToggle from "../components/ColumnVisibilityToggle";
import { useProportionalTableLayout } from "../hooks/useProportionalTableLayout";
import { TABLE_LAYOUT_DEFAULTS } from "../lib/tableLayoutDefaults";
import {
  VENDOR_REFERENCE_LABELS,
  buildMasterFillPatch,
  buildVendorMergeLogDetails,
  countVendorReferences,
  isMergedVendor,
  mergeVendors,
  normalizeVendorCode,
  pickMasterVendor,
} from "../lib/vendorMerge";

const PAGE_SIZE_OPTIONS = [100, 200, 500];
const BATCH_SIZE = 500;

const VendorView = React.memo(() => {
  const { vendors, addData, updateData, deleteData, showAlert, openConfirm, userRole, columnWidths, handleColumnResize, db, appId, loadVendors, canUseFunction, isColumnVisible, vendorEvaluations, loadVendorEvaluations, userData, logAction } = useAppData();
  const isAdmin = userRole === "Administrator";
  const vendorTableRef = useRef(null);
  const vendorTableLayout = useProportionalTableLayout({
    tableId: "vendor",
    defaultWeights: TABLE_LAYOUT_DEFAULTS.vendor,
    savedWidths: columnWidths.vendor,
    containerRef: vendorTableRef,
    enabled: true,
    driftKey: "address",
    handleColumnResize,
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState([]);
  const [importFile, setImportFile] = useState(null);
  const fileInputRef = useRef(null);

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [actionDropdownOpen, setActionDropdownOpen] = useState(false);
  const actionDropdownRef = useRef(null);

  const [pageSize, setPageSize] = useState(100);
  const [customPageSize, setCustomPageSize] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [codeSort, setCodeSort] = useState<"asc" | "desc" | null>(null);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  // null = ปิด modal; groups = กลุ่มรหัสซ้ำที่จะรวม พร้อมรายการหลักที่ระบบเลือก
  const [mergeState, setMergeState] = useState(null);

  
  const [activeTab, setActiveTab] = useState('vendor');

  useEffect(() => {
    if (activeTab === 'score') {
      if (typeof loadVendorEvaluations === 'function') {
        loadVendorEvaluations();
      }
    }
  }, [activeTab, loadVendorEvaluations]);

  const { paymentScores, receiveScores } = useMemo(() => {
    if (!vendorEvaluations) return { paymentScores: [], receiveScores: [] };
    const pMap = new Map();
    const rMap = new Map();

    vendorEvaluations.forEach(ev => {
      const vid = ev.vendorId || ev.contractorId;
      if (!vid) return;

      const getScore = (val) => {
        if (typeof val === 'number') return val;
        if (val && typeof val.score === 'number') return val.score;
        return 0;
      };

      const isPO = ev.evaluationStage === "PO Creation";
      const isReceive = ev.evaluationStage === "Receive";
      const isPayment = !ev.evaluationStage || ev.evaluationStage === "Payment";

      const poType = ev.poType || "";
      const isMaterialPO = ["CR", "SP", "SE", "RE"].includes(poType);
      
      const isReceiveGroup = isReceive || (isPO && isMaterialPO);
      const isPaymentGroup = isPayment || (isPO && !isMaterialPO);

      const initMap = (map) => {
        if (!map.has(vid)) {
          map.set(vid, {
            vendorId: vid,
            vendorCode: vendors.find(v => v.id === vid)?.code || ev.vendorNo || ev.vendorCode || '-',
            vendorName: vendors.find(v => v.id === vid)?.name || ev.vendorName || 'Unknown',
            count: 0, po_count: 0, other_count: 0,
            po_q1: 0, po_q2: 0, po_q3: 0,
            pmt_q1: 0, pmt_q2: 0, pmt_q3: 0, pmt_q4: 0, pmt_q5: 0,
            rcv_q1: 0, rcv_q2: 0,
            totalScore: 0
          });
        }
        return map.get(vid);
      };

      if (isPaymentGroup) {
        const m = initMap(pMap);
        m.count++;
        if (isPO) {
          m.po_count++;
          m.po_q1 += getScore(ev.scores?.q1);
          m.po_q2 += getScore(ev.scores?.q2);
          m.po_q3 += getScore(ev.scores?.q3);
        } else {
          m.other_count++;
          m.pmt_q1 += getScore(ev.scores?.q1);
          m.pmt_q2 += getScore(ev.scores?.q2);
          m.pmt_q3 += getScore(ev.scores?.q3);
          m.pmt_q4 += getScore(ev.scores?.q4);
          m.pmt_q5 += getScore(ev.scores?.q5);
        }
      }

      if (isReceiveGroup) {
        const m = initMap(rMap);
        m.count++;
        if (isPO) {
          m.po_count++;
          m.po_q1 += getScore(ev.scores?.q1);
          m.po_q2 += getScore(ev.scores?.q2);
          m.po_q3 += getScore(ev.scores?.q3);
        } else {
          m.other_count++;
          m.rcv_q1 += getScore(ev.scores?.q1);
          m.rcv_q2 += getScore(ev.scores?.q2);
        }
      }
    });

    const formatScores = (map, isPaymentType) => {
      return Array.from(map.values()).map(m => {
        const poCount = Math.max(1, m.po_count);
        const otherCount = Math.max(1, m.other_count);
        
        let q1=0, q2=0, q3=0, q4=0, q5=0, q6=0, q7=0, q8=0;
        let totalScore = 0;
        let maxScore = 0;

        if (isPaymentType) {
          q1 = m.po_q1 / poCount;
          q2 = m.po_q2 / poCount;
          q3 = m.po_q3 / poCount;
          q4 = m.pmt_q1 / otherCount;
          q5 = m.pmt_q2 / otherCount;
          q6 = m.pmt_q3 / otherCount;
          q7 = m.pmt_q4 / otherCount;
          q8 = m.pmt_q5 / otherCount;
          
          if (m.po_count > 0) { totalScore += (q1+q2+q3); maxScore += 3; }
          if (m.other_count > 0) { totalScore += (q4+q5+q6+q7+q8); maxScore += 5; }
          
          return { ...m, q1: q1.toFixed(2), q2: q2.toFixed(2), q3: q3.toFixed(2), q4: q4.toFixed(2), q5: q5.toFixed(2), q6: q6.toFixed(2), q7: q7.toFixed(2), q8: q8.toFixed(2), totalScore: totalScore.toFixed(2), maxScore };
        } else {
          q1 = m.po_q1 / poCount;
          q2 = m.po_q2 / poCount;
          q3 = m.po_q3 / poCount;
          q4 = m.rcv_q1 / otherCount;
          q5 = m.rcv_q2 / otherCount;
          
          if (m.po_count > 0) { totalScore += (q1+q2+q3); maxScore += 3; }
          if (m.other_count > 0) { totalScore += (q4+q5); maxScore += 2; }
          
          return { ...m, q1: q1.toFixed(2), q2: q2.toFixed(2), q3: q3.toFixed(2), q4: q4.toFixed(2), q5: q5.toFixed(2), totalScore: totalScore.toFixed(2), maxScore };
        }
      }).sort((a, b) => Number(b.totalScore) - Number(a.totalScore));
    };

    return {
      paymentScores: formatScores(pMap, true),
      receiveScores: formatScores(rMap, false)
    };
  }, [vendorEvaluations, vendors]);

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

  // รายการที่ถูกรวมเข้ารายการหลักแล้วไม่แสดงในตาราง
  const activeVendors = useMemo(() => vendors.filter((v) => !isMergedVendor(v)), [vendors]);

  const filtered = useMemo(() => {
    const q = searchText.toLowerCase();
    return activeVendors.filter(
      (v) =>
        !q ||
        (v.code || "").toLowerCase().includes(q) ||
        (v.name || "").toLowerCase().includes(q) ||
        (v.address || "").toLowerCase().includes(q) ||
        (v.tel || "").toLowerCase().includes(q) ||
        String(v.creditTerm || "").toLowerCase().includes(q)
    );
  }, [activeVendors, searchText]);

  // รหัส vendor ที่ซ้ำกัน (ไม่สนตัวพิมพ์เล็ก-ใหญ่และช่องว่างหัวท้าย) นับจากรายการทั้งหมด ไม่ใช่เฉพาะผลค้นหา
  const duplicateCodes = useMemo(() => {
    const counts = new Map<string, number>();
    activeVendors.forEach((v) => {
      const key = normalizeVendorCode(v.code);
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const dups = new Set<string>();
    counts.forEach((count, key) => {
      if (count > 1) dups.add(key);
    });
    return dups;
  }, [activeVendors]);

  // กลุ่ม Vendor ที่รหัสซ้ำ (เฉพาะรายการที่ยังไม่ถูกรวม)
  const duplicateGroups = useMemo(() => {
    const groups = new Map();
    activeVendors.forEach((v) => {
      const key = normalizeVendorCode(v.code);
      if (!duplicateCodes.has(key)) return;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(v);
    });
    return groups;
  }, [activeVendors, duplicateCodes]);

  const openMergeModal = async (codeKeys) => {
    const groups = codeKeys.map((key) => duplicateGroups.get(key)).filter((g) => g && g.length > 1);
    if (!groups.length) return;
    setMergeState({ loading: true, running: false, groups: [], error: "" });
    try {
      const ids = groups.flat().map((v) => v.id);
      const refCounts = await countVendorReferences(db, appId, ids);
      const planned = groups.map((group) => {
        const { master, duplicates, reason } = pickMasterVendor(group, refCounts);
        const moveCounts = {};
        duplicates.forEach((d) => {
          Object.entries(refCounts[d.id]?.byLabel || {}).forEach(([label, n]) => {
            moveCounts[label] = (moveCounts[label] || 0) + n;
          });
        });
        return {
          code: master.code,
          master,
          duplicates,
          reason,
          refCounts,
          moveCounts,
          fillPatch: buildMasterFillPatch(master, duplicates),
          included: true,
        };
      });
      setMergeState({ loading: false, running: false, groups: planned, error: "" });
    } catch (err) {
      setMergeState({ loading: false, running: false, groups: [], error: String(err?.message || err) });
    }
  };

  const toggleMergeGroup = (index) => {
    setMergeState((prev) => ({
      ...prev,
      groups: prev.groups.map((g, i) => (i === index ? { ...g, included: !g.included } : g)),
    }));
  };

  const handleConfirmMerge = async () => {
    if (!isAdmin || !mergeState) return;
    const selected = mergeState.groups.filter((g) => g.included);
    if (!selected.length) return;
    setMergeState((prev) => ({ ...prev, running: true, error: "" }));
    const actorName = userData ? `${userData.firstName || ""} ${userData.lastName || ""}`.trim() : "";
    const updateVendor = (id, patch) => updateData("vendors", id, patch, { skipLog: true });
    let done = 0;
    try {
      for (const group of selected) {
        const result = await mergeVendors(db, appId, {
          master: group.master,
          duplicates: group.duplicates,
          actorName,
          updateVendor,
        });
        await logAction("Update", buildVendorMergeLogDetails(group.master, group.duplicates, result));
        done += 1;
      }
      setMergeState(null);
      showAlert("สำเร็จ", `รวม Vendor รหัสซ้ำเรียบร้อย ${done} กลุ่ม`, "success");
    } catch (err) {
      setMergeState((prev) => ({
        ...prev,
        running: false,
        error: `รวมสำเร็จ ${done} จาก ${selected.length} กลุ่ม แล้วเกิดข้อผิดพลาด: ${err?.message || err} — กดรวมอีกครั้งได้ ระบบจะทำต่อจากส่วนที่ค้าง`,
      }));
    }
  };

  // เรียงตามรหัสเมื่อกดหัวคอลัมน์; ถ้าไม่ได้เรียง คงลำดับเดิมแต่ดึงแถวรหัสซ้ำมาต่อท้ายแถวแรกที่พบ
  const sorted = useMemo(() => {
    const normCode = (v) => (v.code || "").trim().toLowerCase();
    if (codeSort) {
      const dir = codeSort === "asc" ? 1 : -1;
      return [...filtered].sort((a, b) => {
        const ca = normCode(a);
        const cb = normCode(b);
        if (!ca && !cb) return 0;
        if (!ca) return 1;
        if (!cb) return -1;
        return dir * ca.localeCompare(cb, "th", { numeric: true });
      });
    }
    const groups = new Map();
    const result = [];
    filtered.forEach((v) => {
      const key = normCode(v);
      if (!key || !duplicateCodes.has(key)) {
        result.push([v]);
        return;
      }
      const group = groups.get(key);
      if (group) {
        group.push(v);
      } else {
        const newGroup = [v];
        groups.set(key, newGroup);
        result.push(newGroup);
      }
    });
    return result.flat();
  }, [filtered, codeSort, duplicateCodes]);

  const toggleCodeSort = () => {
    setCodeSort((prev) => (prev === null ? "asc" : prev === "asc" ? "desc" : null));
    setCurrentPage(1);
  };

  const effectivePageSize = useMemo(() => {
    const custom = parseInt(customPageSize, 10);
    if (!Number.isNaN(custom) && custom >= 1 && custom <= 10000) return custom;
    return pageSize;
  }, [pageSize, customPageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / effectivePageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * effectivePageSize;
    return sorted.slice(start, start + effectivePageSize);
  }, [sorted, safePage, effectivePageSize]);

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

  // คืนข้อความเมื่อ Vendor ที่จะลบยังมีเอกสารผูกอยู่ ถ้าไม่มีคืน null
  const describeLinkedVendors = async (ids) => {
    const refCounts = await countVendorReferences(db, appId, ids);
    const linked = ids.filter((id) => (refCounts[id]?.total || 0) > 0);
    if (!linked.length) return null;
    const lines = linked.map((id) => {
      const v = vendors.find((x) => x.id === id);
      const parts = Object.entries(refCounts[id].byLabel).map(([label, n]) => `${label} ${n}`).join(", ");
      return `${v?.code || "-"} ${v?.name || id}: ${parts}`;
    });
    return `${lines.join("\n")}\n\nลบไม่ได้เพราะยังมีเอกสารผูกอยู่ ถ้าเป็นรหัสซ้ำให้ใช้ "รวมรายการซ้ำ" แทน`;
  };

  const handleDelete = (id) => {
    openConfirm("ยืนยันการลบ", "คุณต้องการลบ Vendor นี้ใช่หรือไม่?", async () => {
      try {
        const blocked = await describeLinkedVendors([id]);
        if (blocked) {
          showAlert("ลบไม่ได้", blocked, "warning");
          return;
        }
      } catch (err) {
        showAlert("Error", "ตรวจสอบเอกสารที่ผูกกับ Vendor ไม่สำเร็จ: " + (err?.message || err), "error");
        return;
      }
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
      setActionDropdownOpen(false);
      try {
        const blocked = await describeLinkedVendors(ids);
        if (blocked) {
          showAlert("ลบไม่ได้", blocked, "warning");
          return;
        }
      } catch (err) {
        showAlert("Error", "ตรวจสอบเอกสารที่ผูกกับ Vendor ไม่สำเร็จ: " + (err?.message || err), "error");
        return;
      }
      setSelectedIds(new Set());
      for (const id of ids) await deleteData("vendors", id);
      showAlert("สำเร็จ", `ลบ ${ids.length} รายการเรียบร้อย`, "success");
    }, "danger");
  }, [selectedIds, deleteData, openConfirm, showAlert, db, appId, vendors]);

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
    setImportFile(file);
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
      if (importFile) {
        await uploadAttachment(importFile, { type: "imports", subPath: "vendors" });
        setImportFile(null);
      }
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
      setImportFile(null);
      setUploadProgress({ done: 0, total: 0 });
      showAlert("นำเข้าสำเร็จ", `นำเข้า ${count} รายการเรียบร้อย`, "success");
    } catch (e) {
      setUploadProgress({ done: 0, total: 0 });
      setImportFile(null);
      showAlert("Error", "เกิดข้อผิดพลาด: " + (e.message || e), "error");
    }
  }, [importPreview, importFile, vendorsColRef, db, showAlert]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Building2 size={20} className="text-slate-600" /> Vendor Management
          </h2>
          <ColumnVisibilityToggle tableId="vendor" />
        </div>
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
          {canUseFunction("vendor", "import") && (
            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium text-xs shadow-sm bg-green-600 text-white hover:bg-green-700 cursor-pointer h-8 transition-colors">
              <FileSpreadsheet size={13} /> Import CSV
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
            </label>
          )}
          {someSelected && canUseFunction("vendor", "delete") && (
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
          {isAdmin && duplicateGroups.size > 0 && (
            <Button
              variant="outline"
              className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => openMergeModal(Array.from(duplicateGroups.keys()))}
            >
              <Merge size={13} /> รวมรหัสซ้ำทั้งหมด ({duplicateGroups.size})
            </Button>
          )}
          {canUseFunction("vendor", "add") && (
            <Button onClick={handleOpenAdd} className="h-8 text-xs">
              <Plus size={13} /> เพิ่ม Vendor
            </Button>
          )}
        </div>
      </div>

      
      <div className="flex border-b border-slate-200 mb-4">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 ${activeTab === 'vendor' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
          onClick={() => setActiveTab('vendor')}
        >
          Vendor List
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 ${activeTab === 'score' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
          onClick={() => setActiveTab('score')}
        >
          Vendor Score
        </button>
      </div>

      {activeTab === 'vendor' ? (
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
              {startItem}-{endItem} จาก {filtered.length}{searchText ? ` (จาก ${activeVendors.length})` : ""} รายการ
            </span>
          </div>
        )}
        <div ref={vendorTableRef} className="w-full min-w-0">
        <table className="w-full text-left text-xs text-slate-600 table-fixed">
          <thead className="bg-slate-50 text-slate-800 font-semibold border-b border-slate-200">
            <tr>
              {isColumnVisible("vendor", "select") && (
              <th className="py-2 px-2 text-center" style={{ width: vendorTableLayout.scaled.select }}>
                <button type="button" className="p-0.5 rounded hover:bg-slate-200" onClick={() => selectAllOnPage(!allOnPageSelected)} title={allOnPageSelected ? "ยกเลิกเลือกทั้งหมด" : "เลือกทั้งหมดในหน้านี้"}>
                  {allOnPageSelected ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} className="text-slate-400" />}
                </button>
              </th>
              )}
              {isColumnVisible("vendor", "rowNo") && (
              <th className="py-2 px-3 text-center" style={{ width: vendorTableLayout.scaled.rowNo }}>ลำดับ</th>
              )}
              {isColumnVisible("vendor", "code") && (
              <ResizableTh tableId="vendor" colKey="code" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={vendorTableLayout.handleResize} currentWidth={vendorTableLayout.scaled.code}>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 hover:text-blue-600"
                  onClick={toggleCodeSort}
                  title={codeSort === null ? "เรียงจากน้อยไปมาก" : codeSort === "asc" ? "เรียงจากมากไปน้อย" : "ยกเลิกการเรียง"}
                >
                  รหัส
                  {codeSort === "asc" ? (
                    <ChevronUp size={14} />
                  ) : codeSort === "desc" ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronsUpDown size={14} className="text-slate-400" />
                  )}
                </button>
              </ResizableTh>
              )}
              {isColumnVisible("vendor", "name") && (
              <ResizableTh tableId="vendor" colKey="name" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={vendorTableLayout.handleResize} currentWidth={vendorTableLayout.scaled.name}>ชื่อ</ResizableTh>
              )}
              {isColumnVisible("vendor", "address") && (
              <ResizableTh tableId="vendor" colKey="address" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={vendorTableLayout.handleResize} currentWidth={vendorTableLayout.scaled.address}>ที่อยู่</ResizableTh>
              )}
              {isColumnVisible("vendor", "tel") && (
              <ResizableTh tableId="vendor" colKey="tel" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={vendorTableLayout.handleResize} currentWidth={vendorTableLayout.scaled.tel}>โทร</ResizableTh>
              )}
              {isColumnVisible("vendor", "creditTerm") && (
              <ResizableTh tableId="vendor" colKey="creditTerm" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={vendorTableLayout.handleResize} currentWidth={vendorTableLayout.scaled.creditTerm}>เครดิตเทอม</ResizableTh>
              )}
              {isColumnVisible("vendor", "actions") && (
              <th className="py-2 px-3 text-right" style={{ width: vendorTableLayout.scaled.actions }}>Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={["select","rowNo","code","name","address","tel","creditTerm","actions"].filter(k => isColumnVisible("vendor", k)).length} className="py-8 text-center text-slate-400">
                  <Building2 size={32} className="mx-auto mb-2 opacity-30" />
                  ยังไม่มีรายการ Vendor
                </td>
              </tr>
            ) : (
              paginated.map((v, idx) => (
                <tr
                  key={v.id}
                  className={
                    duplicateCodes.has((v.code || "").trim().toLowerCase())
                      ? "bg-red-50 hover:bg-red-100"
                      : "hover:bg-slate-50 odd:bg-white even:bg-slate-50/40"
                  }
                  title={duplicateCodes.has((v.code || "").trim().toLowerCase()) ? "รหัส Vendor ซ้ำ" : undefined}
                >
                  {isColumnVisible("vendor", "select") && (
                  <td className="py-1.5 px-2 text-center">
                    <button type="button" className="p-0.5 rounded hover:bg-slate-200" onClick={() => toggleSelect(v.id)}>
                      {selectedIds.has(v.id) ? <CheckSquare size={15} className="text-blue-600" /> : <Square size={15} className="text-slate-400" />}
                    </button>
                  </td>
                  )}
                  {isColumnVisible("vendor", "rowNo") && (
                  <td className="py-1.5 px-3 text-center text-slate-400 font-mono text-[11px]">{startItem + idx}</td>
                  )}
                  {isColumnVisible("vendor", "code") && (
                  <td className="py-1.5 px-3 font-medium text-slate-700" title={v.code}><span className="cell-text">{v.code || "-"}</span></td>
                  )}
                  {isColumnVisible("vendor", "name") && (
                  <td className="py-1.5 px-3" title={v.name}><span className="cell-text">{v.name || "-"}</span></td>
                  )}
                  {isColumnVisible("vendor", "address") && (
                  <td className="py-1.5 px-3 text-slate-600 max-w-[200px] truncate" title={v.address}><span className="cell-text">{v.address || "-"}</span></td>
                  )}
                  {isColumnVisible("vendor", "tel") && (
                  <td className="py-1.5 px-3" title={v.tel}><span className="cell-text">{v.tel || "-"}</span></td>
                  )}
                  {isColumnVisible("vendor", "creditTerm") && (
                  <td className="py-1.5 px-3" title={v.creditTerm}><span className="cell-text">{v.creditTerm || "-"}</span></td>
                  )}
                  {isColumnVisible("vendor", "actions") && (
                  <td className="py-1.5 px-3 text-right">
                    <div className="flex justify-end gap-1">
                      {isAdmin && duplicateCodes.has(normalizeVendorCode(v.code)) && (
                        <button
                          className="text-red-600 hover:text-red-800 p-1 hover:bg-red-100 rounded"
                          onClick={() => openMergeModal([normalizeVendorCode(v.code)])}
                          title="รวมรายการซ้ำ"
                        >
                          <Merge size={13} />
                        </button>
                      )}
                      {canUseFunction("vendor", "edit") && (
                        <button className="text-blue-500 hover:text-blue-700 p-1 hover:bg-blue-50 rounded" onClick={() => handleOpenEdit(v)} title="แก้ไข"><Edit size={13} /></button>
                      )}
                      {canUseFunction("vendor", "delete") && (
                        <button className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded" onClick={() => handleDelete(v.id)} title="ลบ"><Trash2 size={13} /></button>
                      )}
                    </div>
                  </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </Card>

      ) : (
        <div className="space-y-6">
        <Card className="overflow-hidden">
          <div className="bg-blue-50/50 px-4 py-3 border-b border-slate-100">
            <h3 className="font-bold text-blue-800 text-sm">การประเมิน Payment (PO + Payment)</h3>
            <p className="text-xs text-slate-500 mt-0.5">หัวข้อประเมิน 8 ข้อ: PO (3 ข้อ) และ Payment (5 ข้อ)</p>
          </div>
          <div className="w-full min-w-0 overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 min-w-[1200px]">
              <thead className="bg-slate-50 text-slate-800 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2 px-3">รหัส</th>
                  <th className="py-2 px-3">ชื่อ Vendor</th>
                  <th className="py-2 px-3 text-right text-[10px]" title="PO: การให้คำแนะนำเกี่ยวกับสินค้าและบริการ">PO ข้อ 1</th>
                  <th className="py-2 px-3 text-right text-[10px]" title="PO: มีความรวดเร็วในการเสนอราคา">PO ข้อ 2</th>
                  <th className="py-2 px-3 text-right text-[10px]" title="PO: การประสานงานและให้การสนับสนุนที่เกี่ยวข้อง">PO ข้อ 3</th>
                  <th className="py-2 px-3 text-right text-[10px]" title="Payment: วัสดุที่นำมาใช้ต้องมีคุณภาพและตรงตามข้อกำหนด">PMT ข้อ 1</th>
                  <th className="py-2 px-3 text-right text-[10px]" title="Payment: การจัดสรรแรงงานที่มีความรู้และเพียงพอต่องาน">PMT ข้อ 2</th>
                  <th className="py-2 px-3 text-right text-[10px]" title="Payment: การปฏิบัติตามกฎหมาย ข้อกำหนดของโครงการ และกฎระเบียบข้อบังคับด้านความปลอดภัยและอาชีวอนามัย">PMT ข้อ 3</th>
                  <th className="py-2 px-3 text-right text-[10px]" title="Payment: การจัดสรรเครื่องมือและอุปกรณ์ให้พร้อมใช้งานและตรงตามข้อกำหนดของโครงการและความปลอดภัย">PMT ข้อ 4</th>
                  <th className="py-2 px-3 text-right text-[10px]" title="Payment: การส่งมอบงานตามเวลาที่กำหนด">PMT ข้อ 5</th>
                  <th className="py-2 px-3 text-right">รวมคะแนน</th>
                  <th className="py-2 px-3 text-right">จำนวนประเมิน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paymentScores.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-8 text-center text-slate-400">ไม่มีข้อมูลการประเมิน</td>
                  </tr>
                ) : (
                  paymentScores.map((v) => (
                    <tr key={v.vendorId} className="hover:bg-slate-50 odd:bg-white even:bg-slate-50/40">
                      <td className="py-1.5 px-3 font-medium text-slate-700">{v.vendorCode}</td>
                      <td className="py-1.5 px-3 max-w-[200px] truncate" title={v.vendorName}>{v.vendorName}</td>
                      <td className="py-1.5 px-3 text-right text-slate-500">{v.q1}</td>
                      <td className="py-1.5 px-3 text-right text-slate-500">{v.q2}</td>
                      <td className="py-1.5 px-3 text-right text-slate-500">{v.q3}</td>
                      <td className="py-1.5 px-3 text-right text-slate-500">{v.q4}</td>
                      <td className="py-1.5 px-3 text-right text-slate-500">{v.q5}</td>
                      <td className="py-1.5 px-3 text-right text-slate-500">{v.q6}</td>
                      <td className="py-1.5 px-3 text-right text-slate-500">{v.q7}</td>
                      <td className="py-1.5 px-3 text-right text-slate-500">{v.q8}</td>
                      <td className="py-1.5 px-3 text-right font-bold text-blue-600">{v.totalScore} <span className="text-[10px] text-slate-400 font-normal">/ {v.maxScore}</span></td>
                      <td className="py-1.5 px-3 text-right text-slate-400">{v.count} ครั้ง</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="bg-teal-50/50 px-4 py-3 border-b border-slate-100">
            <h3 className="font-bold text-teal-800 text-sm">การประเมิน CR SP SE RE (PO + Receive)</h3>
            <p className="text-xs text-slate-500 mt-0.5">หัวข้อประเมิน 5 ข้อ: PO (3 ข้อ) และ Receive (2 ข้อ)</p>
          </div>
          <div className="w-full min-w-0 overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 min-w-[800px]">
              <thead className="bg-slate-50 text-slate-800 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2 px-3">รหัส</th>
                  <th className="py-2 px-3">ชื่อ Vendor</th>
                  <th className="py-2 px-3 text-right text-[10px]" title="PO: การให้คำแนะนำเกี่ยวกับสินค้าและบริการ">PO ข้อ 1</th>
                  <th className="py-2 px-3 text-right text-[10px]" title="PO: มีความรวดเร็วในการเสนอราคา">PO ข้อ 2</th>
                  <th className="py-2 px-3 text-right text-[10px]" title="PO: การประสานงานและให้การสนับสนุนที่เกี่ยวข้อง">PO ข้อ 3</th>
                  <th className="py-2 px-3 text-right text-[10px]" title="Receive: สินค้า / บริการ ไม่มีปัญหาและมีคุณภาพตามข้อกำหนด">RCV ข้อ 1</th>
                  <th className="py-2 px-3 text-right text-[10px]" title="Receive: จัดส่งสินค้าตามวันที่กำหนด">RCV ข้อ 2</th>
                  <th className="py-2 px-3 text-right">รวมคะแนน</th>
                  <th className="py-2 px-3 text-right">จำนวนประเมิน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {receiveScores.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">ไม่มีข้อมูลการประเมิน</td>
                  </tr>
                ) : (
                  receiveScores.map((v) => (
                    <tr key={v.vendorId} className="hover:bg-slate-50 odd:bg-white even:bg-slate-50/40">
                      <td className="py-1.5 px-3 font-medium text-slate-700">{v.vendorCode}</td>
                      <td className="py-1.5 px-3 max-w-[200px] truncate" title={v.vendorName}>{v.vendorName}</td>
                      <td className="py-1.5 px-3 text-right text-slate-500">{v.q1}</td>
                      <td className="py-1.5 px-3 text-right text-slate-500">{v.q2}</td>
                      <td className="py-1.5 px-3 text-right text-slate-500">{v.q3}</td>
                      <td className="py-1.5 px-3 text-right text-slate-500">{v.q4}</td>
                      <td className="py-1.5 px-3 text-right text-slate-500">{v.q5}</td>
                      <td className="py-1.5 px-3 text-right font-bold text-teal-600">{v.totalScore} <span className="text-[10px] text-slate-400 font-normal">/ {v.maxScore}</span></td>
                      <td className="py-1.5 px-3 text-right text-slate-400">{v.count} ครั้ง</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10010] animate-in fade-in duration-200">
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

      {mergeState && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10010] animate-in fade-in duration-200">
          <Card className="w-full max-w-3xl p-6">
            <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
              <Merge size={18} /> รวม Vendor รหัสซ้ำ
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              ระบบเลือกรายการหลักให้อัตโนมัติ เอกสาร {VENDOR_REFERENCE_LABELS.join(" / ")} ของรายการซ้ำจะถูกเปลี่ยนไปผูกกับรายการหลัก
              (เปลี่ยนเฉพาะ Vendor ID ชื่อและรหัสที่พิมพ์ไว้บน PO/INV เดิมคงไว้) คะแนนประเมินจะรวมเข้ารายการหลัก
              และรายการซ้ำจะถูกซ่อนจากรายการ (ไม่ลบทิ้ง)
            </p>
            {mergeState.loading && (
              <div className="py-8 text-center text-sm text-slate-500">กำลังตรวจสอบเอกสารที่ผูกกับ Vendor...</div>
            )}
            {mergeState.error && (
              <div className="mb-3 p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg whitespace-pre-line">{mergeState.error}</div>
            )}
            {!mergeState.loading && mergeState.groups.length > 0 && (
              <div className="max-h-[60vh] overflow-y-auto space-y-3 mb-4">
                {mergeState.groups.map((g, index) => (
                  <div key={g.master.id} className={`border rounded-lg p-3 text-xs ${g.included ? "border-slate-300" : "border-slate-200 opacity-50"}`}>
                    <label className="flex items-center gap-2 font-semibold text-slate-800 mb-2 cursor-pointer">
                      <input type="checkbox" checked={g.included} disabled={mergeState.running} onChange={() => toggleMergeGroup(index)} />
                      รหัส {g.code || "-"}
                    </label>
                    <table className="w-full text-left">
                      <thead className="text-slate-500">
                        <tr>
                          <th className="py-1 pr-2 w-24"></th>
                          <th className="py-1 pr-2">ชื่อ</th>
                          <th className="py-1 pr-2">ที่อยู่</th>
                          <th className="py-1 pr-2 w-24">โทร</th>
                          <th className="py-1 w-24 text-right">เอกสารผูก</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[g.master, ...g.duplicates].map((v) => (
                          <tr key={v.id} className={v.id === g.master.id ? "bg-green-50" : "bg-red-50"}>
                            <td className="py-1 px-1 font-medium">{v.id === g.master.id ? "รายการหลัก" : "จะถูกรวม"}</td>
                            <td className="py-1 pr-2">{v.name || "-"}</td>
                            <td className="py-1 pr-2 truncate max-w-[220px]" title={v.address}>{v.address || "-"}</td>
                            <td className="py-1 pr-2">{v.tel || "-"}</td>
                            <td className="py-1 text-right tabular-nums">{g.refCounts[v.id]?.total || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="mt-2 text-slate-600">เหตุผลที่เลือก: {g.reason}</div>
                    <div className="text-slate-600">
                      เอกสารที่จะเปลี่ยน id:{" "}
                      {Object.keys(g.moveCounts).length
                        ? Object.entries(g.moveCounts).map(([label, n]) => `${label} ${n}`).join(", ")
                        : "ไม่มี"}
                    </div>
                    {Object.keys(g.fillPatch).length > 0 && (
                      <div className="text-slate-600">
                        เติมช่องว่างของรายการหลัก: {Object.entries(g.fillPatch).map(([k, val]) => `${k} = ${val}`).join(", ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" disabled={mergeState.running} onClick={() => setMergeState(null)}>ยกเลิก</Button>
              <Button
                onClick={handleConfirmMerge}
                disabled={mergeState.loading || mergeState.running || !mergeState.groups.some((g) => g.included)}
              >
                <Merge size={13} /> {mergeState.running ? "กำลังรวม..." : `ยืนยันรวม (${mergeState.groups.filter((g) => g.included).length} กลุ่ม)`}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {isImportOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10010] animate-in fade-in duration-200">
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
              <Button variant="secondary" disabled={uploadProgress.total > 0} onClick={() => { setIsImportOpen(false); setImportPreview([]); setImportFile(null); setUploadProgress({ done: 0, total: 0 }); }}>ยกเลิก</Button>
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
