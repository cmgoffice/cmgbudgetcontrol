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
import { Card, Button, InputGroup, Badge, ProjectSelect, formatCurrency } from "../components/ui";
import ResizableTh from "../components/ResizableTh";
import { PURCHASE_TYPES, PURCHASE_TYPE_CODES, PURCHASE_TYPE_RENTAL_LABEL, PURCHASE_TYPE_EQUIPMENT, DELIVERY_LOCATIONS, getPurchaseTypeDisplayLabel, COST_CATEGORIES } from "../lib/constants";
import { modalOverlayVariants, modalContentVariants, modalTransition, overlayTransition } from "../lib/animations";
import { motion, AnimatePresence } from "framer-motion";
const PRView = React.memo(() => {
  const { prs, pos, projects, budgets, vendors, materials, addData, updateData, deleteData,
          showAlert, openConfirm, userRole, userData, columnWidths, handleColumnResize,
          visibleProjects, handlePRAction } = useAppData();
  const { selectedProjectId, handleProjectChange,
          isFullScreenModalOpen, setIsFullScreenModalOpen,
          expandedPrRows, setExpandedPrRows, togglePrRow } = useUI();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isPrRejectModalOpen, setIsPrRejectModalOpen] = useState(false);
    const [prRejectReason, setPrRejectReason] = useState("");

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
    const [headerData, setHeaderData] = useState({
      prNo: "",
      subCode: "",
      requestDate: new Date().toISOString().split("T")[0],
      requestor: "",
      requestorEmail: "",
      costCode: "",
      selectedBudgetId: "", // รหัสงบที่เลือก (ใช้แสดงยอดคงเหลือที่ตรงรายการ)
      urgency: "Normal",
      purchaseType: "",
      deliveryLocation: "",
      attachment: null,
    });

    // Generate PR No. automatically (อุปกรณ์ใหม่ = EQM; ขอซื้อเช่า = ST/SI; อื่นๆ = subCode)
    const generatePrNo = (subCode, purchaseType) => {
      if (!selectedProjectId) return "";
      const currentProject = projects.find((p) => p.id === selectedProjectId);
      if (!currentProject) return "";
      const jobNoClean = (currentProject.jobNo || "").replace(/-/g, "");
      let prefix;
      if (purchaseType === PURCHASE_TYPE_EQUIPMENT) {
        prefix = `${jobNoClean}-EQM-`;
      } else if (purchaseType === PURCHASE_TYPE_RENTAL_LABEL || (PURCHASE_TYPE_CODES[PURCHASE_TYPE_RENTAL_LABEL] || []).includes(subCode)) {
        if (!subCode) return "";
        prefix = `${jobNoClean}-${subCode}-`;
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
        urgency: pr.urgency || "Normal",
        purchaseType: pr.purchaseType || "",
        deliveryLocation: pr.deliveryLocation || "",
        attachment: null,
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
      const prPayload = {
        ...headerData,
        budgetId: headerData.selectedBudgetId || undefined,
        projectId: selectedProjectId,
        items: lineItems,
        totalAmount: thisPrTotal,
        status: "Pending CM",
      };

      if (editingPRId) {
        success = await updateData("prs", editingPRId, prPayload);
        if (success)
          showAlert("สำเร็จ", "แก้ไขใบขอซื้อ (PR) เรียบร้อยแล้ว", "success");
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
          urgency: "Normal",
          purchaseType: "",
          deliveryLocation: "",
          attachment: null,
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

      // Update Header (เก็บรหัสงบที่เลือกเพื่อแสดงยอดคงเหลือของรายการนั้นโดยเฉพาะ)
      setHeaderData((prev) => ({ ...prev, costCode: budgetCode, selectedBudgetId: budgetId || "" }));

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
        const cat = b.code.substring(0, 3);
        if (!ALLOWED_CATS.includes(cat)) return;
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(b);
      });
      return groups;
    }, [availableBudgets]);

    return (
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <h2 className="text-xl font-bold text-slate-800">
            C. Purchase Request (PR)
          </h2>
          <ProjectSelect
            projects={visibleProjects}
            selectedId={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
          />
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
                urgency: "Normal",
                purchaseType: "",
                deliveryLocation: "",
                attachment: null,
              });
              setLineItems([]);
            }}
          >
            <Plus size={14} /> สร้าง PR ใหม่
          </Button>
        </div>
        <div className="bg-blue-50 p-3 rounded-md border border-blue-100 text-xs text-blue-800 mb-4 flex items-center gap-2">
          <Info size={16} />
          <strong>Flow การอนุมัติ PR:</strong> Pending PM → Pending GM → Pending
          MD → Approved (ออก PO ได้)
        </div>
        {/* overlay: คลิกนอก expanded row เพื่อหุบรายการ */}
        {Object.values(expandedPrRows).some(Boolean) && (
          <div
            className="fixed inset-0 z-[5]"
            onClick={() => setExpandedPrRows({})}
          />
        )}
        <Card className="relative z-[6]">
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
                        onClick={() => togglePrRow(pr.id)}
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
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-700">
                              {pr.items?.length || 0} รายการ
                            </span>
                            <div className="text-slate-400">
                              {expandedPrRows[pr.id] ? (
                                <ChevronUp size={16} />
                              ) : (
                                <ChevronDown size={16} />
                              )}
                            </div>
                          </div>
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
                          {pr.status === "Rejected" && (
                            <button
                              className="text-blue-500 hover:bg-blue-50 p-1.5 rounded-full transition-colors"
                              title="แก้ไข"
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
                      {expandedPrRows[pr.id] && (
                        <tr className="bg-slate-50/50 relative z-[7]">
                          <td colSpan={10} className="p-4 border-b cursor-default" onClick={(e) => e.stopPropagation()}>
                            <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm ml-8">
                              <h5 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-2">
                                <ShoppingCart size={14} /> รายการสินค้าใน PR:{" "}
                                {pr.prNo}
                              </h5>
                              <table className="w-full text-xs text-left">
                                <thead className="bg-gray-100 text-gray-600 border-b">
                                  <tr>
                                    <th className="p-2 w-10 text-center">#</th>
                                    <th className="p-2">
                                      รายการสินค้า (Description)
                                    </th>
                                    <th className="p-2 text-right">จำนวน</th>
                                    <th className="p-2 text-right">ราคา/หน่วย</th>
                                    <th className="p-2 text-right">รวม</th>
                                    <th className="p-2 text-center">
                                      วันที่ต้องใช้
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {pr.items &&
                                    pr.items.map((it, idx) => (
                                      <tr key={idx} className="hover:bg-gray-50">
                                        <td className="p-2 text-center text-slate-400">
                                          {idx + 1}
                                        </td>
                                        <td className="p-2 font-medium text-slate-700">
                                          {it.description}
                                        </td>
                                        <td className="p-2 text-right">
                                          {it.quantity} {it.unit}
                                        </td>
                                        <td className="p-2 text-right">
                                          {formatCurrency(it.price)}
                                        </td>
                                        <td className="p-2 text-right font-semibold">
                                          {formatCurrency(it.quantity * it.price)}
                                        </td>
                                        <td className="p-2 text-center text-slate-500">
                                          {it.requiredDate}
                                        </td>
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </Card>
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
                            const newSubCode = isEquipment ? "" : autoCode;
                            const newPrNo = isEquipment ? generatePrNo("", newType) : (newSubCode ? generatePrNo(newSubCode, newType) : "");
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
                      {headerData.purchaseType && headerData.purchaseType !== PURCHASE_TYPE_EQUIPMENT && (PURCHASE_TYPE_CODES[headerData.purchaseType] || []).length > 1 && (
                        <div className="col-span-2">
                          <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                            <CircleDot size={11} className="text-slate-500" />
                            {headerData.purchaseType === PURCHASE_TYPE_RENTAL_LABEL ? "Type การเช่า" : "Sub-Code"}
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
                              ? headerData.attachment.name
                              : "คลิกเพื่อเลือกไฟล์แนบ (PDF, Image, Excel ฯลฯ)"}
                          </label>
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
                            onClick={() =>
                              !editingPRId && setIsCostCodeModalOpen(true)
                            }
                            disabled={!!editingPRId}
                          />
                          <ListFilter className="absolute right-3 top-2.5 text-slate-500" size={14} />
                        </div>
                        {headerData.costCode && (() => {
                          const selectedBudget = headerData.selectedBudgetId
                            ? availableBudgets.find((b) => b.id === headerData.selectedBudgetId)
                            : availableBudgets.find((b) => b.code === headerData.costCode);
                          return selectedBudget ? (
                            <div className="flex items-center gap-1 mt-1.5 px-2 py-0.5 bg-slate-100 rounded-lg w-fit ml-auto">
                              <Wallet size={10} className="text-slate-500" />
                              <span className="text-[10px] text-slate-600 font-semibold">
                                คงเหลือ:{" "}
                                {formatCurrency(selectedBudget.remainingBalance)}
                              </span>
                            </div>
                          ) : null;
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
              </div>

              {/* Sticky Footer */}
              <div className="flex justify-between items-center px-6 py-3.5 border-t border-slate-200 bg-slate-50 shrink-0">
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
              <div className="flex justify-between items-center mb-4 pb-2 border-b">
                <h3 className="text-lg font-bold text-slate-800">
                  เลือกรายการงบประมาณ (Approved Budgets)
                </h3>
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
                ) : (
                  Object.keys(groupedBudgets)
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
                            {groupedBudgets[cat].length} รายการ
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
                              {groupedBudgets[cat].map((b) => (
                                <React.Fragment key={b.id}>
                                  <tr
                                    className={`transition-colors group ${(!b.subItems || b.subItems.length === 0) ? "cursor-pointer hover:bg-blue-50" : "hover:bg-blue-50"} ${selectedSubItemsForPR.some((i) => i.id === `main-${b.id}`) ? "bg-blue-50 ring-1 ring-blue-200 ring-inset" : ""}`}
                                    onClick={(e) => {
                                      if (b.subItems && b.subItems.length > 0) {
                                        toggleBudgetInModal(b.id);
                                      } else {
                                        handleToggleSubItem({
                                          id: `main-${b.id}`,
                                          description: b.description,
                                          quantity: 1,
                                          unit: "Lot",
                                          unitPrice: b.remainingBalance,
                                          amount: b.remainingBalance
                                        }, b.code, b.id);
                                      }
                                    }}
                                  >
                                    <td className="py-1.5 px-3 font-medium text-slate-700">
                                      <div className="flex items-center gap-2">
                                        {(!b.subItems || b.subItems.length === 0) && (
                                          <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center mr-2 transition-all ${selectedSubItemsForPR.some((i) => i.id === `main-${b.id}`) ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-white"}`}>
                                            {selectedSubItemsForPR.some((i) => i.id === `main-${b.id}`) && <span className="w-1.5 h-1.5 rounded-full bg-white block" />}
                                          </span>
                                        )}
                                        {b.subItems && b.subItems.length > 0 && (
                                          <button
                                            type="button"
                                            className="text-slate-400 hover:text-blue-600"
                                            onClick={(e) => { e.stopPropagation(); toggleBudgetInModal(b.id); }}
                                          >
                                            {expandedBudgetIdsInModal[b.id]
                                              ? <img src="/arrow_collapse.png" alt="collapse" style={{ width: 18, height: 18, objectFit: 'contain' }} />
                                              : <img src="/arrow_expand.png" alt="expand" style={{ width: 18, height: 18, objectFit: 'contain' }} />}
                                          </button>
                                        )}
                                        {b.code}
                                      </div>
                                    </td>
                                    <td className="py-1.5 px-3 text-slate-600">
                                      {b.description}
                                    </td>
                                    <td className="py-1.5 px-3 text-right text-slate-500">
                                      {formatCurrency(b.budgetAmount)}
                                    </td>
                                    <td className="py-1.5 px-3 text-right text-orange-600">
                                      {formatCurrency(b.usedAmount)}
                                    </td>
                                    <td className="py-1.5 px-3 text-right font-bold text-green-600">
                                      {formatCurrency(b.remainingBalance)}
                                    </td>
                                  </tr>
                                  {
                                    expandedBudgetIdsInModal[b.id] && b.subItems && b.subItems.map((sub, sIdx) => {
                                      // Calculate sub-item usage
                                      // Logic: Find PRs with this CostCode AND containing item with same description
                                      const subUsed = prs
                                        .filter(p => p.costCode === b.code && p.status !== 'Rejected')
                                        .reduce((sum, p) => {
                                          const matchItem = p.items?.find(i => i.description === sub.description); // Simple matching
                                          return sum + (matchItem ? (matchItem.quantity * matchItem.price) : 0);
                                        }, 0);

                                      const isFullyUsed = subUsed >= sub.amount; // Or tolerance?

                                      if (isFullyUsed) return null; // Hide if used

                                      return (
                                        <tr
                                          key={`${b.id}-sub-${sIdx}`}
                                          className={`bg-slate-50/50 ${sub.status !== "Approved" ? "opacity-60" : "cursor-pointer hover:bg-blue-50"} ${selectedSubItemsForPR.some((i) => i.id === sub.id) ? "bg-blue-50/80 ring-1 ring-blue-200 ring-inset" : ""}`}
                                          onClick={() => {
                                            if (sub.status === "Approved") handleToggleSubItem(sub, b.code, b.id);
                                          }}
                                        >
                                          <td className="py-1.5 px-3 pl-8 border-l-2 border-blue-100">
                                            <span className={`inline-flex w-4 h-4 rounded-full border-2 flex-shrink-0 items-center justify-center transition-all ${selectedSubItemsForPR.some((i) => i.id === sub.id) ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-white"}`}>
                                              {selectedSubItemsForPR.some((i) => i.id === sub.id) && <span className="w-1.5 h-1.5 rounded-full bg-white block" />}
                                            </span>
                                          </td>
                                          <td className="py-1.5 px-3 text-slate-700">
                                            {sub.description}
                                            {sub.status !== "Approved" && (
                                              <span className="text-orange-500 ml-2 font-bold">(รอ MD อนุมัติ)</span>
                                            )}
                                          </td>
                                          <td className="py-1.5 px-3 text-right text-red-600">
                                            -{formatCurrency(sub.amount)}
                                          </td>
                                          <td className="py-1.5 px-3 text-right text-orange-400">
                                            {formatCurrency(subUsed)}
                                          </td>
                                          <td className="py-1.5 px-3 text-right font-bold text-green-600">
                                            {formatCurrency(sub.amount - subUsed)}
                                          </td>
                                        </tr>
                                      );
                                    })
                                  }
                                </React.Fragment>
                              ))}
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