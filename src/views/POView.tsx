// @ts-nocheck
import React, { useState, useEffect, useMemo, useCallback, useRef, useContext } from "react";
import {
  Plus, Trash2, Edit, CheckCircle, XCircle, FileText, ChevronDown, ChevronRight, ChevronUp,
  CircleArrowRight, CircleArrowDown, CornerDownRight, AlertCircle, Save, Play,
  PlusCircle, Briefcase, Calendar, MapPin, DollarSign, Info, FileOutput, Search, ListFilter,
  Truck, Package, Paperclip, Clock, Hash, Tag, ClipboardList, FileSpreadsheet, Upload, Download,
  BarChart3, Zap, Building2, ShoppingCart
} from "lucide-react";
import { useAppData } from "../contexts/AppDataContext";
import { useUI } from "../contexts/UIContext";
import { Card, Button, InputGroup, Badge, ProjectSelect, formatCurrency } from "../components/ui";
import ResizableTh from "../components/ResizableTh";
import MaterialAutoComplete from "../components/MaterialAutoComplete";
import { PURCHASE_TYPES, PURCHASE_TYPE_CODES, PURCHASE_TYPE_RENTAL_LABEL, PURCHASE_TYPE_EQUIPMENT, DELIVERY_LOCATIONS, getPurchaseTypeDisplayLabel, COST_CATEGORIES } from "../lib/constants";
import { modalOverlayVariants, modalContentVariants, modalTransition, overlayTransition } from "../lib/animations";
import { motion, AnimatePresence } from "framer-motion";
const POView = React.memo(() => {
  const { prs, pos, projects, budgets, vendors, materials, addData, updateData, deleteData,
          showAlert, openConfirm, userRole, columnWidths, handleColumnResize,
          visibleProjects, handlePOAction } = useAppData();
  const { selectedProjectId, handleProjectChange,
          isFullScreenModalOpen, setIsFullScreenModalOpen,
          expandedPrRows } = useUI();
    // UI States
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isVendorModalOpen, setIsVendorModalOpen] = useState(false);
    const [isPrSelectModalOpen, setIsPrSelectModalOpen] = useState(false);
    const [tempSelectedPrIds, setTempSelectedPrIds] = useState<string[]>([]);
    const [expandedPoRows, setExpandedPoRows] = useState({});
    const [editingPoId, setEditingPoId] = useState(null);

    const togglePoRow = (id) => {
      setExpandedPoRows((prev) => ({
        ...prev,
        [id]: !prev[id],
      }));
    };

    // PO Type options
    const PO_TYPES = [
      { code: "CR", label: "CR — เครดิต" },
      { code: "SP", label: "SP — ผู้รับเหมา" },
      { code: "CC", label: "CC — คอนกรีต" },
      { code: "OL", label: "OL — น้ำมัน" },
      { code: "DC", label: "DC — ค่าแรง" },
      { code: "SM", label: "SM — เงินเดือน" },
      { code: "CA", label: "CA — เงินสด/เงินโอน" },
      { code: "RE", label: "RE — เช่า" },
      { code: "WF", label: "WF — รายจ่ายประจำ" },
    ];

    // Form Data State
    const [formData, setFormData] = useState({
      poNo: "",
      poType: "",
      vendorId: "",
      requiredDate: "",
      vatType: "ex-vat", // "inc-vat" | "ex-vat"
      selectedPrIds: [], // Array of PR IDs
      items: [], // Array of selected items with order details
      note: ""
    });

    // Auto-generate PO No.: PO{YY}{JXX}-{POT}{XXXX}
    // ตัวอย่าง: PO26J01-CC0001
    const generatePoNo = (poTypeCode?: string) => {
      if (!selectedProjectId) return "";
      const currentProject = projects.find((p) => p.id === selectedProjectId);
      if (!currentProject || !currentProject.jobNo) return "";
      const typeCode = poTypeCode || formData.poType;
      if (!typeCode) return "";

      // YY = 2 ตัวท้าย ค.ศ.
      const yy = String(new Date().getFullYear()).slice(-2);

      // JXX = Job No. ไม่มีขีด เช่น J-01 → J01
      const jobRaw = String(currentProject.jobNo).trim();
      const jxx = jobRaw.replace(/-/g, "");

      // prefix คือส่วนที่ใช้นับ running number ของ type นี้
      const prefix = `PO${yy}${jxx}-${typeCode}`;

      // นับ PO ที่มี prefix เดียวกัน (ไม่รวมที่กำลัง edit)
      const existingCount = pos.filter(
        (po) => po.poNo && po.poNo.startsWith(prefix)
      ).length;
      const nextNo = existingCount + 1;
      // XXXX = 4 หลัก 0001..9999
      const suffix = String(nextNo).padStart(4, "0");
      return `${prefix}${suffix}`;
    };

    // Vendor Modal Form State is handled in separate VendorView, 
    // but here we might need a quick add. For now, let's use the main Vendor list.
    // If user wants to add vendor, we can switch view or open a mini-modal.
    // Let's implement a mini vendor modal here for convenience as requested.
    const [newVendor, setNewVendor] = useState({ name: "", code: "", type: "", tel: "" });

    // Helper to calculate used quantity for a specific PR Item
    const getUsedQuantity = (prId, itemIndex) => {
      // Filter other POs that use this PR Item, excluding current editing PO (if any - not impl yet)
      const relevantPOs = pos.filter(po => po.status !== "Rejected");
      let used = 0;
      relevantPOs.forEach(po => {
        if (po.items) {
          po.items.forEach(item => {
            if (item.prId === prId && item.prItemIndex === itemIndex) {
              used += Number(item.quantity) || 0;
            }
          });
        }
      });
      return used;
    };

    // Filter PRs that are Approved and belong to this project
    const approvedPRs = useMemo(() => {
      return prs.filter((pr) => {
        // Basic filtering
        if (pr.projectId !== selectedProjectId) return false;
        if (pr.status !== "Approved" && pr.status !== "PO Issued") return false;

        // Hiding fully ordered PRs
        if (pr.items && pr.items.length > 0) {
          const allItemsUsed = pr.items.every((item, idx) => {
            const used = getUsedQuantity(pr.id, idx);
            // Use tolerance for float comparison just in case, though usually int
            return used >= (item.quantity - 0.01);
          });
          if (allItemsUsed) return false;
        }
        return true;
      });
    }, [prs, selectedProjectId, pos]);

    // Handle toggling a PR selection
    const handlePrToggle = (prId) => {
      const currentIds = formData.selectedPrIds;
      if (currentIds.includes(prId)) {
        // Deselect: Remove PR and its items
        setFormData(prev => ({
          ...prev,
          selectedPrIds: currentIds.filter(id => id !== prId),
          items: prev.items.filter(item => item.prId !== prId)
        }));
      } else {
        // Select: Add PR
        setFormData(prev => ({
          ...prev,
          selectedPrIds: [...currentIds, prId]
        }));
      }
    };

    // Derived list of available items from selected PRs
    const availableItems = useMemo(() => {
      const items = [];
      formData.selectedPrIds.forEach(prId => {
        const pr = approvedPRs.find(p => p.id === prId);
        if (pr && pr.items) {
          pr.items.forEach((item, idx) => {
            const used = getUsedQuantity(pr.id, idx);
            const remaining = item.quantity - used;
            if (remaining > 0) {
              items.push({
                prId: pr.id,
                prNo: pr.prNo,
                prDescription: budgets.find(b => b.code === pr.costCode && b.projectId === pr.projectId)?.description || "-",
                prItemIndex: idx,
                materialNo: item.materialNo || "",
                description: item.description,
                unit: item.unit,
                originalQty: item.quantity,
                usedQty: used,
                remainingQty: remaining,
                costCode: pr.costCode,
                orderQty: remaining,
                price: item.price,
                amount: remaining * item.price
              });
            }
          });
        }
      });
      return items;
    }, [formData.selectedPrIds, approvedPRs, pos, budgets]);

    // คำนวณยอดรวม PR ที่เลือกทั้งหมด (สำหรับ validation Grand Total)
    const selectedPrsTotalAmount = useMemo(() => {
      return formData.selectedPrIds.reduce((sum, prId) => {
        const pr = approvedPRs.find(p => p.id === prId);
        if (!pr || !pr.items) return sum;
        return sum + pr.items.reduce((s, i) => s + Number(i.quantity) * Number(i.price), 0);
      }, 0);
    }, [formData.selectedPrIds, approvedPRs]);

    // Handle Item Checkbox (Include in PO)
    const handleItemToggle = (itemData) => {
      const exists = formData.items.find(i => i.prId === itemData.prId && i.prItemIndex === itemData.prItemIndex);
      if (exists) {
        // Remove
        setFormData(prev => ({
          ...prev,
          items: prev.items.filter(i => !(i.prId === itemData.prId && i.prItemIndex === itemData.prItemIndex))
        }));
      } else {
        // Add
        setFormData(prev => ({
          ...prev,
          items: [...prev.items, {
            prId: itemData.prId,
            prItemIndex: itemData.prItemIndex,
            materialNo: itemData.materialNo || "",
            description: itemData.description,
            prDescription: itemData.prDescription,
            remainingQty: itemData.remainingQty,
            unit: itemData.unit,
            quantity: itemData.orderQty,
            price: itemData.price,
            amount: itemData.amount,
            costCode: itemData.costCode
          }]
        }));
      }
    };

    // Handle Item Detail Change
    const handleItemChange = (prId, prItemIndex, field, value) => {
      setFormData(prev => ({
        ...prev,
        items: prev.items.map(item => {
          if (item.prId === prId && item.prItemIndex === prItemIndex) {
            const updates = { ...item, [field]: value };
            // Recalculate amount if qty or price changes
            if (field === 'quantity' || field === 'price') {
              updates.amount = Number(updates.quantity) * Number(updates.price);
            }
            return updates;
          }
          return item;
        })
      }));
    };

    // Fill all material fields at once from Material master
    const handleItemSelectMaterial = (prId, prItemIndex, mat) => {
      setFormData(prev => ({
        ...prev,
        items: prev.items.map(item => {
          if (item.prId === prId && item.prItemIndex === prItemIndex) {
            const newPrice = mat.price ?? item.price;
            const qty = Number(item.quantity) || 1;
            return {
              ...item,
              materialNo: mat.materialNo || item.materialNo,
              description: mat.name || item.description,
              price: newPrice,
              amount: qty * Number(newPrice),
            };
          }
          return item;
        })
      }));
    };

    const calculateTotals = () => {
      const subtotal = formData.items.reduce((sum, item) => sum + item.amount, 0);
      let vat = 0;
      let total = 0;
      if (formData.vatType === "inc-vat") {
        // Price includes VAT
        // Base = Total / 1.07
        // VAT = Total - Base
        // logic: The amount in line items is "Gross"
        total = subtotal;
      } else {
        // Ex-VAT
        vat = subtotal * 0.07;
        total = subtotal + vat;
      }
      return { subtotal, vat, total };
    };

    const handleSavePO = async () => {
      if (!formData.poType) {
        return showAlert("ข้อมูลไม่ครบ", "กรุณาเลือก PO Type ก่อน", "warning");
      }
      if (!formData.poNo || !formData.vendorId || formData.items.length === 0) {
        return showAlert("ข้อมูลไม่ครบ", "กรุณาระบุ PO No., Vendor, และเลือกรายการสินค้าอย่างน้อย 1 รายการ", "warning");
      }

      const totals = calculateTotals();

      // ตรวจสอบ Grand Total ต้องไม่เกินยอดรวมของ PR ที่เลือก
      if (totals.total > selectedPrsTotalAmount * 1.001) {
        return showAlert(
          "ยอดเกิน PR",
          `Grand Total (${formatCurrency(totals.total)}) ต้องไม่เกินยอดรวมของ PR ที่เลือก (${formatCurrency(selectedPrsTotalAmount)})`,
          "warning"
        );
      }

      const basePayload = {
        poNo: formData.poNo,
        poType: formData.poType,
        projectId: selectedProjectId,
        vendorId: formData.vendorId,
        requiredDate: formData.requiredDate,
        vatType: formData.vatType,
        items: formData.items,
        amount: totals.total,
        status: "Pending PCM",
        createdDate: new Date().toISOString(),
        rejectReason: "",
      };

      let success = false;

      if (editingPoId) {
        // แก้ไข PO ที่ถูก Reject แล้วส่งอนุมัติใหม่
        success = await updateData("pos", editingPoId, basePayload);
      } else {
        // สร้าง PO ใหม่
        success = await addData("pos", basePayload);
        if (success) {
          // Update PR status to "PO Issued" for all involved PRs
          // Note: Ideally, check if PR is *fully* closed, but "PO Issued" is good enough
          const uniquePrIds = [...new Set(formData.items.map(i => i.prId))];
          for (const prId of uniquePrIds) {
            await updateData("prs", prId, { status: "PO Issued" });
          }
        }
      }

      if (success) {
        setIsModalOpen(false);
        setIsFullScreenModalOpen(false);
        setEditingPoId(null);
        setFormData({
          poNo: "", poType: "", vendorId: "", requiredDate: "", vatType: "ex-vat", selectedPrIds: [], items: [], note: ""
        });
        showAlert("สำเร็จ", "บันทึกใบสั่งซื้อ PDF (PO) เรียบร้อย", "success");
      }
    };

    // Quick Add Vendor
    const handleQuickAddVendor = async () => {
      if (!newVendor.name) return;
      const payload = { ...newVendor, code: newVendor.code || "AUTO", type: newVendor.type || "General" };
      const success = await addData("vendors", payload);
      if (success) {
        setIsVendorModalOpen(false);
        setNewVendor({ name: "", code: "", type: "", tel: "" });
        // Ideally select the new vendor automatically, but refetch might delay. 
        // Simplified: User selects from list.
        showAlert("สำเร็จ", "เพิ่ม Vendor เรียบร้อย", "success");
      }
    }

    const handleAction = async (poId, action, reason = "") => {
      const po = pos.find(p => p.id === poId);
      if (!po) return;

      let newStatus = po.status;
      if (action === "reject") {
        await updateData("pos", poId, { status: "Rejected", rejectReason: reason });
        showAlert("ปฏิเสธ", "PO ถูกปฏิเสธแล้ว", "error");
        return;
      }

      // Approve Flow
      if (po.status === "Pending PCM" && (userRole === "PCM" || userRole === "Administrator" /*Testing*/)) {
        newStatus = "Pending GM";
      } else if (po.status === "Pending GM" && (userRole === "GM" || userRole === "Administrator")) {
        newStatus = "Approved";
      }

      if (newStatus !== po.status) {
        await updateData("pos", poId, { status: newStatus, rejectReason: "" });
        showAlert("อนุมัติ", `เลื่อนสถานะเป็น ${newStatus}`, "success");
      }
    };

    // For Reject Modal
    const [rejectPoId, setRejectPoId] = useState(null);
    const [rejectReason, setRejectReason] = useState("");

    return (
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <h2 className="text-xl font-bold text-slate-800">D. Purchase Order (PO)</h2>
          <ProjectSelect
            projects={visibleProjects}
            selectedId={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
          />
          <Button
            onClick={() => {
              setEditingPoId(null);
              setFormData({
                poNo: "",
                poType: "",
                vendorId: "",
                requiredDate: "",
                vatType: "ex-vat",
                selectedPrIds: [],
                items: [],
                note: "",
              });
              setIsModalOpen(true);
              setIsFullScreenModalOpen(true);
            }}
            variant="warning"
          >
            <Plus size={14} /> สร้างใบสั่งซื้อ (PO)
          </Button>
        </div>

        <div className="bg-orange-50 p-3 rounded-md border border-orange-100 text-xs text-orange-800 mb-4 flex items-center gap-2">
          <Info size={16} />
          <strong>Flow การอนุมัติ PO:</strong> Procurement (สร้าง) → Pending PCM → Pending GM → Approved
        </div>

        <Card>
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-900 uppercase font-semibold">
              <tr>
                <ResizableTh tableId="po" colKey="poNo" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.po?.poNo}>PO No.</ResizableTh>
                <ResizableTh tableId="po" colKey="poType" className="py-2 px-3 text-center" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.po?.poType}>Type</ResizableTh>
                <ResizableTh tableId="po" colKey="prNos" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.po?.prNos}>Ref PR No.</ResizableTh>
                <ResizableTh tableId="po" colKey="description" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.po?.description}>Description PR</ResizableTh>
                <ResizableTh tableId="po" colKey="vendor" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.po?.vendor}>Vendor</ResizableTh>
                <ResizableTh tableId="po" colKey="items" className="py-2 px-3 text-center" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.po?.items}>Item</ResizableTh>
                <ResizableTh tableId="po" colKey="amount" className="py-2 px-3 text-right" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.po?.amount}>Amount</ResizableTh>
                <ResizableTh tableId="po" colKey="status" className="py-2 px-3 text-center" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.po?.status}>Status</ResizableTh>
                <th className="py-2 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pos
                .filter((po) => po.projectId === selectedProjectId)
                .map((po) => {
                  const vendor = vendors.find((v) => v.id === po.vendorId);
                  // Count PRs and get details
                  const prIds = po.items ? [...new Set(po.items.map(i => i.prId))] : (po.prRefId ? [po.prRefId] : []);
                  const prNos = prIds.map(id => prs.find(p => p.id === id)?.prNo || "-").join(", ");

                  // Description: Use first item description + count if multiple
                  const firstDesc = po.items && po.items.length > 0 ? po.items[0].description : "-";
                  const descSummary = po.items && po.items.length > 1 ? `${firstDesc} (+${po.items.length - 1})` : firstDesc;

                  return (
                    <React.Fragment key={po.id}>
                      <tr
                        className="hover:bg-blue-50 cursor-pointer transition-colors border-b odd:bg-white even:bg-slate-50"
                        onClick={() => togglePoRow(po.id)}
                      >
                        <td className="py-2 px-3 font-medium text-blue-700" title={po.poNo}><span className="cell-text">{po.poNo}</span></td>
                        <td className="py-2 px-3 text-center">
                          {po.poType && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
                              {po.poType}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-xs" title={prNos}><span className="cell-text">{prNos}</span></td>
                        <td className="py-2 px-3 text-xs text-slate-600" title={descSummary}><span className="cell-text">{descSummary}</span></td>
                        <td className="py-2 px-3" title={vendor?.name || "-"}><span className="cell-text">{vendor?.name || "-"}</span></td>
                        <td className="py-2 px-3 text-center">{po.items ? po.items.length : 1}</td>
                        <td className="py-2 px-3 text-right font-semibold">{formatCurrency(po.amount)}</td>
                        <td className="py-2 px-3 text-center">
                          <div className="flex flex-col items-center">
                            <Badge status={po.status} />
                            {po.rejectReason && (
                              <span className="text-[10px] text-red-500 mt-1 max-w-[100px] truncate" title={po.rejectReason}>
                                {po.rejectReason}
                              </span>
                            )}
                          </div>
                        </td>
                        <td
                          className="py-2 px-3 text-right flex justify-end gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Approval Buttons */}
                          {po.status === "Pending PCM" && (userRole === "PCM" || userRole === "Administrator") && (
                            <>
                              <Button variant="success" size="sm" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(po.id, "approve")}>PCM Approve</Button>
                              <Button variant="danger" size="sm" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => { setRejectPoId(po.id); setRejectReason(""); }}>Reject</Button>
                            </>
                          )}
                          {po.status === "Pending GM" && (userRole === "GM" || userRole === "Administrator") && (
                            <>
                              <Button variant="success" size="sm" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(po.id, "approve")}>GM Approve</Button>
                              <Button variant="danger" size="sm" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => { setRejectPoId(po.id); setRejectReason(""); }}>Reject</Button>
                            </>
                          )}
                          {po.status === "Rejected" && (userRole === "Procurement" || userRole === "Administrator") && (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="px-2 py-0.5 text-[10px]"
                              onClick={() => {
                                // เตรียมฟอร์มสำหรับแก้ไข PO ที่ถูก Reject
                                const prIdsFromItems = po.items ? [...new Set(po.items.map(i => i.prId))] : (po.prRefId ? [po.prRefId] : []);
                                setFormData({
                                  poNo: po.poNo || "",
                                  poType: po.poType || "",
                                  vendorId: po.vendorId || "",
                                  requiredDate: po.requiredDate || "",
                                  vatType: po.vatType || "ex-vat",
                                  selectedPrIds: prIdsFromItems,
                                  items: po.items || [],
                                  note: po.note || "",
                                });
                                setEditingPoId(po.id);
                                setIsModalOpen(true);
                                setIsFullScreenModalOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                          )}

                          <button
                            className="text-red-500 hover:text-red-700 p-1"
                            onClick={() => {
                              openConfirm("ยืนยันการลบ", "คุณต้องการลบ PO นี้ใช่หรือไม่?", async () => await deleteData("pos", po.id), "danger");
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                      {expandedPoRows[po.id] && (
                        <tr className="bg-slate-50/50">
                          <td colSpan={9} className="p-4 border-b cursor-default" onClick={(e) => e.stopPropagation()}>
                            <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm ml-8">
                              <h5 className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-2">
                                <ShoppingCart size={14} /> รายการสั่งซื้อใน PO: {po.poNo}
                              </h5>
                              <div className="flex justify-between items-center text-[11px] text-slate-500 mb-2">
                                <div>
                                  Vendor:{" "}
                                  <span className="font-semibold text-slate-700">
                                    {vendor?.name || "-"}
                                  </span>
                                </div>
                                <div>
                                  วันรับของ:{" "}
                                  <span className="font-semibold text-slate-700">
                                    {po.requiredDate || "-"}
                                  </span>
                                </div>
                              </div>
                              <table className="w-full text-xs text-left">
                                <thead className="bg-orange-50 text-orange-800 border-b border-orange-100">
                                  <tr>
                                    <th className="p-2 w-10 text-center">#</th>
                                    <th className="p-2">รายการสินค้า (Description)</th>
                                    <th className="p-2 text-right">จำนวน</th>
                                    <th className="p-2 text-right">ราคา/หน่วย</th>
                                    <th className="p-2 text-right">รวม</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {po.items && po.items.map((it, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                      <td className="p-2 text-center text-slate-400">{idx + 1}</td>
                                      <td className="p-2 font-medium text-slate-700">{it.description}</td>
                                      <td className="p-2 text-right">{it.quantity} {it.unit}</td>
                                      <td className="p-2 text-right">{formatCurrency(it.price)}</td>
                                      <td className="p-2 text-right font-semibold">{formatCurrency(it.quantity * it.price)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
            </tbody>
          </table>
        </Card>

        {/* Create PO Modal */}
        {isModalOpen && (
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start md:items-center justify-center z-50 p-2 md:p-4"
            initial="hidden"
            animate="visible"
            variants={modalOverlayVariants}
            transition={overlayTransition}
          >
            <motion.div
              className="w-full max-w-5xl h-[82vh] max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
              initial="hidden"
              animate="visible"
              variants={modalContentVariants}
              transition={modalTransition}
            >
              {/* Sticky Header - โทนแดง ขาว ดำ */}
              <div className="relative px-6 py-4 border-b border-black/10 bg-gradient-to-r from-red-600 via-red-700 to-red-900 shrink-0 overflow-hidden">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjA4KSIvPjwvc3ZnPg==')] opacity-50"></div>
                <div className="relative flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center shadow-lg shadow-black/20 border border-white/30">
                      <ShoppingCart size={22} className="text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white tracking-wide">สร้างใบสั่งซื้อ (Create PO)</h3>
                      <p className="text-white/80 text-xs mt-0.5">กรอกข้อมูลให้ครบถ้วนเพื่อสร้างใบสั่งซื้อ</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setIsModalOpen(false);
                      setIsFullScreenModalOpen(false);
                    }}
                    className="text-white/70 hover:text-white hover:bg-white/20 p-2 rounded-xl transition-all duration-200 border border-transparent hover:border-white/30"
                  >
                    <XCircle size={22} />
                  </button>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 bg-gradient-to-b from-slate-50/50 to-white">
                {/* 1. ข้อมูลส่วนหัว (Header) - โทนแดงขาวดำ */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-red-50 to-red-100/80 border-b border-red-200">
                    <div className="w-6 h-6 bg-red-600 rounded-lg flex items-center justify-center">
                      <FileText size={13} className="text-white" />
                    </div>
                    <span className="text-xs font-bold text-red-900 tracking-wide uppercase">1. ข้อมูลส่วนหัว (Header)</span>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-4 gap-x-4 gap-y-4">
                      {/* PO Type */}
                      <div>
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
                          <Tag size={11} className="text-red-500" /> PO Type
                        </label>
                        <select
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white hover:border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all cursor-pointer text-slate-900"
                          value={formData.poType}
                          disabled={!!editingPoId}
                          onChange={(e) => {
                            const newType = e.target.value;
                            const newPoNo = newType ? generatePoNo(newType) : "";
                            setFormData({ ...formData, poType: newType, poNo: newPoNo });
                          }}
                        >
                          <option value="">-- เลือก PO Type --</option>
                          {PO_TYPES.map((t) => (
                            <option key={t.code} value={t.code}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                      {/* PO No. (Auto) */}
                      <div>
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
                          <Hash size={11} className="text-red-500" /> PO No. (เลขที่ใบสั่งซื้อ)
                        </label>
                        <input
                          type="text"
                          readOnly
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-100 text-slate-700 font-mono font-semibold cursor-default"
                          placeholder={formData.poType ? "(Auto)" : "เลือก PO Type ก่อน"}
                          value={formData.poNo}
                        />
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          รูปแบบ: PO{String(new Date().getFullYear()).slice(-2)}JXX-{formData.poType || "TYPE"}XXXX
                        </p>
                      </div>
                      <div className="col-span-2">
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
                          <Building2 size={11} className="text-red-500" /> Vendor (ผู้ขาย)
                        </label>
                        <div className="flex gap-2">
                          <div className="flex-1 relative">
                            <select
                              className="w-full border border-slate-200 rounded-xl px-3 py-2 pl-9 text-sm bg-white hover:border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all cursor-pointer text-slate-900"
                              value={formData.vendorId}
                              onChange={e => setFormData({ ...formData, vendorId: e.target.value })}
                            >
                              <option value="">-- เลือก Vendor --</option>
                              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                            </select>
                            <Building2 className="absolute left-3 top-2.5 text-red-400 pointer-events-none" size={14} />
                          </div>
                          <Button variant="secondary" onClick={() => setIsVendorModalOpen(true)} className="px-3 rounded-xl shrink-0" title="เพิ่ม Vendor">
                            <Plus size={16} />
                          </Button>
                        </div>
                      </div>
                      <div>
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                          <Calendar size={11} className="text-emerald-500" /> กำหนดส่งของ
                        </label>
                        <div className="relative">
                          <input
                            type="date"
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 pl-9 text-sm hover:border-emerald-300 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all"
                            value={formData.requiredDate}
                            onChange={e => setFormData({ ...formData, requiredDate: e.target.value })}
                          />
                          <Calendar className="absolute left-3 top-2.5 text-emerald-400 pointer-events-none" size={14} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. เลือกใบขอซื้อ (Select PRs) */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-2.5 bg-gradient-to-r from-slate-100 to-slate-200/80 border-b border-slate-300">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-slate-800 rounded-lg flex items-center justify-center">
                        <ClipboardList size={13} className="text-white" />
                      </div>
                      <span className="text-xs font-bold text-slate-800 tracking-wide uppercase">2. เลือกใบขอซื้อ (Select PRs)</span>
                    </div>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-slate-800 text-white text-xs font-semibold hover:bg-slate-700 transition-all shadow-sm"
                      onClick={() => {
                        setTempSelectedPrIds([...formData.selectedPrIds]);
                        setIsPrSelectModalOpen(true);
                      }}
                    >
                      <ListFilter size={13} /> เลือก PR
                    </button>
                  </div>
                  <div className="p-5">
                    {formData.selectedPrIds.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                        <ClipboardList size={32} className="mb-2 opacity-40" />
                        <p className="text-sm text-slate-500">ยังไม่ได้เลือกใบขอซื้อ</p>
                        <p className="text-xs mt-0.5">กดปุ่ม "เลือก PR" เพื่อเลือกใบขอซื้อที่อนุมัติแล้ว</p>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {formData.selectedPrIds.map(prId => {
                          const pr = approvedPRs.find(p => p.id === prId);
                          if (!pr) return null;
                          return (
                            <div key={prId} className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-xs">
                              <Hash size={10} className="text-red-500 shrink-0" />
                              <span className="font-semibold text-slate-800">{pr.prNo}</span>
                              <span className="text-slate-500">{pr.requestor}</span>
                              <button
                                type="button"
                                className="ml-1 text-red-400 hover:text-red-600"
                                onClick={() => handlePrToggle(prId)}
                              >
                                <XCircle size={13} />
                              </button>
                            </div>
                          );
                        })}
                        <button
                          type="button"
                          className="flex items-center gap-1 px-3 py-1.5 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700 transition-all"
                          onClick={() => {
                            setTempSelectedPrIds([...formData.selectedPrIds]);
                            setIsPrSelectModalOpen(true);
                          }}
                        >
                          <Plus size={12} /> เพิ่ม/แก้ไข
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. เลือกรายการสินค้า (Select Items) - โทนแดงขาวดำ */}
                {formData.selectedPrIds.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-slate-100 to-slate-200/80 border-b border-slate-300">
                      <div className="w-6 h-6 bg-slate-800 rounded-lg flex items-center justify-center">
                        <Package size={13} className="text-white" />
                      </div>
                      <span className="text-xs font-bold text-slate-800 tracking-wide uppercase">3. เลือกรายการสินค้า (Select Items)</span>
                    </div>
                    <div className="p-4 overflow-x-auto">
                      <table className="w-full text-left text-xs rounded-xl overflow-hidden border border-slate-200">
                        <thead className="bg-slate-100 font-semibold text-slate-800 border-b border-slate-200">
                          <tr>
                            <th className="p-2.5 w-10 text-center">เลือก</th>
                            <ResizableTh tableId="select-items" colKey="prNo" className="p-2.5" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths["select-items"]?.prNo ?? 96}>PR No.</ResizableTh>
                            <ResizableTh tableId="select-items" colKey="materialNo" className="p-2.5" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths["select-items"]?.materialNo ?? 112}>Material No.</ResizableTh>
                            <ResizableTh tableId="select-items" colKey="description" className="p-2.5" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths["select-items"]?.description}>รายการ</ResizableTh>
                            <ResizableTh tableId="select-items" colKey="remainingQty" className="p-2.5" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths["select-items"]?.remainingQty ?? 112}>เหลือ (QTY)</ResizableTh>
                            <ResizableTh tableId="select-items" colKey="orderQty" className="p-2.5" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths["select-items"]?.orderQty ?? 96}>สั่งซื้อ (QTY)</ResizableTh>
                            <ResizableTh tableId="select-items" colKey="price" className="p-2.5" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths["select-items"]?.price ?? 112}>ราคา/หน่วย</ResizableTh>
                            <ResizableTh tableId="select-items" colKey="total" className="p-2.5 text-right" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths["select-items"]?.total ?? 96}>รวม</ResizableTh>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white">
                          {availableItems.map((item) => {
                            const isSelected = formData.items.some(i => i.prId === item.prId && i.prItemIndex === item.prItemIndex);
                            const selectedData = formData.items.find(i => i.prId === item.prId && i.prItemIndex === item.prItemIndex) || item;
                            const inputCls = "w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed focus:border-red-400 focus:ring-1 focus:ring-red-100 bg-white";

                            return (
                              <tr key={`${item.prId}-${item.prItemIndex}`} className={isSelected ? "bg-white hover:bg-slate-50/30" : "bg-slate-50/60 opacity-60"}>
                                <td className="p-2.5 text-center">
                                  <input type="checkbox" checked={isSelected} onChange={() => handleItemToggle(item)} className="rounded border-slate-300 cursor-pointer" />
                                </td>
                                <td className="p-2.5 font-medium text-slate-800 whitespace-nowrap">
                                  {item.prNo}
                                </td>
                                {/* Material No. — editable + autocomplete */}
                                <td className="p-2.5">
                                  <MaterialAutoComplete
                                    value={selectedData.materialNo ?? ""}
                                    className={inputCls}
                                    disabled={!isSelected}
                                    placeholder="ระบุ Material No."
                                    materials={materials}
                                    onChange={(val) => handleItemChange(item.prId, item.prItemIndex, "materialNo", val)}
                                    onSelectMaterial={(mat) => handleItemSelectMaterial(item.prId, item.prItemIndex, mat)}
                                  />
                                </td>
                                {/* รายการ (description) — editable + autocomplete */}
                                <td className="p-2.5">
                                  <MaterialAutoComplete
                                    value={selectedData.description ?? ""}
                                    className={inputCls}
                                    disabled={!isSelected}
                                    placeholder="รายการสินค้า"
                                    materials={materials}
                                    onChange={(val) => handleItemChange(item.prId, item.prItemIndex, "description", val)}
                                    onSelectMaterial={(mat) => handleItemSelectMaterial(item.prId, item.prItemIndex, mat)}
                                  />
                                </td>
                                {/* เหลือ (QTY) — editable */}
                                <td className="p-2.5">
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      className={`${inputCls} text-right`}
                                      disabled={!isSelected}
                                      value={selectedData.remainingQty ?? item.remainingQty}
                                      onChange={(e) => handleItemChange(item.prId, item.prItemIndex, "remainingQty", e.target.value)}
                                    />
                                    <span className="text-slate-400 text-[10px] shrink-0">{item.unit}</span>
                                  </div>
                                </td>
                                {/* สั่งซื้อ (QTY) — editable */}
                                <td className="p-2.5">
                                  <input
                                    type="number"
                                    className={`${inputCls} text-right`}
                                    disabled={!isSelected}
                                    value={selectedData.quantity}
                                    onChange={(e) => handleItemChange(item.prId, item.prItemIndex, "quantity", e.target.value)}
                                  />
                                </td>
                                {/* ราคา/หน่วย — editable */}
                                <td className="p-2.5">
                                  <input
                                    type="number"
                                    className={`${inputCls} text-right`}
                                    disabled={!isSelected}
                                    value={selectedData.price}
                                    onChange={(e) => handleItemChange(item.prId, item.prItemIndex, "price", e.target.value)}
                                  />
                                </td>
                                <td className="p-2.5 text-right font-bold text-slate-800 whitespace-nowrap">
                                  {formatCurrency(Number(selectedData.quantity) * Number(selectedData.price))}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer / Calculation - โทนแดงขาวดำ */}
              <div className="bg-gradient-to-r from-slate-100 to-slate-200/80 border-t border-slate-300 px-6 py-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                    <DollarSign size={16} className="text-slate-600" /> ประเภทภาษี:
                  </span>
                  <label className="flex items-center gap-2 cursor-pointer text-sm px-3 py-1.5 rounded-xl border-2 transition-all duration-200 border-slate-300 hover:border-red-400 hover:bg-red-50/50">
                    <input type="radio" name="vat" value="ex-vat" checked={formData.vatType === "ex-vat"} onChange={() => setFormData({ ...formData, vatType: "ex-vat" })} className="text-red-600" />
                    <span className={formData.vatType === "ex-vat" ? "font-semibold text-red-700" : "text-slate-700"}>Ex-Vat (แยกภาษี)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm px-3 py-1.5 rounded-xl border-2 transition-all duration-200 border-slate-300 hover:border-red-400 hover:bg-red-50/50">
                    <input type="radio" name="vat" value="inc-vat" checked={formData.vatType === "inc-vat"} onChange={() => setFormData({ ...formData, vatType: "inc-vat" })} className="text-red-600" />
                    <span className={formData.vatType === "inc-vat" ? "font-semibold text-red-700" : "text-slate-700"}>Inc-Vat (รวมภาษี)</span>
                  </label>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    {selectedPrsTotalAmount > 0 && (
                      <div className="text-xs text-slate-500 mb-1">
                        ยอดรวม PR ที่เลือก:{" "}
                        <span className="font-semibold text-slate-700">{formatCurrency(selectedPrsTotalAmount)}</span>
                      </div>
                    )}
                    <div className="text-sm text-slate-600">ยอดรวม: {formatCurrency(calculateTotals().subtotal)}</div>
                    <div className="text-sm text-slate-600">VAT (7%): {formatCurrency(calculateTotals().vat)}</div>
                    <div className={`text-xl font-bold mt-0.5 flex items-center gap-1 ${calculateTotals().total > selectedPrsTotalAmount * 1.001 ? "text-red-600" : "text-slate-900"}`}>
                      <DollarSign size={18} className={calculateTotals().total > selectedPrsTotalAmount * 1.001 ? "text-red-600" : "text-red-500"} />
                      Grand Total: {formatCurrency(calculateTotals().total)}
                      {calculateTotals().total > selectedPrsTotalAmount * 1.001 && (
                        <span className="text-xs font-normal text-red-500 ml-1">(เกิน PR!)</span>
                      )}
                    </div>
                  </div>
                  <Button size="lg" className="px-8 shadow-lg shadow-red-200 rounded-xl flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white" onClick={handleSavePO}>
                    <Save size={18} /> บันทึก PO
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* PR Selection Modal */}
        {isPrSelectModalOpen && (
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[80] p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 bg-slate-800 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                    <ClipboardList size={18} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">เลือกใบขอซื้อ (Select PRs)</h3>
                    <p className="text-white/70 text-xs mt-0.5">สามารถเลือกได้หลายรายการ</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsPrSelectModalOpen(false)}
                  className="text-white/60 hover:text-white hover:bg-white/20 p-2 rounded-xl transition-all"
                >
                  <XCircle size={20} />
                </button>
              </div>

              {/* Content — Table View */}
              <div className="flex-1 overflow-y-auto">
                {approvedPRs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                    <ClipboardList size={40} className="mb-3 opacity-40" />
                    <p className="font-medium text-slate-500">ไม่มีใบขอซื้อที่อนุมัติแล้ว</p>
                    <p className="text-xs mt-1">เมื่อมีใบขอซื้อที่ได้รับการอนุมัติ จะแสดงในส่วนนี้</p>
                  </div>
                ) : (
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-700 uppercase font-bold border-b border-slate-200 sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-3 w-12 text-center">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 cursor-pointer"
                            checked={tempSelectedPrIds.length === approvedPRs.length && approvedPRs.length > 0}
                            onChange={(e) => {
                              setTempSelectedPrIds(e.target.checked ? approvedPRs.map(p => p.id) : []);
                            }}
                            title="เลือกทั้งหมด"
                          />
                        </th>
                        <ResizableTh tableId="select-pr" colKey="prNo" className="px-4 py-3" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths["select-pr"]?.prNo}>PR No.</ResizableTh>
                        <ResizableTh tableId="select-pr" colKey="costCode" className="px-4 py-3" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths["select-pr"]?.costCode}>Cost Code</ResizableTh>
                        <ResizableTh tableId="select-pr" colKey="description" className="px-4 py-3" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths["select-pr"]?.description}>รายการงบ</ResizableTh>
                        <ResizableTh tableId="select-pr" colKey="requestor" className="px-4 py-3" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths["select-pr"]?.requestor}>ผู้ขอซื้อ</ResizableTh>
                        <ResizableTh tableId="select-pr" colKey="date" className="px-4 py-3" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths["select-pr"]?.date}>วันที่</ResizableTh>
                        <ResizableTh tableId="select-pr" colKey="items" className="px-4 py-3 text-center" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths["select-pr"]?.items}>สินค้า</ResizableTh>
                        <ResizableTh tableId="select-pr" colKey="amount" className="px-4 py-3 text-right" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths["select-pr"]?.amount}>ยอดรวม</ResizableTh>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {approvedPRs.map(pr => {
                        const isSelected = tempSelectedPrIds.includes(pr.id);
                        const prDesc = pr.items && pr.items.length > 0
                          ? pr.items.map((it) => it.description).filter(Boolean).join(", ")
                          : "-";
                        const totalAmt = pr.items?.reduce((s, i) => s + Number(i.quantity) * Number(i.price), 0) || 0;
                        return (
                          <tr
                            key={pr.id}
                            className={`cursor-pointer select-none transition-colors ${isSelected ? "bg-slate-700/10 hover:bg-slate-700/15" : "hover:bg-slate-50"}`}
                            onClick={() => {
                              setTempSelectedPrIds(prev =>
                                prev.includes(pr.id) ? prev.filter(id => id !== pr.id) : [...prev, pr.id]
                              );
                            }}
                          >
                            <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                className="rounded border-slate-300 cursor-pointer"
                                checked={isSelected}
                                onChange={() => {
                                  setTempSelectedPrIds(prev =>
                                    prev.includes(pr.id) ? prev.filter(id => id !== pr.id) : [...prev, pr.id]
                                  );
                                }}
                              />
                            </td>
                            <td className="px-4 py-3 font-bold text-slate-800">{pr.prNo}</td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-medium">{pr.costCode}</span>
                            </td>
                            <td className="px-4 py-3 max-w-[220px]">
                              <span className="block truncate text-slate-600" title={prDesc}>{prDesc}</span>
                            </td>
                            <td className="px-4 py-3 text-slate-500">{pr.requestor}</td>
                            <td className="px-4 py-3 text-slate-500">{pr.requestDate}</td>
                            <td className="px-4 py-3 text-center">
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-semibold">{pr.items?.length || 0}</span>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatCurrency(totalAmt)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
                <span className="text-sm text-slate-600">
                  {tempSelectedPrIds.length > 0
                    ? <span className="font-semibold text-slate-800">เลือกแล้ว {tempSelectedPrIds.length} ใบ</span>
                    : <span className="text-slate-400">ยังไม่ได้เลือก</span>}
                </span>
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={() => setIsPrSelectModalOpen(false)}>
                    ยกเลิก
                  </Button>
                  <Button
                    className="bg-slate-800 hover:bg-slate-700 text-white px-6 rounded-xl"
                    onClick={() => {
                      // Remove items from PRs that are no longer selected
                      const removedPrIds = formData.selectedPrIds.filter(id => !tempSelectedPrIds.includes(id));
                      setFormData(prev => ({
                        ...prev,
                        selectedPrIds: tempSelectedPrIds,
                        items: prev.items.filter(item => !removedPrIds.includes(item.prId)),
                      }));
                      setIsPrSelectModalOpen(false);
                    }}
                  >
                    ยืนยันการเลือก ({tempSelectedPrIds.length} ใบ)
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Quick Add Vendor Modal */}
        {isVendorModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60]">
            <Card className="w-full max-w-sm p-6">
              <h3 className="font-bold mb-4">เพิ่ม Vendor ด่วน</h3>
              <div className="space-y-3">
                <InputGroup label="ชื่อร้านค้า/บริษัท"><input type="text" className="w-full border p-2 rounded text-sm" value={newVendor.name} onChange={e => setNewVendor({ ...newVendor, name: e.target.value })} /></InputGroup>
                <InputGroup label="เบอร์โทร"><input type="text" className="w-full border p-2 rounded text-sm" value={newVendor.tel} onChange={e => setNewVendor({ ...newVendor, tel: e.target.value })} /></InputGroup>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="secondary" onClick={() => setIsVendorModalOpen(false)}>ยกเลิก</Button>
                <Button onClick={handleQuickAddVendor}>บันทึก</Button>
              </div>
            </Card>
          </div>
        )}

        {/* Reject Modal */}
        {rejectPoId && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60]">
            <Card className="w-full max-w-sm p-6">
              <h3 className="font-bold text-red-600 mb-4">ระบุเหตุผลการปฏิเสธ</h3>
              <textarea className="w-full border p-2 rounded h-24 text-sm" placeholder="เหตุผล..." value={rejectReason} onChange={e => setRejectReason(e.target.value)}></textarea>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="secondary" onClick={() => setRejectPoId(null)}>ยกเลิก</Button>
                <Button variant="danger" onClick={() => { handleAction(rejectPoId, "reject", rejectReason); setRejectPoId(null); }}>ยืนยัน</Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    );
});


// ─── BudgetView (module-level, extracted from AppShell) ─────────────────────────


export default POView;