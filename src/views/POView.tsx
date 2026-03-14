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
import { Card, Button, InputGroup, Badge, formatCurrency } from "../components/ui";
import ResizableTh from "../components/ResizableTh";
import MaterialAutoComplete from "../components/MaterialAutoComplete";
import { PURCHASE_TYPES, PURCHASE_TYPE_CODES, PURCHASE_TYPE_RENTAL_LABEL, PURCHASE_TYPE_EQUIPMENT, DELIVERY_LOCATIONS, getPurchaseTypeDisplayLabel, COST_CATEGORIES } from "../lib/constants";
import { modalOverlayVariants, modalContentVariants, modalTransition, overlayTransition } from "../lib/animations";
import { motion, AnimatePresence } from "framer-motion";
import { generatePOPdfBytes, uploadGeneratedPdf } from "../lib/pdfForms";
const POView = React.memo(() => {
  const { prs, pos, projects, budgets, vendors, materials, addData, updateData, deleteData, loadVendors, loadMaterials,
          showAlert, openConfirm, userRole, columnWidths, handleColumnResize,
          visibleProjects, handlePOAction } = useAppData();
  const { selectedProjectId,
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
      { code: "SE", label: "SE — บริการ" },
      { code: "CC", label: "CC — คอนกรีต" },
      { code: "OL", label: "OL — น้ำมัน" },
      { code: "DC", label: "DC — ค่าแรง" },
      { code: "SM", label: "SM — เงินเดือน" },
      { code: "CA", label: "CA — เงินสด/เงินโอน" },
      { code: "RE", label: "RE — เช่า" },
      { code: "WF", label: "WF — รายจ่ายประจำ" },
    ];

    const RECEIVE_TYPES = [
      { value: "Material", label: "Material" },
      { value: "Subcontractor", label: "Subcontractor" },
      { value: "Service", label: "Service" },
      { value: "EQM", label: "EQM" },
      { value: "Receive Auto", label: "Receive Auto" },
      { value: "RE", label: "RE" },
    ];
    const getDefaultReceiveType = (poType: string) => {
      if (!poType) return "";
      if (poType === "SP") return "Subcontractor";
      if (poType === "SE") return "Service";
      if (poType === "RE") return "RE";
      if (["CA", "CR"].includes(poType)) return "EQM";
      if (["CR", "CA", "OL"].includes(poType)) return "Material";
      if (["CC", "WF", "DC", "SM"].includes(poType)) return "Receive Auto";
      return "Material";
    };

    // Form Data State
    const [formData, setFormData] = useState({
      poNo: "",
      poType: "",
      receiveType: "",
      vendorId: "",
      requiredDate: "",
      vatType: "ex-vat", // "inc-vat" | "ex-vat"
      selectedPrIds: [], // Array of PR IDs
      items: [], // Array of selected items with order details
      note: "",
      discount: 0,
    });
    const [manualVatOverride, setManualVatOverride] = useState<number | null>(null);
    const [vatEditOpen, setVatEditOpen] = useState(false);
    const [vatEditValue, setVatEditValue] = useState("");
    const [discountEnabled, setDiscountEnabled] = useState(false);
    const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);

    // โหลด vendors + materials เมื่อเข้าหน้า PO (ลดโควต้าเปิดแอป)
    useEffect(() => {
      loadVendors();
      loadMaterials();
    }, [loadVendors, loadMaterials]);

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

    // Helper: ยอดที่ถูก PO ใช้ไปแล้ว (ไม่นับ PO ที่ Rejected และไม่นับ PO ที่กำลังแก้ถ้ามี)
    const getUsedQuantity = (prId, itemIndex, excludePoId) => {
      const relevantPOs = pos.filter(po => po.status !== "Rejected" && po.id !== excludePoId);
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

    // ยอดเงินจาก PO ที่อ้างอิง PR นี้ (ไม่นับ PO ที่ Rejected และไม่นับ PO ที่กำลังแก้)
    const getUsedAmountByPR = (prId, excludePoId) => {
      const relevantPOs = pos.filter(po => po.status !== "Rejected" && po.id !== excludePoId);
      let total = 0;
      relevantPOs.forEach(po => {
        if (po.items) {
          po.items.forEach(item => {
            if (item.prId === prId) total += Number(item.amount) || 0;
          });
        }
      });
      return total;
    };

    // รายการ PO ที่ใช้ PR item นี้ (สำหรับแสดงใน Popup "เปิด PO ไปแล้ว")
    const getUsedByPOs = (prId, itemIndex, excludePoId) => {
      const relevantPOs = pos.filter(po => po.status !== "Rejected" && po.id !== excludePoId);
      const list = [];
      relevantPOs.forEach(po => {
        if (po.items) {
          const has = po.items.some(item => item.prId === prId && item.prItemIndex === itemIndex);
          if (has) list.push({ poNo: po.poNo || po.id, createdDate: po.createdDate || "" });
        }
      });
      return list;
    };

    // รายการ PR ที่ให้เลือกได้ใน "เลือกใบขอซื้อ": Approve แล้ว, ยังไม่ Closed, ยอดเงินยังไม่หมด
    // - แสดงเฉพาะ PR ที่สถานะ Approved หรือ PO Issued
    // - ไม่แสดงถ้าสถานะ Closed PR
    // - ไม่แสดงถ้ายอดเงินที่ PO ใช้ไปแล้ว ≥ ยอด PR (เช็คเฉพาะยอดเงิน)
    const approvedPRs = useMemo(() => {
      return prs.filter((pr) => {
        if (pr.projectId !== selectedProjectId) return false;
        if (pr.status === "Closed PR") return false;
        if (pr.status !== "Approved" && pr.status !== "PO Issued") return false;

        const prTotal = Number(pr.totalAmount) || 0;
        const usedAmount = getUsedAmountByPR(pr.id, editingPoId);
        if (prTotal > 0 && usedAmount >= prTotal - 0.01) return false;

        return true;
      });
    }, [prs, selectedProjectId, pos, editingPoId]);

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

    // รายการจาก PR ที่เลือก — แสดงทุกรายการ (รวมที่เปิด PO ไปแล้ว) เพื่อให้กดเพิ่มได้แบบอิสระ
    const availableItems = useMemo(() => {
      const items = [];
      formData.selectedPrIds.forEach(prId => {
        const pr = approvedPRs.find(p => p.id === prId);
        if (pr && pr.items) {
          pr.items.forEach((item, idx) => {
            const used = getUsedQuantity(pr.id, idx, editingPoId);
            const originalQty = Number(item.quantity) || 0;
            const remaining = Math.max(0, originalQty - used);
            const orderQtyDefault = remaining > 0 ? remaining : originalQty;
            const price = Number(item.price) || 0;
            items.push({
              prId: pr.id,
              prNo: pr.prNo,
              prDescription: budgets.find(b => b.code === pr.costCode && b.projectId === pr.projectId)?.description || "-",
              prItemIndex: idx,
              materialNo: item.materialNo || "",
              description: item.description,
              unit: item.unit,
              originalQty,
              usedQty: used,
              remainingQty: remaining,
              alreadyOpenedInPO: used > 0,
              costCode: pr.costCode,
              orderQty: orderQtyDefault,
              price,
              amount: orderQtyDefault * price
            });
          });
        }
      });
      return items;
    }, [formData.selectedPrIds, approvedPRs, pos, budgets, editingPoId]);

    // ยอดคงเหลือของแต่ละ PR (ยอด PR - ยอดที่ PO ใช้ไปแล้ว)
    const getPrRemainingAmount = (prId) => {
      const pr = approvedPRs.find(p => p.id === prId) || prs.find(p => p.id === prId);
      if (!pr) return 0;
      const total = Number(pr.totalAmount) || 0;
      const used = getUsedAmountByPR(prId, editingPoId);
      return Math.max(0, total - used);
    };

    // ยอดรวม PR ที่เลือก = ผลรวมยอดคงเหลือของ PR ที่เลือก (สำหรับ validation Grand Total)
    const selectedPrsTotalAmount = useMemo(() => {
      return formData.selectedPrIds.reduce((sum, prId) => sum + getPrRemainingAmount(prId), 0);
    }, [formData.selectedPrIds, approvedPRs, prs, pos, editingPoId]);

    const addItemToForm = (itemData) => {
      setFormData(prev => ({
        ...prev,
        items: [...prev.items, {
          prId: itemData.prId,
          prItemIndex: itemData.prItemIndex,
          materialNo: itemData.materialNo || "",
          description: itemData.description || "",
          unit: itemData.unit || "",
          quantity: itemData.orderQty ?? itemData.remainingQty ?? 1,
          price: itemData.price ?? 0,
          amount: (itemData.orderQty ?? itemData.remainingQty ?? 1) * (itemData.price ?? 0),
          remainingQty: itemData.remainingQty,
          costCode: itemData.costCode
        }]
      }));
    };

    // Handle Item Checkbox (Include in PO) — ถ้ารายการ "เปิด PO ไปแล้ว" จะเด้ง Popup ยืนยันก่อน
    const handleItemToggle = (itemData) => {
      const exists = formData.items.find(i => i.prId === itemData.prId && i.prItemIndex === itemData.prItemIndex);
      if (exists) {
        setFormData(prev => ({
          ...prev,
          items: prev.items.filter(i => !(i.prId === itemData.prId && i.prItemIndex === itemData.prItemIndex))
        }));
      } else {
        if (itemData.alreadyOpenedInPO) {
          const usedBy = getUsedByPOs(itemData.prId, itemData.prItemIndex, editingPoId);
          const msg = usedBy.length > 0
            ? `รายการนี้เปิด PO ไปแล้ว\n\nPO เลขที่: ${usedBy.map(p => p.poNo).join(", ")}\nวันที่: ${usedBy.map(p => p.createdDate ? new Date(p.createdDate).toLocaleDateString("th-TH") : "-").join(", ")}\n\nต้องการเปิดซ้ำหรือไม่?`
            : "รายการนี้ถูกเปิด PO ไปแล้ว ต้องการเปิดซ้ำหรือไม่?";
          openConfirm("ยืนยันเปิดรายการซ้ำ", msg, () => addItemToForm(itemData), "warning");
        } else {
          addItemToForm(itemData);
        }
      }
    };

    const handleAddItemClick = (itemData) => {
      const exists = formData.items.some(i => i.prId === itemData.prId && i.prItemIndex === itemData.prItemIndex);
      if (exists) return;
      if (itemData.alreadyOpenedInPO) {
        const usedBy = getUsedByPOs(itemData.prId, itemData.prItemIndex, editingPoId);
        const msg = usedBy.length > 0
          ? `รายการนี้เปิด PO ไปแล้ว\n\nPO เลขที่: ${usedBy.map(p => p.poNo).join(", ")}\nวันที่: ${usedBy.map(p => p.createdDate ? new Date(p.createdDate).toLocaleDateString("th-TH") : "-").join(", ")}\n\nต้องการเปิดซ้ำหรือไม่?`
          : "รายการนี้ถูกเปิด PO ไปแล้ว ต้องการเปิดซ้ำหรือไม่?";
        openConfirm("ยืนยันเปิดรายการซ้ำ", msg, () => addItemToForm(itemData), "warning");
      } else {
        addItemToForm(itemData);
      }
    };

    // เพิ่มรายการว่าง (กรอกอิสระ) — ไม่จำกัดจำนวน, auto-fill PR No. จาก PR ที่เลือก
    const addFreeItem = () => {
      setFormData(prev => {
        const firstPrId = prev.selectedPrIds[0];
        const firstPr = approvedPRs.find(p => p.id === firstPrId);
        const linkedPrNo = firstPr?.prNo || "";
        return {
          ...prev,
          items: [...prev.items, {
            id: `free-${Date.now()}`,
            prId: null,
            prItemIndex: -1,
            materialNo: "",
            description: "",
            unit: "",
            quantity: 1,
            price: 0,
            amount: 0,
            linkedPrNo
          }]
        };
      });
    };

    const handleFreeItemChange = (freeId, field, value) => {
      setFormData(prev => ({
        ...prev,
        items: prev.items.map(item => {
          if (item.id !== freeId) return item;
          const updates = { ...item, [field]: value };
          if (field === "quantity" || field === "price") {
            updates.amount = (Number(updates.quantity) || 0) * (Number(updates.price) || 0);
          }
          return updates;
        })
      }));
    };
    const removeFreeItem = (freeId) => {
      setFormData(prev => ({ ...prev, items: prev.items.filter(i => i.id !== freeId) }));
    };

    const setFreeItemMaterial = (freeId, mat) => {
      const qty = 1;
      const price = Number(mat?.price) || 0;
      setFormData(prev => ({
        ...prev,
        items: prev.items.map(item => {
          if (item.id !== freeId) return item;
          return { ...item, materialNo: mat?.materialNo || "", description: mat?.name || "", unit: mat?.unit || "", price, quantity: qty, amount: qty * price };
        })
      }));
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
      const discount = Number(formData.discount) || 0;
      const afterDiscount = Math.max(0, subtotal - discount);
      let vat = 0;
      let total = 0;
      if (manualVatOverride != null && !isNaN(manualVatOverride)) {
        vat = manualVatOverride;
        total = afterDiscount + vat;
      } else if (formData.vatType === "inc-vat") {
        total = afterDiscount;
      } else {
        vat = afterDiscount * 0.07;
        total = afterDiscount + vat;
      }
      return { subtotal, discount, vat, total };
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

      // สร้าง PDF และ upload ก่อน save (มี timeout 8s เพื่อไม่ให้ค้าง)
      let pdfUrl: string | undefined;
      try {
        const vendor = vendors.find((v: any) => v.id === formData.vendorId) || null;
        const project = projects.find((p: any) => p.id === selectedProjectId) || null;
        const draftPayload = {
          poNo: formData.poNo, poType: formData.poType,
          receiveType: formData.receiveType,
          projectId: selectedProjectId, vendorId: formData.vendorId,
          requiredDate: formData.requiredDate, vatType: formData.vatType,
          items: formData.items, amount: totals.total,
          discount: formData.discount || 0,
          ...(manualVatOverride != null && !isNaN(manualVatOverride) ? { manualVat: manualVatOverride } : {}),
        };
        const safePONo = formData.poNo.replace(/[^a-zA-Z0-9\-_]/g, "_");
        const safeProjId = selectedProjectId || "unknown";
        const generateAndUpload = async () => {
          const bytes = await generatePOPdfBytes(draftPayload, { vendor, project });
          return await uploadGeneratedPdf(bytes, `generated/pos/${safeProjId}/${safePONo}.pdf`);
        };
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("PDF timeout")), 8000)
        );
        pdfUrl = await Promise.race([generateAndUpload(), timeout]);
      } catch (e) {
        console.warn("[PO Save] PDF generation skipped:", e);
      }

      const basePayload = {
        poNo: formData.poNo,
        poType: formData.poType,
        ...(formData.receiveType ? { receiveType: formData.receiveType } : {}),
        projectId: selectedProjectId,
        vendorId: formData.vendorId,
        requiredDate: formData.requiredDate,
        vatType: formData.vatType,
        items: formData.items,
        amount: totals.total,
        grandTotal: totals.total,
        discount: formData.discount || 0,
        ...(manualVatOverride != null && !isNaN(manualVatOverride) ? { manualVat: manualVatOverride } : {}),
        ...(pdfUrl ? { pdfUrl } : {}),
        status: "Pending PCM",
        createdDate: new Date().toISOString(),
        poDate: new Date().toISOString(),
        rejectReason: "",
      };

      let success = false;

      if (editingPoId) {
        success = await updateData("pos", editingPoId, basePayload);
      } else {
        success = await addData("pos", basePayload);
        if (success) {
          const uniquePrIds = [...new Set(formData.items.map((i: any) => i.prId).filter(Boolean))];
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
          poNo: "", poType: "", receiveType: "", vendorId: "", requiredDate: "", vatType: "ex-vat", selectedPrIds: [], items: [], note: "", discount: 0
        });
        setManualVatOverride(null);
        setVatEditOpen(false);
        setVatEditValue("");
        setDiscountEnabled(false);
        if (pdfUrl) {
          showAlert("สำเร็จ", "บันทึก PO และสร้าง PDF เรียบร้อย — กดดาวน์โหลดได้จากตาราง PO", "success");
        } else {
          showAlert("สำเร็จ", "บันทึก PO เรียบร้อย (PDF จะสร้างเมื่อตั้งค่า Firebase Storage Rules)", "success");
        }
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
                discount: 0,
              });
              setManualVatOverride(null);
              setVatEditOpen(false);
              setDiscountEnabled(false);
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
                                  receiveType: po.receiveType || "",
                                  vendorId: po.vendorId || "",
                                  requiredDate: po.requiredDate || "",
                                  vatType: po.vatType || "ex-vat",
                                  selectedPrIds: prIdsFromItems,
                                  items: (po.items || []).map((it, idx) => ((it.prId == null || it.prId === "") && !it.id) ? { ...it, id: `free-${idx}-${Date.now()}` } : it),
                                  note: po.note || "",
                                  discount: po.discount ?? 0,
                                });
                                setManualVatOverride(po.manualVat != null ? Number(po.manualVat) : null);
                                setVatEditOpen(false);
                                setVatEditValue("");
                                setDiscountEnabled((po.discount ?? 0) > 0);
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

        {/* Create PO Modal — ทับ Header, เต็มความสูง, Footer เลื่อนตามเนื้อหา */}
        {isModalOpen && (
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[9999] p-4"
            initial="hidden"
            animate="visible"
            variants={modalOverlayVariants}
            transition={overlayTransition}
          >
            <motion.div
              className="w-[90vw] max-w-[90vw] max-h-[92vh] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
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
                            const defaultReceive = getDefaultReceiveType(newType);
                            setFormData({ ...formData, poType: newType, poNo: newPoNo, receiveType: defaultReceive });
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
                      <div>
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
                          <Package size={11} className="text-red-500" /> Receive Type
                        </label>
                        <select
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white hover:border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all cursor-pointer text-slate-900"
                          value={formData.receiveType}
                          onChange={e => setFormData({ ...formData, receiveType: e.target.value })}
                        >
                          <option value="">-- เลือก Receive Type --</option>
                          {RECEIVE_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
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
                      <>
                        <div className="flex flex-wrap gap-2 mb-4">
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
                      </>
                    )}
                  </div>
                </div>

                {/* 3. เลือกรายการสินค้า (Select Items) - โทนแดงขาวดำ */}
                {formData.selectedPrIds.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-2.5 bg-gradient-to-r from-slate-100 to-slate-200/80 border-b border-slate-300">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-slate-800 rounded-lg flex items-center justify-center">
                          <Package size={13} className="text-white" />
                        </div>
                        <span className="text-xs font-bold text-slate-800 tracking-wide uppercase">3. เลือกรายการสินค้า (Select Items)</span>
                      </div>
                      <button
                        type="button"
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-slate-800 text-white text-xs font-semibold hover:bg-slate-700 transition-all shadow-sm"
                        onClick={addFreeItem}
                      >
                        <Plus size={13} /> เพิ่มรายการ
                      </button>
                    </div>
                    <div className="p-4 overflow-x-auto">
                      <table className="w-full text-left text-xs rounded-xl overflow-hidden border border-slate-200">
                        <thead className="bg-slate-100 font-semibold text-slate-800 border-b border-slate-200">
                          <tr>
                            <th className="p-2.5 w-10 text-center">เลือก</th>
                            <ResizableTh tableId="select-items" colKey="prNo" className="p-2.5" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths["select-items"]?.prNo ?? 96}>PR No.</ResizableTh>
                            <th className="p-2.5 w-24">สถานะ</th>
                            <ResizableTh tableId="select-items" colKey="materialNo" className="p-2.5" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths["select-items"]?.materialNo ?? 112}>Material No.</ResizableTh>
                            <ResizableTh tableId="select-items" colKey="description" className="p-2.5" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths["select-items"]?.description}>รายการ</ResizableTh>
                            <ResizableTh tableId="select-items" colKey="unit" className="p-2.5 w-20" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths["select-items"]?.unit}>หน่วย</ResizableTh>
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
                                <td className="p-2.5">
                                  {item.alreadyOpenedInPO ? (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-200">เปิด PO ไปแล้ว</span>
                                  ) : (
                                    <span className="text-slate-400 text-[10px]">—</span>
                                  )}
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
                                {/* หน่วย (ของ Material) */}
                                <td className="p-2.5">
                                  <span className="text-slate-600 text-xs">{selectedData.unit || item.unit || "—"}</span>
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
                          {/* รายการว่าง (เพิ่มจากปุ่ม + เพิ่มรายการ) — กรอกอิสระ ไม่จำกัด */}
                          {formData.items.filter(i => i.id && String(i.id).startsWith("free-")).map((freeItem) => {
                            const inputCls = "w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:border-red-400 focus:ring-1 focus:ring-red-100 bg-white";
                            return (
                              <tr key={freeItem.id} className="bg-white hover:bg-slate-50/30 border-t border-slate-200">
                                <td className="p-2.5 text-center">
                                  <button type="button" className="text-red-400 hover:text-red-600 p-1" onClick={() => removeFreeItem(freeItem.id)} title="ลบรายการ">
                                    <Trash2 size={14} />
                                  </button>
                                </td>
                                <td className="p-2.5 text-xs font-medium text-slate-700">{freeItem.linkedPrNo || "—"}</td>
                                <td className="p-2.5"><span className="text-amber-600 text-[10px]">รายการเพิ่ม</span></td>
                                <td className="p-2.5">
                                  <MaterialAutoComplete value={freeItem.materialNo || ""} className={inputCls} placeholder="Material No." materials={materials} onChange={(val) => handleFreeItemChange(freeItem.id, "materialNo", val)} onSelectMaterial={(mat) => setFreeItemMaterial(freeItem.id, mat)} />
                                </td>
                                <td className="p-2.5">
                                  <input type="text" className={inputCls} placeholder="รายการ" value={freeItem.description || ""} onChange={e => handleFreeItemChange(freeItem.id, "description", e.target.value)} />
                                </td>
                                <td className="p-2.5">
                                  <input type="text" className={`${inputCls} w-16`} placeholder="หน่วย" value={freeItem.unit || ""} onChange={e => handleFreeItemChange(freeItem.id, "unit", e.target.value)} />
                                </td>
                                <td className="p-2.5">
                                  <input type="number" className={`${inputCls} text-right`} value={freeItem.quantity} onChange={e => handleFreeItemChange(freeItem.id, "quantity", e.target.value)} />
                                </td>
                                <td className="p-2.5">
                                  <input type="number" className={`${inputCls} text-right`} value={freeItem.price} onChange={e => handleFreeItemChange(freeItem.id, "price", e.target.value)} />
                                </td>
                                <td className="p-2.5 text-right font-bold text-slate-800 whitespace-nowrap">
                                  {formatCurrency(Number(freeItem.quantity) * Number(freeItem.price))}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Footer / ยอดรวม PO */}
                <div className="mt-4 mb-6 border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
                  {/* Top row: ภาษี + ส่วนลด options */}
                  <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-slate-50 border-b border-slate-100">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">ภาษี</span>
                    <label className="flex items-center gap-1 cursor-pointer text-[11px] px-2 py-0.5 rounded border border-slate-200 hover:border-red-300 hover:bg-red-50/50 transition-colors">
                      <input type="radio" name="vat" value="ex-vat" checked={formData.vatType === "ex-vat"} onChange={() => setFormData({ ...formData, vatType: "ex-vat" })} className="text-red-600 w-3 h-3" />
                      <span className={formData.vatType === "ex-vat" ? "font-semibold text-red-700" : "text-slate-600"}>Ex-Vat</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer text-[11px] px-2 py-0.5 rounded border border-slate-200 hover:border-red-300 hover:bg-red-50/50 transition-colors">
                      <input type="radio" name="vat" value="inc-vat" checked={formData.vatType === "inc-vat"} onChange={() => setFormData({ ...formData, vatType: "inc-vat" })} className="text-red-600 w-3 h-3" />
                      <span className={formData.vatType === "inc-vat" ? "font-semibold text-red-700" : "text-slate-600"}>ไม่มี Vat</span>
                    </label>
                    <div className="w-px h-3 bg-slate-300" />
                    <label className="flex items-center gap-1 text-[11px] text-slate-600 cursor-pointer">
                      <input type="checkbox" checked={discountEnabled} onChange={e => { const checked = e.target.checked; setDiscountEnabled(checked); if (!checked) setFormData({ ...formData, discount: 0 }); }} className="rounded text-red-600 w-3 h-3" />
                      <span>ส่วนลด</span>
                    </label>
                    {discountEnabled && (
                      <input type="text" className="w-20 border border-slate-200 rounded px-1.5 py-0.5 text-[11px] text-right focus:border-red-400 focus:ring-1 focus:ring-red-100 outline-none" placeholder="0.00" value={formData.discount ? String(formData.discount) : ""} onChange={e => { const v = e.target.value.replace(/,/g, ""); const n = parseFloat(v); setFormData({ ...formData, discount: isNaN(n) ? 0 : Math.max(0, n) }); }} />
                    )}
                    {selectedPrsTotalAmount > 0 && (
                      <div className="ml-auto flex flex-col items-end leading-tight">
                        <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">คงเหลือ PR</span>
                        <span className="text-xl font-bold text-blue-600 tabular-nums">{formatCurrency(selectedPrsTotalAmount)}</span>
                      </div>
                    )}
                  </div>
                  {/* Bottom row: summary table + save button */}
                  <div className="flex items-end justify-between gap-4 px-4 py-2.5">
                    <div className="text-[10px] text-slate-400 italic">กรอกข้อมูลให้ครบก่อนบันทึก</div>
                    <div className="flex items-end gap-3">
                      {/* Compact totals */}
                      <div className="text-[11px] w-[220px]">
                        <div className="flex justify-between py-0.5"><span className="text-slate-500">รวมราคา / Amount</span><span className="font-medium text-slate-700 tabular-nums">{formatCurrency(calculateTotals().subtotal)}</span></div>
                        <div className="flex justify-between py-0.5"><span className="text-slate-500">ส่วนลด / Discount</span><span className="text-slate-600 tabular-nums">-{formatCurrency(formData.discount || 0)}</span></div>
                        <div className="flex justify-between py-0.5 border-t border-slate-100"><span className="text-slate-500">มูลค่า / Sub Total</span><span className="font-medium text-slate-700 tabular-nums">{formatCurrency(Math.max(0, calculateTotals().subtotal - (formData.discount || 0)))}</span></div>
                        <div className="flex justify-between items-center py-0.5">
                          <span className="text-slate-500">VAT 7%</span>
                          <span className="flex items-center gap-0.5 tabular-nums">
                            {!vatEditOpen
                              ? <><span className="text-slate-700">{formatCurrency(calculateTotals().vat)}</span><button type="button" className="p-0.5 rounded hover:bg-slate-100 text-slate-400 ml-0.5" onClick={() => { setVatEditValue(String(manualVatOverride ?? calculateTotals().vat)); setVatEditOpen(true); }}><Edit size={9} /></button></>
                              : <span className="flex items-center gap-0.5"><input type="text" className="w-14 border rounded px-1 py-0.5 text-[10px] text-right" value={vatEditValue} onChange={e => setVatEditValue(e.target.value)} /><button type="button" className="text-[10px] text-emerald-600 font-medium" onClick={() => { const n = parseFloat(vatEditValue); if (!isNaN(n)) { setManualVatOverride(n); setVatEditOpen(false); } }}>Save</button><button type="button" className="text-[10px] text-slate-400" onClick={() => { setVatEditOpen(false); setVatEditValue(""); }}>✕</button></span>
                            }
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-1 mt-0.5 border-t-2 border-slate-800">
                          <span className="font-bold text-slate-800">ยอดสุทธิ / Net Total</span>
                          <span className={`font-bold tabular-nums ${calculateTotals().total > selectedPrsTotalAmount * 1.001 && selectedPrsTotalAmount > 0 ? "text-red-600" : "text-slate-900"}`}>
                            {formatCurrency(calculateTotals().total)}
                            {calculateTotals().total > selectedPrsTotalAmount * 1.001 && selectedPrsTotalAmount > 0 && <span className="text-[9px] font-normal text-red-500 ml-0.5">(เกิน PR)</span>}
                          </span>
                        </div>
                      </div>
                      <Button size="sm" className="px-5 rounded-lg flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shrink-0 mb-0.5" onClick={handleSavePO}><Save size={13} /> บันทึก PO</Button>
                    </div>
                  </div>
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

        {/* เพิ่มรายการ Modal */}
        {isAddItemModalOpen && formData.selectedPrIds.length > 0 && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[80] p-4" onClick={() => setIsAddItemModalOpen(false)}>
            <motion.div
              className="w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 bg-slate-800 shrink-0">
                <div className="flex items-center gap-3">
                  <Package size={20} className="text-white" />
                  <h3 className="text-base font-bold text-white">เพิ่มรายการสินค้า</h3>
                </div>
                <button type="button" className="text-white/70 hover:text-white p-2 rounded-xl" onClick={() => setIsAddItemModalOpen(false)}>
                  <XCircle size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">PR No.</th>
                      <th className="p-2.5">สถานะ</th>
                      <th className="p-2.5">รายการ</th>
                      <th className="p-2.5 text-right">เหลือ (QTY)</th>
                      <th className="p-2.5 text-right">ราคา/หน่วย</th>
                      <th className="p-2.5 w-24 text-center">เพิ่ม</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {availableItems.map((item) => {
                      const alreadyInPo = formData.items.some(i => i.prId === item.prId && i.prItemIndex === item.prItemIndex);
                      return (
                        <tr key={`${item.prId}-${item.prItemIndex}`} className="hover:bg-slate-50">
                          <td className="p-2.5 font-medium text-slate-800">{item.prNo}</td>
                          <td className="p-2.5">
                            {item.alreadyOpenedInPO ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">เปิด PO ไปแล้ว</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="p-2.5 text-slate-600 max-w-[200px] truncate" title={item.description}>{item.description || "-"}</td>
                          <td className="p-2.5 text-right">{item.remainingQty} {item.unit}</td>
                          <td className="p-2.5 text-right">{formatCurrency(item.price)}</td>
                          <td className="p-2.5 text-center">
                            {alreadyInPo ? (
                              <span className="text-slate-400 text-[10px]">เพิ่มแล้ว</span>
                            ) : (
                              <Button variant="secondary" size="sm" className="px-2 py-1 text-[10px]" onClick={() => handleAddItemClick(item)}>
                                เพิ่ม
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {availableItems.length === 0 && (
                  <div className="py-12 text-center text-slate-400 text-sm">ไม่มีรายการจาก PR ที่เลือก</div>
                )}
              </div>
              <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
                <Button variant="secondary" onClick={() => setIsAddItemModalOpen(false)}>ปิด</Button>
              </div>
            </motion.div>
          </div>
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