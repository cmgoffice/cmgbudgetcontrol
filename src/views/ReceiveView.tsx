// @ts-nocheck
import React, { useState, useMemo, useCallback, useRef, useContext } from "react";
import {
  ChevronDown, ChevronRight, Package, Eye, FileText,
  Plus, Camera, X, Check, Clock, ExternalLink, Truck, ImageIcon, List,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppData } from "../contexts/AppDataContext";
import { useUI } from "../contexts/UIContext";
import { AuthContext } from "../auth/AuthContext";
import { Card, Button, Badge, formatCurrency } from "../components/ui";
import { modalOverlayVariants, modalContentVariants, modalTransition, overlayTransition } from "../lib/animations";
import { uploadAttachment } from "../lib/uploadAttachment";

const PO_TYPE_LABELS = {
  CR: "CR — เครดิต",
  SP: "SP — ผู้รับเหมา",
  SE: "SE — บริการ",
  CC: "CC — คอนกรีต",
  OL: "OL — น้ำมัน",
  DC: "DC — ค่าแรง",
  SM: "SM — เงินเดือน",
  CA: "CA — เงินสด/เงินโอน",
  RE: "RE — เช่า",
  WF: "WF — รายจ่ายประจำ",
};

const ReceiveView = React.memo(() => {
  const {
    pos, vendors, receives, projects,
    addData, updateData, showAlert, canUseFunction,
    visibleProjects,
  } = useAppData();
  const { selectedProjectId } = useUI();
  const { user, userData } = useContext(AuthContext);

  const [activeTab, setActiveTab] = useState<"po" | "history">("po");
  const [viewingPO, setViewingPO] = useState(null);
  const [receiveMode, setReceiveMode] = useState(false);
  const [receiveForm, setReceiveForm] = useState([]);
  const [receiveNote, setReceiveNote] = useState("");
  const [receiveDate, setReceiveDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);
  const [expandedTypes, setExpandedTypes] = useState({});
  const [photoPreview, setPhotoPreview] = useState(null);
  const fileInputRefs = useRef({});

  const currentProject = projects.find((p) => p.id === selectedProjectId);

  // Approved POs for selected project
  const approvedPOs = useMemo(() => {
    if (!selectedProjectId) return [];
    return pos.filter(
      (po) => po.projectId === selectedProjectId && po.status === "Approved"
    );
  }, [pos, selectedProjectId]);

  // Receives for this project
  const projectReceives = useMemo(
    () => receives.filter((r) => r.projectId === selectedProjectId),
    [receives, selectedProjectId]
  );

  // Receive summary per PO: { [poId]: { [itemIndex]: totalReceivedQty } }
  const receiveSummary = useMemo(() => {
    const map = {};
    projectReceives.forEach((rcv) => {
      if (!map[rcv.poId]) map[rcv.poId] = {};
      (rcv.items || []).forEach((item) => {
        const idx = item.poItemIndex;
        map[rcv.poId][idx] = (map[rcv.poId][idx] || 0) + Number(item.receivedQty || 0);
      });
    });
    return map;
  }, [projectReceives]);

  // Group POs by poType
  const groupedPOs = useMemo(() => {
    const groups = {};
    approvedPOs.forEach((po) => {
      const type = po.poType || "OTHER";
      if (!groups[type]) groups[type] = [];
      groups[type].push(po);
    });
    return groups;
  }, [approvedPOs]);

  const getReceiveProgress = useCallback(
    (po) => {
      const summary = receiveSummary[po.id] || {};
      const items = po.items || [];
      let totalOrdered = 0;
      let totalReceived = 0;
      items.forEach((item, idx) => {
        totalOrdered += Number(item.quantity || 0);
        totalReceived += Number(summary[idx] || 0);
      });
      return { totalOrdered, totalReceived, done: totalOrdered > 0 && totalReceived >= totalOrdered };
    },
    [receiveSummary]
  );

  const getVendorName = useCallback(
    (vendorId) => {
      const v = vendors.find((vd) => vd.id === vendorId);
      return v ? v.name : "-";
    },
    [vendors]
  );

  const toggleType = (type) => {
    setExpandedTypes((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  // Generate receive number
  const generateReceiveNo = useCallback(() => {
    if (!currentProject?.jobNo) return `RCV-${Date.now()}`;
    const yy = String(new Date().getFullYear()).slice(-2);
    const jobCode = currentProject.jobNo;
    const existing = receives.filter(
      (r) => r.projectId === selectedProjectId && r.receiveNo?.startsWith(`RCV${yy}${jobCode}`)
    );
    const seq = String(existing.length + 1).padStart(4, "0");
    return `RCV${yy}${jobCode}-${seq}`;
  }, [currentProject, receives, selectedProjectId]);

  // Open PO Detail Modal
  const openPODetail = (po) => {
    setViewingPO(po);
    setReceiveMode(false);
    setReceiveNote("");
    setReceiveDate(new Date().toISOString().split("T")[0]);
  };

  // Switch to receive form mode
  const startReceiveMode = () => {
    const po = viewingPO;
    if (!po) return;
    const summary = receiveSummary[po.id] || {};
    const form = (po.items || []).map((item, idx) => {
      const ordered = Number(item.quantity || 0);
      const alreadyReceived = Number(summary[idx] || 0);
      const remaining = Math.max(0, ordered - alreadyReceived);
      return {
        poItemIndex: idx,
        materialNo: item.materialNo || "",
        description: item.description || "",
        unit: item.unit || "",
        orderedQty: ordered,
        alreadyReceived,
        remaining,
        receivedQty: 0,
        photos: [],
        photoFiles: [],
      };
    });
    setReceiveForm(form);
    setReceiveMode(true);
  };

  const updateReceiveItem = (idx, field, value) => {
    setReceiveForm((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, [field]: value } : item
      )
    );
  };

  const handlePhotoAdd = (itemIdx, files) => {
    if (!files || files.length === 0) return;
    setReceiveForm((prev) =>
      prev.map((item, i) => {
        if (i !== itemIdx) return item;
        const newPhotos = [...item.photoFiles];
        const newPreviews = [...item.photos];
        Array.from(files).forEach((file) => {
          newPhotos.push(file);
          newPreviews.push({ url: URL.createObjectURL(file), name: file.name, isLocal: true });
        });
        return { ...item, photoFiles: newPhotos, photos: newPreviews };
      })
    );
  };

  const removePhoto = (itemIdx, photoIdx) => {
    setReceiveForm((prev) =>
      prev.map((item, i) => {
        if (i !== itemIdx) return item;
        const photos = [...item.photos];
        const photoFiles = [...item.photoFiles];
        if (photos[photoIdx]?.isLocal) URL.revokeObjectURL(photos[photoIdx].url);
        photos.splice(photoIdx, 1);
        photoFiles.splice(photoIdx, 1);
        return { ...item, photos, photoFiles };
      })
    );
  };

  // Save receive transaction
  const handleSaveReceive = async () => {
    const po = viewingPO;
    if (!po) return;

    const itemsToSave = receiveForm.filter((item) => item.receivedQty > 0);
    if (itemsToSave.length === 0) {
      return showAlert("ไม่มีรายการ", "กรุณาระบุจำนวนรับอย่างน้อย 1 รายการ", "warning");
    }

    for (const item of itemsToSave) {
      if (item.receivedQty > item.remaining) {
        return showAlert(
          "จำนวนเกิน",
          `"${item.description}" รับได้สูงสุด ${item.remaining} ${item.unit}`,
          "error"
        );
      }
    }

    setSaving(true);
    try {
      const receiveNo = generateReceiveNo();

      // Upload photos
      const savedItems = [];
      for (const item of itemsToSave) {
        const uploadedPhotos = [];
        for (const file of item.photoFiles) {
          const result = await uploadAttachment(file, {
            type: "receive",
            projectId: selectedProjectId,
            subPath: receiveNo,
          });
          uploadedPhotos.push({ url: result.url, name: result.name });
        }
        savedItems.push({
          poItemIndex: item.poItemIndex,
          materialNo: item.materialNo,
          description: item.description,
          unit: item.unit,
          orderedQty: item.orderedQty,
          receivedQty: Number(item.receivedQty),
          photos: uploadedPhotos,
        });
      }

      const receiveData = {
        receiveNo,
        poId: po.id,
        poNo: po.poNo,
        projectId: selectedProjectId,
        items: savedItems,
        receivedDate: receiveDate,
        receivedByUid: user?.uid || null,
        receivedByName: `${userData?.firstName || ""} ${userData?.lastName || ""}`.trim(),
        note: receiveNote,
        createdAt: new Date().toISOString(),
      };

      const success = await addData("receives", receiveData);
      if (!success) {
        setSaving(false);
        return;
      }

      // Check if all items are now fully received → auto Close PO
      const summary = { ...(receiveSummary[po.id] || {}) };
      savedItems.forEach((item) => {
        summary[item.poItemIndex] = (summary[item.poItemIndex] || 0) + item.receivedQty;
      });

      const allItems = po.items || [];
      const allFullyReceived = allItems.every(
        (item, idx) => Number(summary[idx] || 0) >= Number(item.quantity || 0)
      );

      if (allFullyReceived) {
        await updateData("pos", po.id, { status: "Closed PO" });
        showAlert("รับของครบ", `PO ${po.poNo} รับของครบทุกรายการ — สถานะเปลี่ยนเป็น Closed PO`, "success");
      } else {
        await updateData("pos", po.id, { statusNow: "Partial Receive" });
        showAlert("สำเร็จ", `บันทึกรับของ ${receiveNo} เรียบร้อย`, "success");
      }

      setViewingPO(null);
      setReceiveMode(false);
    } catch (e) {
      showAlert("Error", "เกิดข้อผิดพลาด: " + e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  // History for the currently viewed PO
  const poReceiveHistory = useMemo(() => {
    if (!viewingPO) return [];
    return projectReceives
      .filter((r) => r.poId === viewingPO.id)
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }, [viewingPO, projectReceives]);

  const poDescription = (po) => {
    const items = po.items || [];
    if (items.length === 0) return "-";
    const first = items[0]?.description || "-";
    return items.length > 1 ? `${first} (+${items.length - 1} รายการ)` : first;
  };

  // Sorted receive history for the tab (newest first)
  const sortedReceiveHistory = useMemo(() =>
    [...projectReceives].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
    [projectReceives]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-xl font-bold text-slate-800">
          Receive — รับของ
        </h2>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-white rounded-xl shadow-sm border border-slate-200 p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("po")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
            activeTab === "po"
              ? "bg-blue-600 text-white shadow"
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
          }`}
        >
          <Truck size={15} /> รับของ
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
            activeTab === "history"
              ? "bg-blue-600 text-white shadow"
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
          }`}
        >
          <List size={15} /> รายการ Receive
          {sortedReceiveHistory.length > 0 && (
            <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center ${
              activeTab === "history" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
            }`}>
              {sortedReceiveHistory.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Tab: รายการ Receive ── */}
      {activeTab === "history" && (
        <Card className="overflow-hidden">
          {sortedReceiveHistory.length === 0 ? (
            <div className="p-10 text-center text-slate-400">
              <List size={36} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium text-sm">ยังไม่มีประวัติการรับของในโครงการนี้</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-100">
                <tr>
                  <th className="py-2.5 px-4">Receive No.</th>
                  <th className="py-2.5 px-4">วันที่ทำรับ</th>
                  <th className="py-2.5 px-4">PO No.</th>
                  <th className="py-2.5 px-4">Type</th>
                  <th className="py-2.5 px-4">Vendor</th>
                  <th className="py-2.5 px-4 text-center">รายการสินค้า</th>
                  <th className="py-2.5 px-4">ผู้รับของ</th>
                  <th className="py-2.5 px-4">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedReceiveHistory.map((rcv) => {
                  const po = pos.find((p) => p.id === rcv.poId);
                  const vendor = vendors.find((v) => v.id === po?.vendorId);
                  const itemCount = (rcv.items || []).length;
                  return (
                    <tr key={rcv.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-4 font-medium text-blue-700 whitespace-nowrap">
                        {rcv.receiveNo || "-"}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {rcv.receivedDate
                          ? new Date(rcv.receivedDate).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })
                          : "-"}
                      </td>
                      <td className="py-2.5 px-4 font-medium whitespace-nowrap">{rcv.poNo || "-"}</td>
                      <td className="py-2.5 px-4">
                        {po?.poType ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
                            {po.poType}
                          </span>
                        ) : "-"}
                      </td>
                      <td className="py-2.5 px-4 max-w-[180px] truncate" title={vendor?.name || "-"}>
                        {vendor?.name || "-"}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold text-[11px] border border-blue-100">
                          <Package size={10} /> {itemCount} รายการ
                        </span>
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">{rcv.receivedByName || "-"}</td>
                      <td className="py-2.5 px-4 text-slate-400 max-w-[160px] truncate" title={rcv.note || ""}>
                        {rcv.note || "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* ── Tab: รับของ ── */}
      {activeTab === "po" && (approvedPOs.length === 0 ? (
        <Card className="p-8 text-center text-slate-400">
          <Package size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">ไม่มี PO ที่ Approved ในโครงการนี้</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {Object.entries(groupedPOs).map(([type, poList]) => {
            const isExpanded = expandedTypes[type] !== false;
            return (
              <Card key={type} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleType(type)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-200 text-slate-700">
                      {type}
                    </span>
                    <span className="text-sm font-semibold text-slate-700">
                      {PO_TYPE_LABELS[type] || type}
                    </span>
                    <span className="text-xs text-slate-400">({poList.length} PO)</span>
                  </div>
                </button>
                {isExpanded && (
                  <table className="w-full text-left text-xs text-slate-600">
                    <thead className="bg-slate-50/60 text-slate-500 uppercase font-semibold">
                      <tr>
                        <th className="py-2 px-4">PO No.</th>
                        <th className="py-2 px-4">Vendor</th>
                        <th className="py-2 px-4">รายละเอียด</th>
                        <th className="py-2 px-4 text-right">ยอดรวม</th>
                        <th className="py-2 px-4 text-center">สถานะรับของ</th>
                        <th className="py-2 px-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {poList.map((po) => {
                        const progress = getReceiveProgress(po);
                        const pct = progress.totalOrdered > 0
                          ? Math.min(100, Math.round((progress.totalReceived / progress.totalOrdered) * 100))
                          : 0;
                        return (
                          <tr
                            key={po.id}
                            className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                            onClick={() => openPODetail(po)}
                          >
                            <td className="py-2.5 px-4 font-medium text-blue-700">{po.poNo}</td>
                            <td className="py-2.5 px-4">{getVendorName(po.vendorId)}</td>
                            <td className="py-2.5 px-4 max-w-[250px] truncate" title={poDescription(po)}>
                              {poDescription(po)}
                            </td>
                            <td className="py-2.5 px-4 text-right font-semibold">{formatCurrency(po.amount)}</td>
                            <td className="py-2.5 px-4">
                              <div className="flex flex-col items-center gap-1">
                                <div className="w-full max-w-[100px] bg-slate-200 rounded-full h-1.5">
                                  <div
                                    className={`h-1.5 rounded-full transition-all ${pct >= 100 ? "bg-green-500" : pct > 0 ? "bg-blue-500" : "bg-slate-300"}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className={`text-[10px] font-semibold ${pct >= 100 ? "text-green-600" : "text-slate-500"}`}>
                                  {pct}% ({progress.totalReceived}/{progress.totalOrdered})
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-center">
                              <Button
                                variant="outline"
                                className="text-[10px] px-2 py-1"
                                onClick={(e) => { e.stopPropagation(); openPODetail(po); }}
                              >
                                <Eye size={12} /> ดู
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </Card>
            );
          })}
        </div>
      ))}

      {/* ── PO Detail / Receive Modal ── */}
      <AnimatePresence>
        {viewingPO && (
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-start justify-center z-[10010] p-4 overflow-y-auto"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={modalOverlayVariants}
            transition={overlayTransition}
            onClick={() => { if (!saving) { setViewingPO(null); setReceiveMode(false); } }}
          >
            <motion.div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8"
              variants={modalContentVariants}
              transition={modalTransition}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                    {receiveMode ? <Truck size={20} className="text-blue-600" /> : <FileText size={20} className="text-blue-600" />}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">
                      {receiveMode ? "ทำรับของ" : "รายละเอียด PO"}
                    </h3>
                    <p className="text-xs text-slate-400">{viewingPO.poNo}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { if (!saving) { setViewingPO(null); setReceiveMode(false); } }}
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                {!receiveMode ? (
                  /* ── PO Detail View ── */
                  <div className="space-y-5">
                    {/* PO Info Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: "PO No.", value: viewingPO.poNo },
                        { label: "Type", value: PO_TYPE_LABELS[viewingPO.poType] || viewingPO.poType || "-" },
                        { label: "Vendor", value: getVendorName(viewingPO.vendorId) },
                        { label: "ยอดรวม", value: formatCurrency(viewingPO.amount) },
                        { label: "วันที่ PO", value: viewingPO.poDate ? new Date(viewingPO.poDate).toLocaleDateString("th-TH") : "-" },
                        { label: "วันกำหนดส่ง", value: viewingPO.requiredDate || "-" },
                        { label: "สถานะ", value: viewingPO.status },
                        { label: "Receive Type", value: viewingPO.receiveType || "-" },
                      ].map((f) => (
                        <div key={f.label} className="bg-slate-50 rounded-lg p-3">
                          <p className="text-[10px] text-slate-400 uppercase font-semibold">{f.label}</p>
                          <p className="text-sm font-medium text-slate-800 truncate" title={String(f.value)}>{f.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* PO Items Table */}
                    <div>
                      <h4 className="text-sm font-bold text-slate-700 mb-2">รายการสินค้า ({(viewingPO.items || []).length} รายการ)</h4>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-xs text-slate-600">
                          <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                            <tr>
                              <th className="py-2 px-3 text-left">#</th>
                              <th className="py-2 px-3 text-left">รหัสวัสดุ</th>
                              <th className="py-2 px-3 text-left">รายละเอียด</th>
                              <th className="py-2 px-3 text-center">หน่วย</th>
                              <th className="py-2 px-3 text-right">สั่งซื้อ</th>
                              <th className="py-2 px-3 text-right">รับแล้ว</th>
                              <th className="py-2 px-3 text-right">คงเหลือ</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(viewingPO.items || []).map((item, idx) => {
                              const received = receiveSummary[viewingPO.id]?.[idx] || 0;
                              const remaining = Math.max(0, Number(item.quantity || 0) - received);
                              return (
                                <tr key={idx} className={remaining === 0 ? "bg-green-50/50" : ""}>
                                  <td className="py-2 px-3 text-slate-400">{idx + 1}</td>
                                  <td className="py-2 px-3 font-mono text-[10px]">{item.materialNo || "-"}</td>
                                  <td className="py-2 px-3">{item.description || "-"}</td>
                                  <td className="py-2 px-3 text-center">{item.unit || "-"}</td>
                                  <td className="py-2 px-3 text-right font-semibold">{item.quantity || 0}</td>
                                  <td className="py-2 px-3 text-right font-semibold text-blue-600">{received}</td>
                                  <td className={`py-2 px-3 text-right font-semibold ${remaining === 0 ? "text-green-600" : "text-orange-600"}`}>
                                    {remaining}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* PDF Thumbnail */}
                    {viewingPO.pdfUrl && (
                      <div>
                        <h4 className="text-sm font-bold text-slate-700 mb-2">เอกสาร PDF</h4>
                        <div className="inline-block rounded-2xl bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 border border-indigo-100 p-3 shadow-sm">
                          {/* iframe thumbnail — pointer-events-none ป้องกัน scroll/interact */}
                          <div
                            className="relative w-[220px] rounded-xl overflow-hidden border border-indigo-100 shadow-md bg-white cursor-pointer group"
                            onClick={() => window.open(viewingPO.pdfUrl, "_blank")}
                            title="คลิกเพื่อเปิด PDF"
                          >
                            <iframe
                              src={`${viewingPO.pdfUrl}#view=FitH&toolbar=0&navpanes=0&scrollbar=0`}
                              title="PO PDF preview"
                              className="w-full border-0 pointer-events-none select-none"
                              style={{ height: 290, transform: "scale(1)", transformOrigin: "top left" }}
                              scrolling="no"
                            />
                            {/* overlay เมื่อ hover */}
                            <div className="absolute inset-0 bg-indigo-600/0 group-hover:bg-indigo-600/10 transition-colors flex items-center justify-center">
                              <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 text-indigo-700 text-[10px] font-semibold px-3 py-1.5 rounded-full shadow flex items-center gap-1">
                                <ExternalLink size={11} /> เปิดดู PDF
                              </span>
                            </div>
                          </div>
                          {/* ชื่อไฟล์ + ปุ่ม */}
                          <div className="mt-2 w-[220px] flex items-center justify-between">
                            <p className="text-[10px] text-indigo-500 font-medium truncate max-w-[150px]">
                              {viewingPO.poNo}.pdf
                            </p>
                            <a
                              href={viewingPO.pdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-600 text-[10px] font-semibold transition-colors"
                            >
                              <ExternalLink size={10} /> เปิด
                            </a>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Receive History */}
                    {poReceiveHistory.length > 0 && (
                      <div>
                        <h4 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                          <Clock size={14} /> ประวัติรับของ ({poReceiveHistory.length} ครั้ง)
                        </h4>
                        <div className="space-y-2">
                          {poReceiveHistory.map((rcv) => (
                            <div key={rcv.id} className="border rounded-lg p-3 bg-slate-50/50">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs font-bold text-blue-700">{rcv.receiveNo}</span>
                                <span className="text-[10px] text-slate-400">
                                  {rcv.receivedDate} | {rcv.receivedByName || "-"}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {(rcv.items || []).map((item, i) => (
                                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border rounded text-[10px]">
                                    {item.description}: <strong className="text-blue-600">{item.receivedQty}</strong> {item.unit}
                                    {item.photos?.length > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => setPhotoPreview(item.photos)}
                                        className="text-slate-400 hover:text-blue-500"
                                      >
                                        <ImageIcon size={10} />
                                      </button>
                                    )}
                                  </span>
                                ))}
                              </div>
                              {rcv.note && <p className="text-[10px] text-slate-500 mt-1">หมายเหตุ: {rcv.note}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* ── Receive Form ── */
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">วันที่รับของ</label>
                        <input
                          type="date"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                          value={receiveDate}
                          onChange={(e) => setReceiveDate(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">หมายเหตุ</label>
                        <input
                          type="text"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                          placeholder="ระบุหมายเหตุ (ถ้ามี)"
                          value={receiveNote}
                          onChange={(e) => setReceiveNote(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-xs text-slate-600">
                        <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                          <tr>
                            <th className="py-2 px-3 text-left">#</th>
                            <th className="py-2 px-3 text-left">รายละเอียด</th>
                            <th className="py-2 px-3 text-center">หน่วย</th>
                            <th className="py-2 px-3 text-right">สั่ง</th>
                            <th className="py-2 px-3 text-right">รับแล้ว</th>
                            <th className="py-2 px-3 text-right">คงเหลือ</th>
                            <th className="py-2 px-3 text-center w-[100px]">จำนวนรับ</th>
                            <th className="py-2 px-3 text-center">รูปถ่าย</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {receiveForm.map((item, idx) => (
                            <tr key={idx} className={item.remaining === 0 ? "bg-green-50/50 opacity-60" : ""}>
                              <td className="py-2 px-3 text-slate-400">{idx + 1}</td>
                              <td className="py-2 px-3">
                                <p className="font-medium">{item.description || "-"}</p>
                                {item.materialNo && (
                                  <p className="text-[10px] text-slate-400 font-mono">{item.materialNo}</p>
                                )}
                              </td>
                              <td className="py-2 px-3 text-center">{item.unit || "-"}</td>
                              <td className="py-2 px-3 text-right">{item.orderedQty}</td>
                              <td className="py-2 px-3 text-right text-blue-600 font-semibold">{item.alreadyReceived}</td>
                              <td className="py-2 px-3 text-right text-orange-600 font-semibold">{item.remaining}</td>
                              <td className="py-2 px-3">
                                {item.remaining > 0 ? (
                                  <input
                                    type="number"
                                    min={0}
                                    max={item.remaining}
                                    step="any"
                                    className="w-full border border-slate-200 rounded px-2 py-1 text-sm text-center focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                                    value={item.receivedQty || ""}
                                    onChange={(e) => {
                                      const val = Math.min(Number(e.target.value) || 0, item.remaining);
                                      updateReceiveItem(idx, "receivedQty", val);
                                    }}
                                  />
                                ) : (
                                  <span className="flex items-center justify-center text-green-500">
                                    <Check size={14} /> ครบ
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-center">
                                {item.remaining > 0 && (
                                  <div className="flex flex-col items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (!fileInputRefs.current[idx]) {
                                          const input = document.createElement("input");
                                          input.type = "file";
                                          input.accept = "image/*";
                                          input.multiple = true;
                                          input.onchange = (e) => handlePhotoAdd(idx, e.target.files);
                                          fileInputRefs.current[idx] = input;
                                        }
                                        fileInputRefs.current[idx].click();
                                      }}
                                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-100 text-slate-500 hover:text-blue-600 transition-colors"
                                      title="แนบรูปถ่าย"
                                    >
                                      <Camera size={14} />
                                    </button>
                                    {item.photos.length > 0 && (
                                      <div className="flex flex-wrap gap-1 max-w-[120px]">
                                        {item.photos.map((photo, pi) => (
                                          <div key={pi} className="relative group">
                                            <img
                                              src={photo.url}
                                              alt={photo.name}
                                              className="w-8 h-8 rounded object-cover border cursor-pointer"
                                              onClick={() => setPhotoPreview([photo])}
                                            />
                                            <button
                                              type="button"
                                              onClick={() => removePhoto(idx, pi)}
                                              className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                              <X size={8} />
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
                {!receiveMode ? (
                  <>
                    <Button variant="secondary" onClick={() => { setViewingPO(null); setReceiveMode(false); }}>
                      ปิด
                    </Button>
                    {canUseFunction("receive", "receive") && (() => {
                      const progress = getReceiveProgress(viewingPO);
                      return !progress.done;
                    })() && (
                      <Button onClick={startReceiveMode}>
                        <Truck size={14} /> ทำรับของ
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <Button variant="secondary" onClick={() => setReceiveMode(false)} disabled={saving}>
                      ย้อนกลับ
                    </Button>
                    <Button onClick={handleSaveReceive} disabled={saving}>
                      {saving ? (
                        <>
                          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" strokeOpacity=".25" />
                            <path d="M12 2a10 10 0 0 1 10 10" />
                          </svg>
                          กำลังบันทึก...
                        </>
                      ) : (
                        <>
                          <Check size={14} /> บันทึกรับของ
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Photo Preview Modal ── */}
      <AnimatePresence>
        {photoPreview && (
          <motion.div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[10020] p-4"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={modalOverlayVariants}
            transition={overlayTransition}
            onClick={() => setPhotoPreview(null)}
          >
            <motion.div
              className="bg-white rounded-xl p-4 max-w-2xl max-h-[80vh] overflow-auto"
              variants={modalContentVariants}
              transition={modalTransition}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-slate-800">รูปถ่ายสินค้า</h4>
                <button type="button" onClick={() => setPhotoPreview(null)} className="p-1 rounded hover:bg-slate-100">
                  <X size={18} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {photoPreview.map((photo, i) => (
                  <div key={i} className="border rounded-lg overflow-hidden">
                    <img src={photo.url} alt={photo.name} className="w-full h-auto max-h-[400px] object-contain" />
                    <p className="text-[10px] text-slate-400 p-1 truncate">{photo.name}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default ReceiveView;
