// @ts-nocheck
import React, { useState, useEffect, useMemo, useCallback, useRef, useContext } from "react";
import {
  Plus, Trash2, Edit, CheckCircle, XCircle, FileText, ChevronDown, ChevronRight, ChevronUp,
  CircleArrowRight, CircleArrowDown, CornerDownRight, AlertCircle, Save, Play,
  PlusCircle, Briefcase, Calendar, MapPin, DollarSign, Info, FileOutput, Search, ListFilter,
  Truck, Package, Paperclip, Clock, Hash, Tag, ClipboardList,
  Mail, Flame, MapPinned, CircleDot, Zap, Building2, UserCircle, AtSign,
  FileSpreadsheet, Wallet, ShoppingCart, Settings, Upload, CheckSquare, Square
} from "lucide-react";
import { useAppData } from "../contexts/AppDataContext";
import { useUI } from "../contexts/UIContext";
import { Card, Button, InputGroup, Badge, formatCurrency } from "../components/ui";
import ResizableTh from "../components/ResizableTh";
import { PURCHASE_TYPES, PURCHASE_TYPE_CODES, PURCHASE_TYPE_RENTAL_LABEL, PURCHASE_TYPE_EQUIPMENT, DELIVERY_LOCATIONS, getPurchaseTypeDisplayLabel, COST_CATEGORIES } from "../lib/constants";
import { uploadAttachment } from "../lib/uploadAttachment";
import { modalOverlayVariants, modalContentVariants, modalTransition, overlayTransition } from "../lib/animations";
import { motion, AnimatePresence } from "framer-motion";
const PRView = React.memo(() => {
  const { prs, pos, projects, budgets, vendors, materials, addData, updateData, deleteData,
          showAlert, openConfirm, userRole, userData, columnWidths, handleColumnResize,
          visibleProjects, handlePRAction } = useAppData();
  const { selectedProjectId,
          isFullScreenModalOpen, setIsFullScreenModalOpen,
          expandedPrRows, setExpandedPrRows, togglePrRow } = useUI();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isPrRejectModalOpen, setIsPrRejectModalOpen] = useState(false);
    const [prRejectReason, setPrRejectReason] = useState("");
    const [isEditBudgetModalOpen, setIsEditBudgetModalOpen] = useState(false);
    const [selectedPrForEditBudget, setSelectedPrForEditBudget] = useState(null);
    const [editBudgetReason, setEditBudgetReason] = useState("");
    const [viewingPR, setViewingPR] = useState(null); // PR View Modal

    const [selectedPrForReject, setSelectedPrForReject] = useState(null);
    const [expandedBudgetIdsInModal, setExpandedBudgetIdsInModal] = useState({});

    const toggleBudgetInModal = (id) => {
      setExpandedBudgetIdsInModal(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleRejectPrConfirm = async () => {
      if (!selectedPrForReject || !prRejectReason) return;
      await updateData("prs", selectedPrForReject.id, {
        status: "Rejected",
        rejectReason: prRejectReason,
      });
      setIsPrRejectModalOpen(false);
      setPrRejectReason("");
      setSelectedPrForReject(null);
    };

    const handleEditBudgetConfirm = async () => {
      if (!selectedPrForEditBudget || !editBudgetReason.trim()) return;
      await updateData("prs", selectedPrForEditBudget.id, {
        status: "Edit Budget",
        editBudgetReason: editBudgetReason.trim(),
        editBudgetBy: userData ? `${userData.firstName || ""} ${userData.lastName || ""}`.trim() : userRole,
        editBudgetAt: new Date().toISOString(),
      });
      setIsEditBudgetModalOpen(false);
      setEditBudgetReason("");
      setSelectedPrForEditBudget(null);
      showAlert("ส่งคำขอแก้ไขแล้ว", "PR ถูกตั้งสถานะ Edit Budget — ผู้เปิด PR ต้องแก้ไขและส่งอนุมัติใหม่", "info");
    };
    const [headerData, setHeaderData] = useState({
      prNo: "",
      subCode: "",
      requestDate: new Date().toISOString().split("T")[0],
      requestor: "",
      requestorEmail: "",
      costCode: "",
      selectedBudgetId: "", // รหัสงบที่เลือก (ใช้แสดงยอดคงเหลือที่ตรงรายการ)
      selectedSubItemId: "", // id ของ sub-item ที่เลือก
      urgency: "Normal",
      purchaseType: "",
      deliveryLocation: "",
      attachment: null as File | null,
      attachmentUrl: "" as string | undefined,
      attachmentName: "" as string | undefined,
    });

    // Generate PR No. automatically (อุปกรณ์ใหม่ = EQM; ขอเช่า = RE; อื่นๆ = subCode)
    const generatePrNo = (subCode, purchaseType) => {
      if (!selectedProjectId) return "";
      const currentProject = projects.find((p) => p.id === selectedProjectId);
      if (!currentProject) return "";
      const jobNoClean = (currentProject.jobNo || "").replace(/-/g, "");
      let prefix;
      if (purchaseType === PURCHASE_TYPE_EQUIPMENT) {
        prefix = `${jobNoClean}-EQM-`;
      } else if (purchaseType === PURCHASE_TYPE_RENTAL_LABEL) {
        prefix = `${jobNoClean}-RE-`;
      } else {
        if (!subCode) return "";
        prefix = `${jobNoClean}-${subCode}-`;
      }
      const existingCount = prs.filter(
        (pr) => pr.projectId === selectedProjectId && pr.prNo && pr.prNo.startsWith(prefix)
      ).length;
      const nextNo = String(existingCount + 1).padStart(3, "0");
      return `${prefix}${nextNo}`;
    };
    const [newItem, setNewItem] = useState({
      description: "",
      quantity: 1,
      unit: "Job",
      price: 0,
      requiredDate: "",
      note: "",
    });
    const [editingItemId, setEditingItemId] = useState(null);
    const [lineItems, setLineItems] = useState([]);
    const [editingPRId, setEditingPRId] = useState(null);
    const [isCostCodeModalOpen, setIsCostCodeModalOpen] = useState(false);
    const [budgetSearchText, setBudgetSearchText] = useState("");
    const [selectedSubItemsForPR, setSelectedSubItemsForPR] = useState([]); // Multi-select state

    const projectBudgets = budgets.filter(
      (b) => b.projectId === selectedProjectId
    );
    const calculateTotal = () =>
      lineItems.reduce((sum, item) => sum + item.quantity * item.price, 0);

    const availableBudgets = useMemo(() => {
      const approved = budgets.filter(
        (b) => b.projectId === selectedProjectId && b.status === "Approved"
      );
      return approved
        .map((b) => {
          const relatedPRs = prs.filter(
            (p) => {
              if (p.projectId !== selectedProjectId || p.status === "Rejected") return false;
              if (p.budgetId) return p.budgetId === b.id;
              return p.costCode === b.code;
            }
          );
          const usedAmount = relatedPRs.reduce(
            (sum, p) => sum + (Number(p.totalAmount) || 0),
            0
          );
          const budgetAmount = Number(b.amount); // Always use the actual total budget amount
          return {
            ...b,
            budgetAmount,
            usedAmount,
            remainingBalance: budgetAmount - usedAmount,
          };
        })
        .filter((b) => {
          // If budget has sub-items, always show it so sub-items can be individually selected.
          if (b.subItems && b.subItems.length > 0) return true;
          // For budgets without sub-items: แสดงจนกว่าคงเหลือจะหมด (เปิด PR ซ้ำได้จนงบหมด)
          return b.remainingBalance > 0;
        });
    }, [budgets, prs, selectedProjectId]);

    const handleAddItem = () => {
      if (!newItem.description || newItem.quantity <= 0)
        return showAlert(
          "ข้อมูลไม่ครบ",
          "กรุณากรอกรายละเอียดและจำนวนให้ถูกต้อง",
          "warning"
        );
      if (editingItemId) {
        setLineItems(
          lineItems.map((item) =>
            item.id === editingItemId ? { ...newItem, id: editingItemId } : item
          )
        );
        setEditingItemId(null);
      } else {
        setLineItems([...lineItems, { ...newItem, id: crypto.randomUUID() }]);
      }
      setNewItem({
        description: "",
        quantity: 1,
        unit: "Job",
        price: 0,
        requiredDate: "",
        note: "",
      });
    };

    const handleEditItem = (item) => {
      setNewItem(item);
      setEditingItemId(item.id);
    };
    const handleRemoveItem = (itemId) => {
      setLineItems(lineItems.filter((item) => item.id !== itemId));
      if (editingItemId === itemId) {
        setEditingItemId(null);
        setNewItem({
          description: "",
          quantity: 1,
          unit: "Job",
          price: 0,
          requiredDate: "",
          note: "",
        });
      }
    };

    const handleEditClick = (pr) => {
      setEditingPRId(pr.id);
      setHeaderData({
        prNo: pr.prNo,
        subCode: pr.subCode || "",
        requestDate: pr.requestDate || new Date().toISOString().split("T")[0],
        requestor: pr.requestor,
        requestorEmail: pr.requestorEmail || "",
        costCode: pr.costCode,
        selectedBudgetId: pr.budgetId || "",
        selectedSubItemId: pr.subItemId || "",
        urgency: pr.urgency || "Normal",
        purchaseType: pr.purchaseType || "",
        deliveryLocation: pr.deliveryLocation || "",
        attachment: null,
        attachmentUrl: pr.attachmentUrl || "",
        attachmentName: pr.attachmentName || "",
      });
      setLineItems(pr.items || []);
      setIsModalOpen(true);
      setIsFullScreenModalOpen(true);
    };

    const handleSavePR = async () => {
      if (
        !headerData.prNo ||
        !headerData.costCode ||
        !headerData.requestDate ||
        !headerData.purchaseType ||
        !headerData.deliveryLocation ||
        lineItems.length === 0
      ) {
        return showAlert(
          "ข้อมูลไม่ครบ",
          "กรุณากรอกข้อมูลให้ครบถ้วน ทุกช่อง รวมถึงรายการสินค้าอย่างน้อย 1 รายการ",
          "warning"
        );
      }

      const budgetItem = headerData.selectedBudgetId
        ? budgets.find((b) => b.id === headerData.selectedBudgetId && b.projectId === selectedProjectId)
        : budgets.find((b) => b.code === headerData.costCode && b.projectId === selectedProjectId);
      if (!budgetItem)
        return showAlert(
          "ไม่พบ Cost Code",
          "กรุณาเลือก Cost Code ที่ถูกต้อง",
          "error"
        );

      // ตรวจสอบว่า Budget ที่เลือกยังได้รับการ Approve อยู่
      if (budgetItem.status !== "Approved")
        return showAlert(
          "Budget ไม่ได้รับการ Approve",
          `Cost Code ${budgetItem.code} ยังไม่ได้รับการ Approve กรุณาเลือก Cost Code ที่ Approved แล้ว`,
          "error"
        );

      // ตรวจสอบว่า Sub-item ที่เลือกยังคง Approved อยู่ และยอดไม่เกิน (กรณีที่ budget มี sub-items)
      if (budgetItem.subItems && budgetItem.subItems.length > 0) {
        // หา sub-item ที่ตรงกับ selectedSubItemId → subItemId ใน lineItem → description ใน lineItem
        const firstLineSubId = lineItems.length > 0 && lineItems[0].subItemId ? lineItems[0].subItemId : "";
        const firstLineDesc = lineItems.length > 0 ? (lineItems[0].description || "").trim() : "";
        const resolvedSubId = headerData.selectedSubItemId || firstLineSubId;

        let selectedSub = resolvedSubId
          ? budgetItem.subItems.find(s => s.id === resolvedSubId)
          : firstLineDesc
            ? budgetItem.subItems.find(s => s.description?.trim() === firstLineDesc)
            : null;

        if (selectedSub) {
          if (selectedSub.status !== "Approved")
            return showAlert(
              "รายการยังไม่ได้รับการ Approve",
              `รายการ "${selectedSub.description}" มีสถานะ "${selectedSub.status}" ซึ่งยังไม่ได้รับการ Approve\nกรุณากลับไปเลือกรายการที่ Approved แล้ว`,
              "error"
            );

          // ตรวจสอบยอดคงเหลือของ sub-item (ไม่นับ PR ปัจจุบันที่กำลังแก้ไข)
          const subUsed = prs
            .filter(p => p.projectId === selectedProjectId && p.costCode === budgetItem.code && p.status !== "Rejected" && p.id !== editingPRId)
            .reduce((sum, p) => {
              const matchItem = p.items?.find(i =>
                (selectedSub.id && i.subItemId === selectedSub.id) ||
                (i.description?.trim() === selectedSub.description?.trim())
              );
              return sum + (matchItem ? (matchItem.quantity * matchItem.price) : 0);
            }, 0);
          const subBalance = selectedSub.amount - subUsed;
          const thisPrTotalCheck = calculateTotal();
          if (thisPrTotalCheck > subBalance) {
            return showAlert(
              "งบประมาณไม่พอ",
              `รายการ "${selectedSub.description}"\nงบที่ได้รับ: ${formatCurrency(selectedSub.amount)}\nใช้ไปแล้ว: ${formatCurrency(subUsed)}\nคงเหลือ: ${formatCurrency(subBalance)}\nขอซื้อครั้งนี้: ${formatCurrency(thisPrTotalCheck)}`,
              "error"
            );
          }
        }
      }

      const currentPrTotal = prs
        .filter((pr) => {
          if (pr.projectId !== selectedProjectId || pr.status === "Rejected" || pr.id === editingPRId) return false;
          if (headerData.selectedBudgetId && pr.budgetId) return pr.budgetId === headerData.selectedBudgetId;
          return pr.costCode === headerData.costCode;
        })
        .reduce((sum, pr) => sum + Number(pr.totalAmount), 0);
      const thisPrTotal = calculateTotal();
      const totalBudget =
        budgetItem.subItems && budgetItem.subItems.length > 0
          ? budgetItem.subItems.reduce((sum, s) => sum + s.amount, 0)
          : budgetItem.amount;

      if (currentPrTotal + thisPrTotal > totalBudget) {
        return showAlert(
          "งบประมาณไม่พอ",
          `งบทั้งหมด: ${formatCurrency(
            totalBudget
          )} \nใช้ไปแล้ว: ${formatCurrency(
            currentPrTotal
          )} \nขอซื้อครั้งนี้: ${formatCurrency(
            thisPrTotal
          )} \nคงเหลือจริง: ${formatCurrency(totalBudget - currentPrTotal)}`,
          "error"
        );
      }

      let success = false;
      const editingPR = editingPRId ? prs.find(p => p.id === editingPRId) : null;
      const wasEditBudget = editingPR?.status === "Edit Budget";

      // อัปโหลดไฟล์แนบไป Firebase Storage (ถ้ามี)
      let attachmentUrl = headerData.attachmentUrl || null;
      let attachmentName = headerData.attachmentName || null;
      if (headerData.attachment && typeof headerData.attachment === "object" && (headerData.attachment as File).name) {
        try {
          const file = headerData.attachment as File;
          const res = await uploadAttachment(file, {
            type: "pr",
            projectId: selectedProjectId || undefined,
            prNo: headerData.prNo || undefined,
          });
          attachmentUrl = res.url;
          attachmentName = res.name;
        } catch (err) {
          return showAlert("อัปโหลดไฟล์แนบไม่สำเร็จ", err?.message || "ไม่สามารถอัปโหลดไฟล์ได้", "error");
        }
      }

      const { attachment: _omitFile, ...headerWithoutFile } = headerData;
      const prPayload = {
        ...headerWithoutFile,
        attachmentUrl: attachmentUrl || undefined,
        attachmentName: attachmentName || undefined,
        budgetId: headerData.selectedBudgetId || undefined,
        projectId: selectedProjectId,
        items: lineItems,
        totalAmount: thisPrTotal,
        status: "Pending CM",
        // ล้าง Edit Budget fields เมื่อส่งอนุมัติใหม่
        ...(wasEditBudget ? { editBudgetReason: null, editBudgetBy: null, editBudgetAt: null } : {}),
      };

      if (editingPRId) {
        success = await updateData("prs", editingPRId, prPayload);
        if (success) {
          if (wasEditBudget) {
            showAlert("ส่งอนุมัติใหม่แล้ว", "PR ถูกส่งให้ CM/PM อนุมัติใหม่เรียบร้อย", "success");
          } else {
            showAlert("สำเร็จ", "แก้ไขใบขอซื้อ (PR) เรียบร้อยแล้ว", "success");
          }
        }
      } else {
        success = await addData("prs", prPayload, prPayload.prNo);
        if (success)
          showAlert("สำเร็จ", "บันทึกใบขอซื้อ (PR) เรียบร้อยแล้ว", "success");
      }

      if (success) {
        setIsModalOpen(false);
        setIsFullScreenModalOpen(false);
        setHeaderData({
          prNo: "",
          subCode: "",
          requestDate: new Date().toISOString().split("T")[0],
          requestor: "",
          requestorEmail: "",
          costCode: "",
          selectedBudgetId: "",
          selectedSubItemId: "",
          urgency: "Normal",
          purchaseType: "",
          deliveryLocation: "",
          attachment: null,
          attachmentUrl: "",
          attachmentName: "",
        });
        setLineItems([]);
        setEditingItemId(null);
        setEditingPRId(null);
      }
    };

    const handleToggleSubItem = (sub, budgetCode, budgetId) => {
      setSelectedSubItemsForPR((prev) => {
        const withBudgetId = { ...sub, parentCode: budgetCode, parentBudgetId: budgetId || (typeof sub.id === "string" && sub.id.startsWith("main-") ? sub.id.replace("main-", "") : null) };
        // เลือกได้เพียง 1 รายการเท่านั้น: ถ้ากดซ้ำบนรายการเดิมให้ยกเลิก ถ้ากดรายการใหม่ให้แทนที่
        const alreadySelected = prev.length === 1 && prev[0].id === sub.id;
        if (alreadySelected) return [];
        return [withBudgetId];
      });
    };

    const handleAddSelectedSubItems = () => {
      if (selectedSubItemsForPR.length === 0) return;
      const first = selectedSubItemsForPR[0];
      const budgetCode = first.parentCode;
      const budgetId = first.parentBudgetId || (first.id && String(first.id).startsWith("main-") ? String(first.id).replace("main-", "") : null);

      // เก็บทั้ง budget ID และ sub-item ID เพื่อแสดงยอดคงเหลือของ sub-item ที่เลือก
      const isMainItem = typeof first.id === 'string' && first.id.startsWith('main-');
      const subItemId = isMainItem ? "" : (first.id || "");
      setHeaderData((prev) => ({ ...prev, costCode: budgetCode, selectedBudgetId: budgetId || "", selectedSubItemId: subItemId }));

      // Add Items
      const newItems = selectedSubItemsForPR.map((sub) => {
        const isMainItem = typeof sub.id === 'string' && sub.id.startsWith('main-');
        return {
          id: crypto.randomUUID(),
          subItemId: isMainItem ? null : sub.id, // Use null for Firestore compatibility
          description: sub.description,
          quantity: sub.quantity || 1,
          unit: sub.unit || "Job",
          price: sub.unitPrice || 0,
          requiredDate: new Date().toISOString().split("T")[0],
          note: "",
        };
      });
      setLineItems((prev) => [...prev, ...newItems]);
      setSelectedSubItemsForPR([]);
      setIsCostCodeModalOpen(false);
    };

    const handleAction = async (id, action) => {
      const pr = prs.find((p) => p.id === id);
      if (!pr) return;
      if (action === "reject") {
        setSelectedPrForReject(pr);
        setPrRejectReason("");
        setIsPrRejectModalOpen(true);
        return;
      }
      let newStatus = pr.status;

      if (pr.status === "Pending CM" && (userRole === "CM" || userRole === "Administrator"))
        newStatus = "Pending PM";
      else if (pr.status === "Pending PM" && (userRole === "PM" || userRole === "Administrator"))
        newStatus = "Approved";

      if (newStatus !== pr.status)
        await updateData("prs", id, { status: newStatus, rejectReason: "" });
    };

    const groupedBudgets = useMemo(() => {
      const groups = {};
      const ALLOWED_CATS = ["001", "002", "003", "004", "005", "006", "007", "008", "009"];
      availableBudgets.forEach((b) => {
        // แสดงเฉพาะ budget ที่มี sub-item ที่อนุมัติแล้ว (status === "Approved") อย่างน้อย 1 รายการ
        const hasApprovedSubs = b.subItems && b.subItems.some(s => s.status === "Approved");
        if (!hasApprovedSubs) return;
        const cat = b.code.substring(0, 3);
        if (!ALLOWED_CATS.includes(cat)) return;
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(b);
      });
      return groups;
    }, [availableBudgets]);

    // ฟิลเตอร์ Cost Code / รายการ ใน Modal เลือกรายการงบประมาณ (content)
    const groupedBudgetsFiltered = useMemo(() => {
      const q = (budgetSearchText || "").trim().toLowerCase();
      if (!q) return groupedBudgets;
      const out = {};
      Object.keys(groupedBudgets).forEach((cat) => {
        const filtered = groupedBudgets[cat].filter((b) => {
          const subDesc = (b.subItems || []).map((s) => s.description || "").join(" ");
          const haystack = [b.code, b.description || "", subDesc].join(" ").toLowerCase();
          return haystack.includes(q);
        });
        if (filtered.length > 0) out[cat] = filtered;
      });
      return out;
    }, [groupedBudgets, budgetSearchText]);

    return (
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <h2 className="text-xl font-bold text-slate-800">
            C. Purchase Request (PR)
          </h2>
          <Button
            onClick={() => {
              setIsModalOpen(true);
              setIsFullScreenModalOpen(true);
              setEditingPRId(null);
              setHeaderData({
                prNo: "",
                requestDate: new Date().toISOString().split("T")[0],
                requestor: userData ? `${userData.firstName || ""} ${userData.lastName || ""}`.trim() : "",
                requestorEmail: userData?.email || "",
                costCode: "",
                selectedBudgetId: "",
                selectedSubItemId: "",
                urgency: "Normal",
                purchaseType: "",
                deliveryLocation: "",
                attachment: null,
                attachmentUrl: "",
                attachmentName: "",
              });
              setLineItems([]);
            }}
          >
            <Plus size={14} /> สร้าง PR ใหม่
          </Button>
        </div>
        <Card>
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-900 uppercase font-semibold">
              <tr>
                <ResizableTh tableId="pr" colKey="prNo" className="py-1 px-3" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.pr?.prNo}>PR No.</ResizableTh>
                <ResizableTh tableId="pr" colKey="date" className="py-1 px-3" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.pr?.date}>Date</ResizableTh>
                <ResizableTh tableId="pr" colKey="costCode" className="py-1 px-3" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.pr?.costCode}>Cost Code</ResizableTh>
                <ResizableTh tableId="pr" colKey="description" className="py-1 px-3" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.pr?.description}>Description</ResizableTh>
                <ResizableTh tableId="pr" colKey="type" className="py-1 px-3" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.pr?.type}>Type</ResizableTh>
                <ResizableTh tableId="pr" colKey="requestor" className="py-1 px-3" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.pr?.requestor}>Requestor</ResizableTh>
                <ResizableTh tableId="pr" colKey="items" className="py-1 px-3" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.pr?.items}>Items</ResizableTh>
                <ResizableTh tableId="pr" colKey="amount" className="py-1 px-3 text-right" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.pr?.amount}>Amount</ResizableTh>
                <ResizableTh tableId="pr" colKey="status" className="py-1 px-3 text-center" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.pr?.status}>Status</ResizableTh>
                <th className="py-1 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Object.entries(
                prs
                  .filter((pr) => pr.projectId === selectedProjectId)
                  .reduce((groups, pr) => {
                    const type = pr.purchaseType || "Uncategorized";
                    if (!groups[type]) groups[type] = [];
                    groups[type].push(pr);
                    return groups;
                  }, {})
              ).map(([type, groupPrs]) => (
                <React.Fragment key={type}>
                  <tr className="bg-slate-100 border-b border-slate-200">
                    <td colSpan={10} className="py-2 px-3 font-bold text-slate-700">
                      {type} ({groupPrs.length})
                    </td>
                  </tr>
                  {groupPrs.map((pr) => (
                    <React.Fragment key={pr.id}>
                      <tr
                        className="hover:bg-blue-50 border-b cursor-pointer transition-colors odd:bg-white even:bg-slate-50"
                        onClick={() => setViewingPR(pr)}
                      >
                        <td className="py-1 px-3 font-medium" title={pr.prNo}><span className="cell-text">{pr.prNo}</span></td>
                        <td className="py-1 px-3" title={pr.requestDate}><span className="cell-text">{pr.requestDate}</span></td>
                        <td className="py-1 px-3">
                          <span className="bg-gray-100 px-2 py-0.5 rounded text-xs border border-gray-200 cell-text" title={pr.costCode}>
                            {pr.costCode}
                          </span>
                        </td>
                        <td
                          className="py-1 px-3 text-xs text-slate-500"
                          title={(() => {
                            const itemDescs = pr.items && pr.items.length > 0
                              ? pr.items.map((it) => it.description).filter(Boolean).join(", ")
                              : "-";
                            return pr.rejectReason ? `${itemDescs} | ปฏิเสธ: ${pr.rejectReason}` : itemDescs;
                          })()}
                        >
                          <span className="cell-text">
                            {pr.items && pr.items.length > 0
                              ? pr.items.map((it) => it.description).filter(Boolean).join(", ")
                              : "-"}
                          </span>
                        </td>
                        <td className="py-1 px-3" title={pr.purchaseType}><span className="cell-text">{getPurchaseTypeDisplayLabel(pr.purchaseType)}</span></td>
                        <td className="py-1 px-3" title={pr.requestor}><span className="cell-text">{pr.requestor}</span></td>
                        <td className="py-1 px-3">
                          <span className="font-bold text-slate-700">
                            {pr.items?.length || 0} รายการ
                          </span>
                        </td>
                        <td className="py-1 px-3 text-right font-semibold">
                          {formatCurrency(pr.totalAmount || pr.amount)}
                        </td>
                        <td className="py-1 px-3 text-center">
                          <Badge status={pr.status} />
                        </td>
                        <td
                          className="py-1 px-3 text-right flex justify-end gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {(userRole === "CM" || userRole === "Administrator") && pr.status === "Pending CM" && (
                            <>
                              <Button variant="success" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(pr.id, "approve")}>CM Approve</Button>
                              <Button variant="danger" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(pr.id, "reject")}>Reject</Button>
                            </>
                          )}
                          {(userRole === "PM" || userRole === "Administrator") && pr.status === "Pending PM" && (
                            <>
                              <Button variant="success" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(pr.id, "approve")}>PM Approve</Button>
                              <Button variant="danger" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(pr.id, "reject")}>Reject</Button>
                            </>
                          )}
                          {(userRole === "GM" || userRole === "Administrator") && pr.status === "Pending GM" && (
                            <>
                              <Button variant="success" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(pr.id, "approve")}>GM Approve</Button>
                              <Button variant="danger" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(pr.id, "reject")}>Reject</Button>
                            </>
                          )}
                          {(userRole === "MD" || userRole === "Administrator") && pr.status === "Pending MD" && (
                            <>
                              <Button variant="success" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(pr.id, "approve")}>MD Approve</Button>
                              <Button variant="danger" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(pr.id, "reject")}>Reject</Button>
                            </>
                          )}
                          {/* ปุ่ม Edit Budget: เฉพาะ Procurement/PCM/Admin เมื่อ PR Approved */}
                          {(userRole === "Procurement" || userRole === "PCM" || userRole === "Administrator") && pr.status === "Approved" && (
                            <button
                              className="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors whitespace-nowrap"
                              title="ส่งคืนให้แก้ไข Budget"
                              onClick={() => {
                                setSelectedPrForEditBudget(pr);
                                setEditBudgetReason("");
                                setIsEditBudgetModalOpen(true);
                              }}
                            >
                              Edit Budget
                            </button>
                          )}
                          {/* ปุ่มเปิดแก้ไข PR เมื่อสถานะ Rejected หรือ Edit Budget */}
                          {(pr.status === "Rejected" || pr.status === "Edit Budget") && (
                            <button
                              className="text-blue-500 hover:bg-blue-50 p-1.5 rounded-full transition-colors"
                              title="แก้ไข PR"
                              onClick={() => handleEditClick(pr)}
                            >
                              <Edit size={14} />
                            </button>
                          )}
                          <button
                            className="text-red-500 hover:bg-red-50 p-1.5 rounded-full transition-colors"
                            onClick={() => {
                              openConfirm(
                                "ยืนยันการลบ",
                                "คุณต้องการลบรายการ PR นี้ใช่หรือไม่?",
                                async () => await deleteData("prs", pr.id),
                                "danger"
                              );
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </Card>
        {/* PR View Modal — ดูข้อมูล + Approve/Reject */}
        {viewingPR && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9000] p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="px-6 py-4 bg-slate-700 rounded-t-2xl flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                    <ClipboardList size={18} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">ใบขอซื้อ (PR)</h3>
                    <p className="text-slate-300 text-xs mt-0.5">{viewingPR.prNo}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge status={viewingPR.status} />
                  <button onClick={() => setViewingPR(null)} className="text-white/60 hover:text-white hover:bg-white/20 p-2 rounded-xl transition-all ml-2">
                    <XCircle size={20} />
                  </button>
                </div>
              </div>

              {/* Edit Budget banner */}
              {viewingPR.status === "Edit Budget" && viewingPR.editBudgetReason && (
                <div className="px-6 py-3 bg-red-600 shrink-0 flex items-start gap-3">
                  <AlertCircle size={16} className="text-white mt-0.5 shrink-0" />
                  <div>
                    <p className="text-white font-bold text-sm">⚠️ ต้องการการแก้ไข Budget</p>
                    <p className="text-red-100 text-xs mt-0.5"><span className="font-semibold">เหตุผล:</span> {viewingPR.editBudgetReason}</p>
                    {viewingPR.editBudgetBy && <p className="text-red-200 text-[11px] mt-0.5">ส่งคืนโดย: {viewingPR.editBudgetBy}</p>}
                  </div>
                </div>
              )}

              {/* Reject reason banner */}
              {viewingPR.status === "Rejected" && viewingPR.rejectReason && (
                <div className="px-6 py-2.5 bg-red-50 border-b border-red-200 shrink-0 flex items-center gap-2">
                  <AlertCircle size={14} className="text-red-500 shrink-0" />
                  <p className="text-red-700 text-xs"><span className="font-semibold">เหตุผลปฏิเสธ:</span> {viewingPR.rejectReason}</p>
                </div>
              )}

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                {/* Info grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  {[
                    { label: "PR No.", value: viewingPR.prNo },
                    { label: "วันที่", value: viewingPR.requestDate },
                    { label: "ผู้ขอซื้อ", value: viewingPR.requestor },
                    { label: "Cost Code", value: viewingPR.costCode },
                    { label: "ประเภท", value: getPurchaseTypeDisplayLabel(viewingPR.purchaseType) },
                    { label: "ความเร่งด่วน", value: viewingPR.urgency || "-" },
                    { label: "สถานที่รับของ", value: viewingPR.deliveryLocation || "-" },
                    { label: "Email", value: viewingPR.requestorEmail || "-" },
                    ...(viewingPR.attachmentUrl ? [{ label: "ไฟล์แนบ", value: viewingPR.attachmentName || "ไฟล์แนบ", url: viewingPR.attachmentUrl }] : []),
                  ].map(({ label, value, url }) => (
                    <div key={label} className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">{label}</p>
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 hover:underline truncate block" title={value}>{value || "เปิดไฟล์"}</a>
                      ) : (
                        <p className="font-semibold text-slate-700 truncate" title={value}>{value || "-"}</p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Line Items */}
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="bg-slate-100 px-4 py-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">รายการสินค้า</span>
                    <span className="bg-slate-600 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">{viewingPR.items?.length || 0} รายการ</span>
                  </div>
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 w-8 text-center">#</th>
                        <th className="px-3 py-2">รายการ</th>
                        <th className="px-3 py-2 text-right">จำนวน</th>
                        <th className="px-3 py-2 text-right">ราคา/หน่วย</th>
                        <th className="px-3 py-2 text-right">รวม</th>
                        <th className="px-3 py-2 text-center">วันที่ใช้</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(viewingPR.items || []).map((it, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="px-3 py-1.5 text-center text-slate-400">{idx + 1}</td>
                          <td className="px-3 py-1.5 font-medium text-slate-700">{it.description}</td>
                          <td className="px-3 py-1.5 text-right text-slate-500">{it.quantity} {it.unit}</td>
                          <td className="px-3 py-1.5 text-right text-slate-500">{formatCurrency(it.price)}</td>
                          <td className="px-3 py-1.5 text-right font-semibold text-slate-700">{formatCurrency(it.quantity * it.price)}</td>
                          <td className="px-3 py-1.5 text-center text-slate-400">{it.requiredDate || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-800">
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-right text-xs font-bold text-white">ยอดรวมทั้งสิ้น:</td>
                        <td className="px-3 py-2 text-right text-sm font-bold text-white">{formatCurrency(viewingPR.totalAmount || viewingPR.amount)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Footer — ปุ่ม Approve/Reject ตาม Role */}
              <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex items-center justify-between gap-2 shrink-0">
                <button onClick={() => setViewingPR(null)} className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all flex items-center gap-2">
                  <XCircle size={15} /> ปิด
                </button>
                <div className="flex items-center gap-2">
                  {(userRole === "CM" || userRole === "Administrator") && viewingPR.status === "Pending CM" && (
                    <>
                      <Button variant="danger" className="px-4 py-2 text-sm" onClick={() => { setViewingPR(null); handleAction(viewingPR.id, "reject"); }}>Reject</Button>
                      <Button variant="success" className="px-4 py-2 text-sm" onClick={() => { handleAction(viewingPR.id, "approve"); setViewingPR(null); }}>CM Approve</Button>
                    </>
                  )}
                  {(userRole === "PM" || userRole === "Administrator") && viewingPR.status === "Pending PM" && (
                    <>
                      <Button variant="danger" className="px-4 py-2 text-sm" onClick={() => { setViewingPR(null); handleAction(viewingPR.id, "reject"); }}>Reject</Button>
                      <Button variant="success" className="px-4 py-2 text-sm" onClick={() => { handleAction(viewingPR.id, "approve"); setViewingPR(null); }}>PM Approve</Button>
                    </>
                  )}
                  {(userRole === "GM" || userRole === "Administrator") && viewingPR.status === "Pending GM" && (
                    <>
                      <Button variant="danger" className="px-4 py-2 text-sm" onClick={() => { setViewingPR(null); handleAction(viewingPR.id, "reject"); }}>Reject</Button>
                      <Button variant="success" className="px-4 py-2 text-sm" onClick={() => { handleAction(viewingPR.id, "approve"); setViewingPR(null); }}>GM Approve</Button>
                    </>
                  )}
                  {(userRole === "MD" || userRole === "Administrator") && viewingPR.status === "Pending MD" && (
                    <>
                      <Button variant="danger" className="px-4 py-2 text-sm" onClick={() => { setViewingPR(null); handleAction(viewingPR.id, "reject"); }}>Reject</Button>
                      <Button variant="success" className="px-4 py-2 text-sm" onClick={() => { handleAction(viewingPR.id, "approve"); setViewingPR(null); }}>MD Approve</Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {isPrRejectModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] animate-in fade-in duration-200">
            <Card className="w-full max-w-md p-6">
              <h3 className="text-lg font-bold mb-4 text-red-600">
                ปฏิเสธ PR (Reject PR)
              </h3>
              <p className="text-sm text-slate-600 mb-3">
                PR No.: <span className="font-semibold text-slate-800">{selectedPrForReject?.prNo}</span>
              </p>
              <InputGroup label="เหตุผลที่ปฏิเสธ (Reject Reason)">
                <textarea
                  className="w-full border rounded p-2 h-24"
                  placeholder="กรุณาระบุเหตุผลที่ปฏิเสธ..."
                  value={prRejectReason}
                  onChange={(e) => setPrRejectReason(e.target.value)}
                />
              </InputGroup>
              <div className="flex justify-end gap-2 mt-4">
                <Button
                  variant="secondary"
                  onClick={() => setIsPrRejectModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={handleRejectPrConfirm}
                  disabled={!prRejectReason.trim()}
                >
                  ยืนยันปฏิเสธ
                </Button>
              </div>
            </Card>
          </div>
        )}
        {/* Modal Edit Budget — กรอกเหตุผลให้แก้ไข */}
        {isEditBudgetModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999]">
            <div className="bg-white rounded-2xl shadow-2xl border border-red-200 p-6 w-full max-w-md mx-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                  <AlertCircle size={20} className="text-red-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">ส่งคืนให้แก้ไข Budget</h3>
                  <p className="text-xs text-slate-500 mt-0.5">PR: <span className="font-semibold text-slate-700">{selectedPrForEditBudget?.prNo}</span></p>
                </div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-xs text-red-700">
                PR จะถูกเปลี่ยนสถานะเป็น <span className="font-bold">Edit Budget</span> และผู้เปิด PR ต้องแก้ไขและส่งอนุมัติใหม่
              </div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">เหตุผลที่ต้องแก้ไข <span className="text-red-500">*</span></label>
              <textarea
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
                rows={4}
                placeholder="ระบุเหตุผลที่ต้องการให้แก้ไข Budget..."
                value={editBudgetReason}
                onChange={(e) => setEditBudgetReason(e.target.value)}
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="secondary" onClick={() => { setIsEditBudgetModalOpen(false); setEditBudgetReason(""); setSelectedPrForEditBudget(null); }}>
                  ยกเลิก
                </Button>
                <button
                  className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-all disabled:opacity-50"
                  disabled={!editBudgetReason.trim()}
                  onClick={handleEditBudgetConfirm}
                >
                  ยืนยัน Edit Budget
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal สร้าง/แก้ไข PR — ทับ Header, เต็มความสูง, Footer เลื่อนตามเนื้อหา */}
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
              {/* Sticky Header - โทนอ่อนใช้งานภายในองค์กร */}
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-600 shrink-0">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-500 rounded-lg flex items-center justify-center">
                      <ClipboardList size={22} className="text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white tracking-wide">
                        {editingPRId
                          ? "แก้ไขใบขอซื้อ (Edit PR)"
                          : "สร้างใบขอซื้อ (Create PR)"}
                      </h3>
                      <p className="text-slate-300 text-xs mt-0.5">กรอกข้อมูลให้ครบถ้วนเพื่อสร้างใบขอซื้อ</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setIsModalOpen(false);
                      setIsFullScreenModalOpen(false);
                    }}
                    className="text-slate-300 hover:text-white hover:bg-slate-500 p-2 rounded-lg transition-all duration-200"
                  >
                    <XCircle size={22} />
                  </button>
                </div>
              </div>

              {/* Banner แสดงเหตุผล Edit Budget */}
              {editingPRId && (() => { const pr = prs.find(p => p.id === editingPRId); return pr?.status === "Edit Budget" ? (
                <div className="px-6 py-3 bg-red-600 shrink-0 flex items-start gap-3">
                  <AlertCircle size={18} className="text-white mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm">⚠️ PR นี้ต้องการการแก้ไข Budget</p>
                    <p className="text-red-100 text-xs mt-0.5">
                      <span className="font-semibold">เหตุผล:</span> {pr.editBudgetReason || "-"}
                    </p>
                    {pr.editBudgetBy && (
                      <p className="text-red-200 text-[11px] mt-0.5">
                        ส่งคืนโดย: <span className="font-semibold">{pr.editBudgetBy}</span>
                        {pr.editBudgetAt && ` · ${new Date(pr.editBudgetAt).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}
                      </p>
                    )}
                  </div>
                </div>
              ) : null; })()}

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 bg-slate-50/50">
                {/* Header Fields - Section 1: ข้อมูลใบขอซื้อ */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 border-b border-slate-200">
                    <div className="w-6 h-6 bg-slate-600 rounded-md flex items-center justify-center">
                      <FileText size={13} className="text-white" />
                    </div>
                    <span className="text-xs font-bold text-slate-700 tracking-wide uppercase">ข้อมูลใบขอซื้อ</span>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-6 gap-x-4 gap-y-4">
                      {/* Row 1: PR No. / ประเภท / Sub-Code */}
                      <div className="col-span-2">
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                          <Hash size={11} className="text-slate-500" /> PR No.
                        </label>
                        <input
                          type="text"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-700 font-mono font-semibold"
                          value={headerData.prNo}
                          readOnly
                          placeholder="(auto)"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                          <Tag size={11} className="text-slate-500" /> ประเภทการขอซื้อ
                        </label>
                        <select
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all cursor-pointer"
                          value={headerData.purchaseType}
                          onChange={(e) => {
                            const newType = e.target.value;
                            const codes = PURCHASE_TYPE_CODES[newType] || [];
                            const isEquipment = newType === PURCHASE_TYPE_EQUIPMENT;
                            const isRental = newType === PURCHASE_TYPE_RENTAL_LABEL;
                            const autoCode = codes.length === 1 && !isRental ? codes[0] : "";
                            const newSubCode = isEquipment || isRental ? "" : autoCode;
                            const newPrNo = (isEquipment || isRental) ? generatePrNo("", newType) : (newSubCode ? generatePrNo(newSubCode, newType) : "");
                            setHeaderData({
                              ...headerData,
                              purchaseType: newType,
                              subCode: newSubCode,
                              prNo: newPrNo,
                            });
                          }}
                        >
                          <option value="">-- เลือกประเภท --</option>
                          {PURCHASE_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {getPurchaseTypeDisplayLabel(t)}
                            </option>
                          ))}
                        </select>
                      </div>
                      {headerData.purchaseType && headerData.purchaseType !== PURCHASE_TYPE_EQUIPMENT && headerData.purchaseType !== PURCHASE_TYPE_RENTAL_LABEL && (PURCHASE_TYPE_CODES[headerData.purchaseType] || []).length > 1 && (
                        <div className="col-span-2">
                          <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                            <CircleDot size={11} className="text-slate-500" />
                            Sub-Code
                          </label>
                          <select
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all cursor-pointer"
                            value={headerData.subCode}
                            onChange={(e) => {
                              const newSubCode = e.target.value;
                              const newPrNo = generatePrNo(newSubCode, headerData.purchaseType);
                              setHeaderData({
                                ...headerData,
                                subCode: newSubCode,
                                prNo: newPrNo,
                              });
                            }}
                          >
                            <option value="">-- เลือก --</option>
                            {(PURCHASE_TYPE_CODES[headerData.purchaseType] || []).map((code) => (
                              <option key={code} value={code}>
                                {code}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Row 2: ผู้ขอซื้อ / อีเมล / สถานที่จัดส่ง */}
                      <div className="col-span-2">
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                          <UserCircle size={11} className="text-slate-500" /> ผู้ขอซื้อ
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 pl-9 text-sm hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all"
                            value={headerData.requestor}
                            onChange={(e) =>
                              setHeaderData({
                                ...headerData,
                                requestor: e.target.value,
                              })
                            }
                          />
                          <UserCircle className="absolute left-3 top-2.5 text-slate-400" size={14} />
                        </div>
                      </div>
                      <div className="col-span-2">
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                          <AtSign size={11} className="text-slate-500" /> อีเมลผู้ขอซื้อ
                        </label>
                        <div className="relative">
                          <input
                            type="email"
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 pl-9 text-sm hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all"
                            value={headerData.requestorEmail}
                            onChange={(e) =>
                              setHeaderData({
                                ...headerData,
                                requestorEmail: e.target.value,
                              })
                            }
                            placeholder="example@cmg.co.th"
                          />
                          <Mail className="absolute left-3 top-2.5 text-slate-400" size={14} />
                        </div>
                      </div>
                      <div className="col-span-2">
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                          <Building2 size={11} className="text-slate-500" /> สถานที่จัดส่ง
                        </label>
                        <div className="relative">
                          <select
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 pl-9 text-sm bg-white hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all cursor-pointer"
                            value={headerData.deliveryLocation}
                            onChange={(e) =>
                              setHeaderData({
                                ...headerData,
                                deliveryLocation: e.target.value,
                              })
                            }
                          >
                            <option value="">-- เลือกสถานที่ --</option>
                            {DELIVERY_LOCATIONS.map((l) => (
                              <option key={l} value={l}>
                                {l}
                              </option>
                            ))}
                          </select>
                          <MapPinned className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" size={14} />
                        </div>
                      </div>

                      {/* Row 3: วันที่ขอซื้อ / ความเร่งด่วน / แนบไฟล์ */}
                      <div className="col-span-2">
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                          <Calendar size={11} className="text-slate-500" /> วันที่ขอซื้อ
                        </label>
                        <div className="relative">
                          <input
                            type="date"
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 pl-9 text-sm hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all"
                            value={headerData.requestDate}
                            onChange={(e) =>
                              setHeaderData({
                                ...headerData,
                                requestDate: e.target.value,
                              })
                            }
                          />
                          <Calendar className="absolute left-3 top-2.5 text-slate-400" size={14} />
                        </div>
                      </div>
                      <div className="col-span-2 flex items-end pb-1">
                        <div>
                          <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">
                            <Zap size={11} className="text-slate-500" /> ความเร่งด่วน
                          </label>
                          <div className="flex gap-2">
                            <label className={`flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg border transition-all duration-200 ${headerData.urgency === "Normal" ? "border-slate-400 bg-slate-100" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                              <input
                                type="radio"
                                name="urgency"
                                value="Normal"
                                checked={headerData.urgency === "Normal"}
                                onChange={(e) =>
                                  setHeaderData({
                                    ...headerData,
                                    urgency: e.target.value,
                                  })
                                }
                                className="hidden"
                              />
                              <CircleDot size={13} className={headerData.urgency === "Normal" ? "text-slate-600" : "text-slate-400"} />
                              <span className={`text-xs font-medium ${headerData.urgency === "Normal" ? "text-slate-700" : "text-slate-500"}`}>ปกติ</span>
                            </label>
                            <label className={`flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg border transition-all duration-200 ${headerData.urgency === "Urgent" ? "border-red-300 bg-red-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                              <input
                                type="radio"
                                name="urgency"
                                value="Urgent"
                                checked={headerData.urgency === "Urgent"}
                                onChange={(e) =>
                                  setHeaderData({
                                    ...headerData,
                                    urgency: e.target.value,
                                  })
                                }
                                className="hidden"
                              />
                              <Flame size={13} className={headerData.urgency === "Urgent" ? "text-red-500" : "text-slate-400"} />
                              <span className={`text-xs font-semibold ${headerData.urgency === "Urgent" ? "text-red-600" : "text-slate-500"}`}>ด่วน</span>
                            </label>
                          </div>
                        </div>
                      </div>
                      <div className="col-span-2">
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                          <Paperclip size={11} className="text-slate-500" /> แนบไฟล์
                        </label>
                        <div className="flex items-center gap-3 w-full border border-dashed border-slate-200 rounded-lg px-4 py-2 bg-slate-50 hover:border-slate-300 hover:bg-slate-100/50 transition-all duration-200 group cursor-pointer">
                          <div className="w-8 h-8 bg-slate-200 group-hover:bg-slate-300 rounded-md flex items-center justify-center transition-colors">
                            <Upload size={14} className="text-slate-500 group-hover:text-slate-600 transition-colors" />
                          </div>
                          <input
                            type="file"
                            className="hidden"
                            id="pr-attachment"
                            onChange={(e) =>
                              setHeaderData({
                                ...headerData,
                                attachment: e.target.files?.[0] || null,
                              })
                            }
                          />
                          <label
                            htmlFor="pr-attachment"
                            className="flex-1 text-xs text-slate-600 cursor-pointer"
                          >
                            {headerData.attachment
                              ? (headerData.attachment as File).name
                              : headerData.attachmentUrl
                                ? (headerData.attachmentName || "ไฟล์แนบ") + " (บันทึกแล้ว)"
                                : "คลิกเพื่อเลือกไฟล์แนบ (PDF, Image, Excel ฯลฯ)"}
                          </label>
                          {headerData.attachmentUrl && !headerData.attachment && (
                            <a href={headerData.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 hover:underline ml-1" onClick={(e) => e.stopPropagation()}>เปิด</a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Header Fields - Section 2: เลือกรายการที่ Approve */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 border-b border-slate-200">
                    <div className="w-6 h-6 bg-slate-600 rounded-md flex items-center justify-center">
                      <Settings size={13} className="text-white" />
                    </div>
                    <span className="text-xs font-bold text-slate-700 tracking-wide uppercase">
                      เลือกรายการที่ Approve
                    </span>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-6 gap-x-4 gap-y-4">
                      <div className="col-span-3 md:col-span-2 lg:col-span-2">
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                          <DollarSign size={11} className="text-slate-500" /> Cost Code
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            className="w-full border border-dashed border-slate-300 rounded-lg px-3 py-2 pr-9 text-sm bg-slate-50 cursor-pointer font-medium text-slate-700 hover:border-slate-400 transition-all duration-200"
                            value={
                              headerData.costCode ? `${headerData.costCode}` : ""
                            }
                            placeholder="คลิกเพื่อเลือก"
                            readOnly
                            onClick={() => {
                              if (!editingPRId) {
                                setBudgetSearchText("");
                                setIsCostCodeModalOpen(true);
                              }
                            }}
                            disabled={!!editingPRId}
                          />
                          <ListFilter className="absolute right-3 top-2.5 text-slate-500" size={14} />
                        </div>
                        {headerData.costCode && (() => {
                          const selectedBudget = headerData.selectedBudgetId
                            ? availableBudgets.find((b) => b.id === headerData.selectedBudgetId)
                            : availableBudgets.find((b) => b.code === headerData.costCode);
                          if (!selectedBudget) return null;

                          // คำนวณยอดคงเหลือ: ถ้ามี sub-items ให้ใช้ยอดคงเหลือของ sub-item ที่เลือก
                          const hasSubItems = selectedBudget.subItems && selectedBudget.subItems.length > 0;
                          let balance = selectedBudget.remainingBalance;
                          let label = "คงเหลือ";

                          // หา sub-item ที่ตรงกับ selectedSubItemId ก่อน ถ้าไม่มีให้หาจาก lineItems
                          const resolvedSubId = headerData.selectedSubItemId ||
                            (lineItems.length > 0 && lineItems[0].subItemId ? lineItems[0].subItemId : "");

                          if (hasSubItems) {
                            const sub = resolvedSubId
                              ? selectedBudget.subItems.find(s => s.id === resolvedSubId)
                              : selectedBudget.subItems.find(s => s.status === "Approved");
                            if (sub) {
                              const subUsed = prs
                                .filter(p => p.projectId === selectedProjectId && p.costCode === selectedBudget.code && p.status !== 'Rejected' && p.id !== editingPRId)
                                .reduce((sum, p) => {
                                  const matchItem = p.items?.find(i =>
                                    (sub.id && i.subItemId === sub.id) ||
                                    (!i.subItemId && i.description === sub.description)
                                  );
                                  return sum + (matchItem ? (matchItem.quantity * matchItem.price) : 0);
                                }, 0);
                              balance = sub.amount - subUsed;
                              label = `คงเหลือ (${sub.description})`;
                            }
                          }

                          return (
                            <div className={`flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-lg w-fit ml-auto ${balance < 0 ? "bg-red-50" : "bg-slate-100"}`}>
                              <Wallet size={10} className={balance < 0 ? "text-red-500" : "text-slate-500"} />
                              <span className={`text-[10px] font-semibold ${balance < 0 ? "text-red-600" : "text-slate-600"}`}>
                                {label}:{" "}
                                {formatCurrency(balance)}
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Line Items Entry */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 border-b border-slate-200">
                    <div className="w-6 h-6 bg-slate-600 rounded-md flex items-center justify-center">
                      <ShoppingCart size={13} className="text-white" />
                    </div>
                    <span className="text-xs font-bold text-slate-700 tracking-wide uppercase">
                      {editingItemId ? "แก้ไขรายการสินค้า" : "เพิ่มรายการสินค้า"}
                    </span>
                    {editingItemId && (
                      <span className="ml-2 px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-medium rounded">กำลังแก้ไข</span>
                    )}
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-12 gap-3 items-end">
                      <div className="col-span-4">
                        <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">
                          <Package size={10} className="text-slate-500" /> รายละเอียดสินค้า
                        </label>
                        <input
                          type="text"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all placeholder:text-slate-400"
                          placeholder="ชื่อสินค้า/บริการ"
                          value={newItem.description}
                          onChange={(e) =>
                            setNewItem({ ...newItem, description: e.target.value })
                          }
                        />
                      </div>
                      <div className="col-span-1">
                        <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase tracking-wider">หน่วย</label>
                        <input
                          type="text"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-center hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all"
                          value={newItem.unit}
                          onChange={(e) =>
                            setNewItem({ ...newItem, unit: e.target.value })
                          }
                        />
                      </div>
                      <div className="col-span-1">
                        <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase tracking-wider">จำนวน</label>
                        <input
                          type="number"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-center hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all"
                          value={newItem.quantity}
                          onChange={(e) =>
                            setNewItem({
                              ...newItem,
                              quantity: Number(e.target.value),
                            })
                          }
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">
                          <DollarSign size={10} className="text-slate-500" /> ราคา/หน่วย
                        </label>
                        <input
                          type="number"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all"
                          value={newItem.price}
                          onChange={(e) =>
                            setNewItem({
                              ...newItem,
                              price: Number(e.target.value),
                            })
                          }
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">
                          <Calendar size={10} className="text-slate-500" /> วันที่ใช้
                        </label>
                        <input
                          type="date"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all"
                          value={newItem.requiredDate}
                          onChange={(e) =>
                            setNewItem({ ...newItem, requiredDate: e.target.value })
                          }
                        />
                      </div>
                      <div className="col-span-2">
                        <Button
                          onClick={handleAddItem}
                          variant={editingItemId ? "warning" : "primary"}
                          className="w-full justify-center h-[38px] text-xs rounded-lg transition-all"
                        >
                          {editingItemId ? <Save size={14} /> : <Plus size={14} />}{" "}
                          {editingItemId ? "บันทึก" : "เพิ่ม"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Items Table */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex-1">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-slate-100 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-slate-600 rounded-md flex items-center justify-center">
                        <FileSpreadsheet size={13} className="text-white" />
                      </div>
                      <span className="text-xs font-bold text-slate-700 tracking-wide uppercase">รายการสินค้า</span>
                    </div>
                    {lineItems.length > 0 && (
                      <span className="px-2.5 py-0.5 bg-slate-600 text-white text-[10px] font-medium rounded">{lineItems.length} รายการ</span>
                    )}
                  </div>
                  <table className="w-full text-left text-xs text-slate-600">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-4 w-10 text-center">#</th>
                        <th className="py-2.5 px-4">รายละเอียด</th>
                        <th className="py-2.5 px-4 text-center">หน่วย</th>
                        <th className="py-2.5 px-4 text-right">จำนวน</th>
                        <th className="py-2.5 px-4 text-right">ราคา/หน่วย</th>
                        <th className="py-2.5 px-4 text-right">รวม</th>
                        <th className="py-2.5 px-4">วันที่ใช้</th>
                        <th className="py-2.5 px-4 text-center">เครื่องมือ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lineItems.length === 0 && (
                        <tr>
                          <td colSpan="8" className="py-10 text-center">
                            <div className="flex flex-col items-center gap-2 text-slate-300">
                              <ShoppingCart size={32} />
                              <span className="text-sm font-medium">ยังไม่มีรายการสินค้า</span>
                              <span className="text-xs">เพิ่มรายการสินค้าด้านบน</span>
                            </div>
                          </td>
                        </tr>
                      )}
                      {lineItems.map((item, index) => (
                        <tr
                          key={item.id}
                          className={`hover:bg-slate-50 transition-all duration-150 ${editingItemId === item.id ? "bg-slate-100 border-l-4 border-l-slate-400" : ""
                            }`}
                        >
                          <td className="py-2.5 px-4 text-center">
                            <span className="inline-flex items-center justify-center w-6 h-6 bg-slate-100 rounded-full text-[11px] font-bold text-slate-600">{index + 1}</span>
                          </td>
                          <td className="py-2.5 px-4 font-semibold text-slate-800">{item.description}</td>
                          <td className="py-2.5 px-4 text-center">
                            <span className="px-2 py-0.5 bg-slate-100 rounded-md text-[11px] font-medium">{item.unit}</span>
                          </td>
                          <td className="py-2.5 px-4 text-right font-medium">{item.quantity}</td>
                          <td className="py-2.5 px-4 text-right text-slate-500">
                            {formatCurrency(item.price)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-bold text-slate-800">
                            {formatCurrency(item.quantity * item.price)}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="flex items-center gap-1 text-slate-500">
                              <Calendar size={11} className="text-slate-400" />
                              {item.requiredDate}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <div className="flex justify-center gap-1">
                              <button
                                onClick={() => handleEditItem(item)}
                                className="text-slate-600 hover:text-slate-800 p-1.5 hover:bg-slate-200 rounded transition-all"
                                title="แก้ไข"
                              >
                                <Edit size={13} />
                              </button>
                              <button
                                onClick={() => handleRemoveItem(item.id)}
                                className="text-red-500 hover:text-red-600 p-1.5 hover:bg-red-50 rounded transition-all"
                                title="ลบ"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {lineItems.length > 0 && (
                      <tfoot>
                        <tr className="bg-slate-600">
                          <td colSpan="5" className="py-3 px-4 text-right text-xs text-slate-200 font-medium">
                            ยอดรวมทั้งสิ้น (Total Amount):
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="text-sm font-bold text-white tracking-wide">{formatCurrency(calculateTotal())}</span>
                          </td>
                          <td colSpan="2"></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
                {/* Footer — เลื่อนตามเนื้อหา ไม่ freeze */}
                <div className="mt-4 pb-6 flex justify-between items-center px-6 py-3.5 border border-slate-200 rounded-xl bg-slate-50">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Info size={13} />
                    <span>กรุณากรอกข้อมูลให้ครบถ้วนก่อนบันทึก</span>
                  </div>
                  <div className="flex gap-3">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setIsModalOpen(false);
                        setIsFullScreenModalOpen(false);
                      }}
                      className="px-5 rounded-lg"
                    >
                      <XCircle size={15} /> ยกเลิก
                    </Button>
                    <Button
                      onClick={handleSavePR}
                      className="px-8 rounded-lg bg-slate-600 hover:bg-slate-700 text-white transition-all"
                    >
                      <Save size={16} /> บันทึก PR
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* V.19: Cost Code Selection Modal */}
        {isCostCodeModalOpen && (
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[150]"
            initial="hidden"
            animate="visible"
            variants={modalOverlayVariants}
            transition={overlayTransition}
          >
            <motion.div
              className="w-full max-w-5xl p-6 max-h-[85vh] overflow-hidden flex flex-col rounded-xl border border-slate-200 bg-white shadow-2xl"
              initial="hidden"
              animate="visible"
              variants={modalContentVariants}
              transition={modalTransition}
            >
              <div className="flex justify-between items-center gap-3 mb-4 pb-2 border-b flex-wrap">
                <h3 className="text-lg font-bold text-slate-800">
                  เลือกรายการงบประมาณ (Approved Budgets)
                </h3>
                <input
                  type="text"
                  placeholder="ค้นหา Cost Code, รายการ..."
                  value={budgetSearchText}
                  onChange={(e) => setBudgetSearchText(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm w-56 focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400"
                />
                <button
                  onClick={() => setIsCostCodeModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <XCircle size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2">
                {Object.keys(groupedBudgets).length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    ไม่พบรายการงบประมาณที่อนุมัติแล้ว หรือ งบประมาณหมด
                  </div>
                ) : Object.keys(groupedBudgetsFiltered).length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    ไม่พบรายการที่ตรงกับคำค้น
                  </div>
                ) : (
                  Object.keys(groupedBudgetsFiltered)
                    .sort()
                    .map((cat, idx) => (
                      <motion.div
                        key={cat}
                        className="mb-6"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.04, duration: 0.24, ease: [0.25, 0.46, 0.45, 0.94] }}
                      >
                        <h4 className="text-xs font-bold text-white bg-slate-600 px-3 py-1 rounded-t-md sticky top-0 z-10 shadow-sm flex items-center justify-between">
                          <span>
                            หมวด {cat}: {COST_CATEGORIES[cat]}
                          </span>
                          <span className="bg-slate-500 text-xs px-2 py-0.5 rounded-full">
                            {groupedBudgetsFiltered[cat].length} รายการ
                          </span>
                        </h4>
                        <div className="border border-slate-200 border-t-0 rounded-b-md overflow-hidden">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
                              <tr>
                                <th className="py-1.5 px-3">Cost Code</th>
                                <th className="py-1.5 px-3">รายการ</th>
                                <th className="py-1.5 px-3 text-right">Budget</th>
                                <th className="py-1.5 px-3 text-right text-orange-600">
                                  Used
                                </th>
                                <th className="py-1.5 px-3 text-right text-green-600">
                                  Balance
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {groupedBudgetsFiltered[cat].map((b) => {
                                // เฉพาะ sub-items ที่อนุมัติแล้วและยังมียอดคงเหลือ
                                const approvedSubItems = (b.subItems || []).filter(sub => sub.status === "Approved");
                                if (approvedSubItems.length === 0) return null;

                                // คำนวณ Balance ของ main budget = งบรวม - รวม sub-items ทั้งหมด (ตรงกับ BudgetView)
                                const subItemsTotal = b.subItems ? b.subItems.reduce((sum, s) => sum + s.amount, 0) : 0;
                                const mainBudgetBalance = b.budgetAmount - subItemsTotal;
                                return (
                                <React.Fragment key={b.id}>
                                  {/* Main Budget — แสดงเป็น header แบบ non-selectable */}
                                  <tr className="bg-slate-200/60 border-b border-slate-300 select-none">
                                    <td className="py-1.5 px-3 font-semibold text-slate-600">
                                      <div className="flex items-center gap-2">
                                        <CornerDownRight size={13} className="text-slate-400 flex-shrink-0" />
                                        {b.code}
                                      </div>
                                    </td>
                                    <td className="py-1.5 px-3 text-slate-600 font-medium italic">
                                      {b.description}
                                    </td>
                                    <td className="py-1.5 px-3 text-right text-slate-500">
                                      {formatCurrency(b.budgetAmount)}
                                    </td>
                                    <td className="py-1.5 px-3 text-right text-orange-600">
                                      {formatCurrency(subItemsTotal)}
                                    </td>
                                    <td className={`py-1.5 px-3 text-right font-bold ${mainBudgetBalance < 0 ? "text-red-600" : "text-green-600"}`}>
                                      {formatCurrency(mainBudgetBalance)}
                                    </td>
                                  </tr>
                                  {/* Sub-items — เฉพาะที่ Approved แล้ว และยังมียอดคงเหลือ */}
                                  {approvedSubItems.map((sub, sIdx) => {
                                    const subUsed = prs
                                      .filter(p => p.projectId === selectedProjectId && p.costCode === b.code && p.status !== 'Rejected')
                                      .reduce((sum, p) => {
                                        const matchItem = p.items?.find(i =>
                                          (sub.id && i.subItemId === sub.id) ||
                                          (!i.subItemId && i.description === sub.description)
                                        );
                                        return sum + (matchItem ? (matchItem.quantity * matchItem.price) : 0);
                                      }, 0);

                                    const subBalance = sub.amount - subUsed;
                                    if (subUsed >= sub.amount) return null;

                                    return (
                                      <tr
                                        key={`${b.id}-sub-${sIdx}`}
                                        className={`bg-slate-50/50 cursor-pointer hover:bg-blue-50 ${selectedSubItemsForPR.some((i) => i.id === sub.id) ? "bg-blue-50/80 ring-1 ring-blue-200 ring-inset" : ""}`}
                                        onClick={() => handleToggleSubItem(sub, b.code, b.id)}
                                      >
                                        <td className="py-1.5 px-3 pl-8 border-l-2 border-blue-100">
                                          <span className={`inline-flex w-4 h-4 rounded-full border-2 flex-shrink-0 items-center justify-center transition-all ${selectedSubItemsForPR.some((i) => i.id === sub.id) ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-white"}`}>
                                            {selectedSubItemsForPR.some((i) => i.id === sub.id) && <span className="w-1.5 h-1.5 rounded-full bg-white block" />}
                                          </span>
                                        </td>
                                        <td className="py-1.5 px-3 text-slate-700">
                                          {sub.description}
                                        </td>
                                        <td className="py-1.5 px-3 text-right text-slate-600 font-medium">
                                          {formatCurrency(sub.amount)}
                                        </td>
                                        <td className="py-1.5 px-3 text-right text-orange-500">
                                          {formatCurrency(subUsed)}
                                        </td>
                                        <td className={`py-1.5 px-3 text-right font-bold ${subBalance < 0 ? "text-red-600" : "text-green-600"}`}>
                                          {formatCurrency(subBalance)}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </React.Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </motion.div>
                    ))
                )}
              </div>
              <div className="pt-4 mt-2 border-t flex justify-between items-center">
                <span className="text-sm text-slate-500">
                  {selectedSubItemsForPR.length > 0
                    ? <span className="text-blue-700 font-semibold">เลือกแล้ว: {selectedSubItemsForPR[0].description}</span>
                    : <span className="text-slate-400">กรุณาเลือก 1 รายการ</span>}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setIsCostCodeModalOpen(false)}
                  >
                    ยกเลิก
                  </Button>
                  {selectedSubItemsForPR.length > 0 && (
                    <Button onClick={handleAddSelectedSubItems}>
                      ยืนยันการเลือก
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>
    );
});


export default PRView;