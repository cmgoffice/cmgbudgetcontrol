// @ts-nocheck
import React, { useState, useMemo, useCallback, useContext } from "react";
import { collection, doc, getDocs, query, where, writeBatch } from "firebase/firestore";
import {
  ChevronDown, ChevronRight, FileText, Eye, X, Search, Trash2,
  DollarSign, Calendar, CreditCard, Package, Check, AlertCircle, Pencil,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppData } from "../contexts/AppDataContext";
import { useUI } from "../contexts/UIContext";
import { AuthContext } from "../auth/AuthContext";
import { Card, Button, Badge, formatCurrency } from "../components/ui";
import {
  modalOverlayVariants,
  modalContentVariants,
  modalTransition,
  overlayTransition,
} from "../lib/animations";
import {
  buildConfiguredReceiveData,
  getInvoiceStatusByPaymentType,
  hasConfiguredReceiveAfterPayment,
} from "../lib/poDocumentFlow";
import {
  buildCreateLogDetails,
  buildDeleteLogDetails,
  buildRecordSummary,
  formatLogCurrency,
  truncateLogText,
} from "../lib/systemLogDetails";

const PO_TYPE_LABELS: Record<string, string> = {
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

const PAYMENT_TYPES = ["เครดิต", "โอน", "เช็ค", "เงินสด"];

// Alternating pastel group colors
const GROUP_COLORS = [
  {
    header: "bg-violet-50 hover:bg-violet-100",
    badge: "bg-violet-200 text-violet-800",
    border: "border-violet-100",
    thead: "bg-violet-50/70",
    rowHover: "hover:bg-violet-50/50",
    poNo: "text-violet-700",
    btn: "border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-700",
  },
  {
    header: "bg-amber-50 hover:bg-amber-100",
    badge: "bg-amber-200 text-amber-800",
    border: "border-amber-100",
    thead: "bg-amber-50/70",
    rowHover: "hover:bg-amber-50/50",
    poNo: "text-amber-700",
    btn: "border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700",
  },
];

const PAYMENT_TYPE_BADGE_STYLES: Record<string, string> = {
  เครดิต: "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200",
  โอน: "bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-200",
  เช็ค: "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200",
  เงินสด: "bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-200",
};

const getPoInvoiceStatus = (paymentType?: string, isDeposit = false) =>
  getInvoiceStatusByPaymentType(paymentType, isDeposit);

const getInvoiceLogSummary = (invoice: any, patch: any = null) =>
  buildRecordSummary("invoices", patch ? { ...invoice, ...patch } : invoice, invoice?.id);

const getInvoiceConfiguredAmount = (invoice: any) =>
  Array.isArray(invoice?.items)
    ? invoice.items.reduce((sum: number, item: any) => sum + Number(item?.amount || (Number(item?.quantity || 0) * Number(item?.price || 0))), 0)
    : 0;

const getInvoiceOutstandingDepositAmount = (invoice: any) => {
  if (!invoice?.isDeposit) return 0;
  const explicitRemaining = Number(invoice?.remainingAmount);
  if (Number.isFinite(explicitRemaining) && explicitRemaining > 0) return explicitRemaining;
  return Math.max(0, getInvoiceConfiguredAmount(invoice) - Number(invoice?.depositAmount || 0));
};

const InvoiceView = React.memo(() => {
  const {
    db,
    appId,
    pos,
    projects,
    prs,
    vendors,
    invoices,
    receives,
    payments,
    addData,
    updateData,
    deleteData,
    showAlert,
    openConfirm,
    canUseFunction,
    userRoles,
    logAction,
    loadVendors,
    user,
  } = useAppData();
  const { selectedProjectId } = useUI();
  const { userData } = useContext(AuthContext);

  // โหลด vendors เมื่อเข้าหน้า Invoice (vendor ข้อมูลจาก PO ต้องใช้ vendors)
  React.useEffect(() => {
    loadVendors?.();
  }, [loadVendors]);

  const [activeTab, setActiveTab] = useState<"po" | "history">("po");
  const [viewingPO, setViewingPO] = useState<any>(null);
  const [editingInvoice, setEditingInvoice] = useState<any>(null);
  const [invoiceForm, setInvoiceForm] = useState({
    invNo: "",
    invDate: new Date().toISOString().split("T")[0],
    paymentType: "เครดิต",
    bankAccountNo: "",
    isDeposit: false,
    depositAmount: 0,
    originalDepositAmount: 0,
    settleRemaining: false,
    items: [] as any[],
  });
  const [saving, setSaving] = useState(false);
  const [expandedTypes, setExpandedTypes] = useState<Record<string, boolean>>({});
  const [poPOSearch, setPoPOSearch] = useState("");
  const [poVendorSearch, setPoVendorSearch] = useState("");
  const [histSearch, setHistSearch] = useState("");
  const isEditingInvoice = Boolean(editingInvoice);
  const canEditInvoiceHistory =
    userRoles.includes("Administrator") && canUseFunction("invoice", "edit");
  const canDeleteInvoiceSource = userRoles.includes("Administrator");
  const isFixedPayBeforeReceiveInvoice = Boolean(
    viewingPO?.payBeforeReceiveChecked ||
    viewingPO?.invoiceMode === "pay_before_receive" ||
    editingInvoice?.invoiceMode === "pay_before_receive" ||
    editingInvoice?.autoCreatedFromPoApproval
  );

  const getVendorName = useCallback(
    (vendorId: string, fallbackName?: string) => {
      const v = vendors.find((vd) => vd.id === vendorId);
      return v?.name || fallbackName || "-";
    },
    [vendors]
  );

  // หา contractorId จาก Payment ที่เชื่อมโยงกับ PO นี้
  const getPoVendorName = useCallback(
    (po: any) => {
      // พยายามหาจาก PO ก่อน
      const directVendorName = getVendorName(
        po?.vendorId,
        po?.vendorName || po?.vendor || po?.supplierName || po?.supplier
      );
      if (directVendorName !== "-") return directVendorName;

      // ถ้าไม่พบ ให้หาจาก Payment ที่มี selectedPrIds ประกอบด้วย po.id นี้
      const linkedPayment = (payments || []).find(
        (pay: any) =>
          pay.projectId === selectedProjectId &&
          Array.isArray(pay.selectedPrIds) &&
          pay.selectedPrIds.includes(po.id)
      );
      if (linkedPayment?.contractorId) {
        return getVendorName(linkedPayment.contractorId);
      }

      return "-";
    },
    [getVendorName, payments, selectedProjectId]
  );

  const projectReceives = useMemo(
    () => receives.filter((rcv) => rcv.projectId === selectedProjectId),
    [receives, selectedProjectId]
  );

  const receiveDocsByPoId = useMemo(() => {
    const map: Record<string, any[]> = {};
    projectReceives.forEach((rcv) => {
      if (!rcv?.poId) return;
      if (!map[rcv.poId]) map[rcv.poId] = [];
      map[rcv.poId].push(rcv);
    });

    Object.values(map).forEach((list) => {
      list.sort((a: any, b: any) => {
        const aDate = new Date(a.receivedDate || a.createdAt || 0).getTime();
        const bDate = new Date(b.receivedDate || b.createdAt || 0).getTime();
        return bDate - aDate;
      });
    });

    return map;
  }, [projectReceives]);

  const formatDate = useCallback((value?: string) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("th-TH");
  }, []);

  const getPoAmountExVat = useCallback((po: any) => {
    let subtotal = 0;
    if (Array.isArray(po?.items) && po.items.length > 0) {
      subtotal = po.items.reduce(
        (sum: number, item: any) => sum + Number(item.amount || 0),
        0
      );
    }
    const discount = Number(po?.discount || 0);
    return Math.max(0, subtotal - discount);
  }, []);

  // POs eligible for invoice entry for this project
  // - Normal flow: Received
  // - Pay before receive flow: Wait Invoice
  // - Payment Subcontractor flow: Wait Pay (เมื่อ Payment ถูกอนุมัติเป็น Wait Pay)
  const invoiceEligiblePOs = useMemo(() => {
    if (!selectedProjectId) return [];
    
    // โฟลวปกติ และ Pay before receive
    const validPOs = pos.filter((po) => {
      const currentStatus = po.statusNow || po.status;
      return (
        po.projectId === selectedProjectId &&
        (currentStatus === "Received" || currentStatus === "Wait Invoice")
      );
    });

    // ดึงข้อมูลจากรายการ Payment เฉพาะสถานะ Wait Pay (กรองอันที่มีใบแจ้งหนี้แล้วออก)
    const validPayments = (payments || [])
      .filter(
        (p: any) =>
          p.projectId === selectedProjectId &&
          p.status === "Wait Pay" &&
          !invoices.some((inv: any) => inv.poId === p.id)
      )
      .map((p: any) => ({
        ...p,
        isPaymentSubcontract: true,
        poNo: p.paymentNo,
        poType: p.paymentType || "SP",
        vendorId: p.contractorId,
        poDate: p.openDate,
        poOpenDate: p.openDate,
        receiveType: "Payment Subcontractor",
        grandTotal: p.amount,
        amount: p.amount,
        description: `Payment งวด ${p.periodNo || ""} - ${p.paymentNo}`,
        items: Array.isArray(p.items)
          ? p.items.map((it: any, idx: number) => ({
              ...it,
              description: it.description || "งานจ้างเหมา/ค่าแรง",
              unit: "งวด",
              quantity: 1,
              price: Number(it.thisPeriodAmount) || 0,
              amount: Number(it.thisPeriodAmount) || 0,
            }))
          : [],
      }));

    return [...validPOs, ...validPayments];
  }, [pos, payments, invoices, selectedProjectId]);

  const filteredPOs = useMemo(() => {
    return invoiceEligiblePOs.filter((po) => {
      const poNoOk =
        !poPOSearch ||
        (po.poNo || "").toLowerCase().includes(poPOSearch.toLowerCase());
      const vendorOk =
        !poVendorSearch ||
        getPoVendorName(po)
          .toLowerCase()
          .includes(poVendorSearch.toLowerCase());
      return poNoOk && vendorOk;
    });
  }, [invoiceEligiblePOs, poPOSearch, poVendorSearch, getPoVendorName]);

  const groupedPOs = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filteredPOs.forEach((po) => {
      const type = po.poType || "OTHER";
      if (!groups[type]) groups[type] = [];
      groups[type].push(po);
    });
    return groups;
  }, [filteredPOs]);

  const toggleType = (type: string) =>
    setExpandedTypes((prev) => ({ ...prev, [type]: !prev[type] }));

  const poDescription = (po: any) => {
    const items = po.items || [];
    if (items.length === 0) return po.description || "-";
    const first = items[0]?.description || "-";
    return items.length > 1 ? `${first} (+${items.length - 1} รายการ)` : first;
  };

  const getPaymentTypeBadgeClass = useCallback(
    (paymentType?: string) =>
      PAYMENT_TYPE_BADGE_STYLES[paymentType || ""] ||
      "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200",
    []
  );

  const getInvoiceDisplayStatus = useCallback((invoice: any) => {
    const status = String(invoice?.status || "").trim();
    if (getInvoiceOutstandingDepositAmount(invoice) > 0) return "Deposit";
    if (status.toLowerCase() === "deposit") return "Deposit";
    if (status.toLowerCase() === "inpay") return "Inpay";
    if (status.toLowerCase() === "invcredit") return "Invcredit";
    if (status.toLowerCase() === "paid") return "paid";
    const paymentType = String(invoice?.paymentType || "").trim();
    if (["เงินสด", "โอน", "เช็ค"].includes(paymentType)) return "paid";
    if (paymentType === "เครดิต") return "Invcredit";
    return status || "-";
  }, []);

  const getBasePoStatusForInvoice = useCallback((invoice: any) => {
    const matchedPO = pos.find((po) => po.id === invoice?.poId);
    const isPayBeforeReceive =
      matchedPO?.receiveType === "Pay before receive" ||
      matchedPO?.payBeforeReceiveChecked ||
      matchedPO?.invoiceMode === "pay_before_receive" ||
      invoice?.invoiceMode === "pay_before_receive" ||
      invoice?.autoCreatedFromPoApproval;

    if (matchedPO && !isPayBeforeReceive) {
      return "Approved";
    }
    if (isPayBeforeReceive) {
      return "Wait Invoice";
    }
    return "Received";
  }, [pos]);

  const normalizeInvoiceFlowStatus = useCallback((value: any) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "paid") return "paid";
    if (normalized === "inpay") return "Inpay";
    if (normalized === "invcredit") return "Invcredit";
    if (normalized === "deposit") return "Deposit";
    return "";
  }, []);

  const ensureConfiguredReceiveAfterPayment = useCallback(async (po: any) => {
    if (!po || !hasConfiguredReceiveAfterPayment(po)) return "";

    const existingReceive = (receives || []).find(
      (receive: any) => String(receive?.poId || "") === String(po.id || "")
    );
    if (existingReceive) {
      return existingReceive.rpNo || existingReceive.receiveNo || existingReceive.id || "";
    }

    const receiveSnap = await getDocs(query(
      collection(db, "artifacts", appId, "public", "data", "receives"),
      where("poId", "==", po.id)
    ));
    if (!receiveSnap.empty) {
      const receiveDoc = receiveSnap.docs[0];
      const receiveData = receiveDoc.data();
      return receiveData.rpNo || receiveData.receiveNo || receiveDoc.id || "";
    }

    const project = (projects || []).find((item: any) => item.id === po.projectId) || null;
    const configuredReceive = buildConfiguredReceiveData({
      po,
      setup: po.receivedAfterPaymentSetup,
      prs,
      vendors,
      receives,
      project,
      user,
      userData,
    });
    if (!configuredReceive) return "";

    const receiveOk = await addData("receives", configuredReceive.receiveData, null, { skipLog: true });
    if (!receiveOk) return "";

    await logAction?.(
      "Create Receive",
      `${buildCreateLogDetails("receives", configuredReceive.receiveData, configuredReceive.receiveNo || po.id)} | ที่มา: Restore received after payment from Invoice save`,
      po.projectId || selectedProjectId
    );
    return configuredReceive.receiveNo || "";
  }, [addData, appId, db, logAction, projects, prs, receives, selectedProjectId, user, userData, vendors]);

  const handleDeleteInvoice = useCallback((invoice: any) => {
    openConfirm?.(
      "ยืนยันการลบ",
      `ต้องการลบ Invoice ${invoice.invNo || invoice.id} ใช่หรือไม่?`,
      async () => {
        const hasBillingStage = Boolean(String(invoice?.billingNo || "").trim());
        const hasPayStage = Boolean(String(invoice?.payNo || "").trim());

        if (hasPayStage || hasBillingStage) {
          showAlert(
            "ยังลบไม่ได้",
            `Invoice ${invoice.invNo || invoice.id} อยู่ใน stage Billing/Pay กรุณาลบรายการปลายทางก่อนเพื่อให้สถานะถอยกลับ`,
            "warning"
          );
          return;
        }

        try {
          const batch = writeBatch(db);
          const nowIso = new Date().toISOString();
          batch.delete(doc(db, "artifacts", appId, "public", "data", "invoices", invoice.id));

          const poId = String(invoice?.poId || "");
          const matchedPO = pos.find((po) => String(po.id) === poId);
          if (poId && matchedPO) {
            const remainingInvoices = (invoices || []).filter((item: any) =>
              String(item.poId || "") === poId && String(item.id) !== String(invoice.id)
            );
            const remainingStatuses = remainingInvoices.map((item: any) => (
              getInvoiceOutstandingDepositAmount(item) > 0 ? "Deposit" : normalizeInvoiceFlowStatus(item?.status)
            ));

            let nextPoStatus = getBasePoStatusForInvoice(invoice);
            if (remainingStatuses.includes("paid")) nextPoStatus = "paid";
            else if (remainingStatuses.includes("Inpay")) nextPoStatus = "Inpay";
            else if (remainingStatuses.includes("Invcredit")) nextPoStatus = "Invcredit";
            else if (remainingStatuses.includes("Deposit")) nextPoStatus = "Deposit";

            batch.update(doc(db, "artifacts", appId, "public", "data", "pos", poId), {
              status: nextPoStatus,
              statusNow: nextPoStatus,
              updatedAt: nowIso,
            });
          }

          await batch.commit();
          await logAction?.(
            "Delete Invoice",
            `${buildDeleteLogDetails("invoices", invoice, invoice.id)} | ย้อนสถานะ PO ที่เกี่ยวข้อง`,
            invoice.projectId || selectedProjectId
          );
          showAlert("สำเร็จ", "ลบ Invoice และย้อนสถานะ PO เรียบร้อยแล้ว โดยคง Receive เดิมไว้", "success");
        } catch (error: any) {
          showAlert("เกิดข้อผิดพลาด", error?.message || String(error), "error");
        }
      },
      "danger"
    );
  }, [appId, db, getBasePoStatusForInvoice, invoices, logAction, normalizeInvoiceFlowStatus, openConfirm, pos, selectedProjectId, showAlert]);

  const handleDeleteInvoiceSource = useCallback((po: any) => {
    const isPaymentSubcontract = Boolean(po?.isPaymentSubcontract);
    const collectionName = isPaymentSubcontract ? "payments" : "pos";
    const label = isPaymentSubcontract ? "Payment" : "PO";
    const docNo = po?.paymentNo || po?.poNo || po?.id || "-";

    openConfirm?.(
      "ยืนยันการลบ",
      `ต้องการลบ ${label} ${docNo} ใช่หรือไม่?`,
      async () => {
        const linkedInvoice = (invoices || []).find(
          (invoice: any) => String(invoice?.poId || "") === String(po?.id || "")
        );
        if (linkedInvoice) {
          showAlert(
            "ยังลบไม่ได้",
            `${label} ${docNo} มี Invoice ${linkedInvoice.invNo || linkedInvoice.id} ผูกอยู่ กรุณา rollback จากขั้นตอนสุดท้ายก่อน`,
            "warning"
          );
          return;
        }

        if (!isPaymentSubcontract) {
          const linkedReceive = (receives || []).find(
            (receive: any) => String(receive?.poId || "") === String(po?.id || "")
          );
          if (linkedReceive) {
            showAlert(
              "ยังลบไม่ได้",
              `${label} ${docNo} มี Receive ${linkedReceive.rpNo || linkedReceive.receiveNo || linkedReceive.id} ผูกอยู่ กรุณา rollback จากขั้นตอนสุดท้ายก่อน`,
              "warning"
            );
            return;
          }
        }

        const ok = await deleteData(collectionName, po.id, { skipLog: true });
        if (!ok) return;

        await logAction?.(
          `Delete ${label}`,
          isPaymentSubcontract
            ? buildDeleteLogDetails("payments", po, po.id)
            : buildDeleteLogDetails("pos", po, po.id),
          po.projectId || selectedProjectId
        );
        showAlert("สำเร็จ", `ลบ ${label} ${docNo} เรียบร้อยแล้ว`, "success");
      },
      "danger"
    );
  }, [deleteData, invoices, logAction, openConfirm, receives, selectedProjectId, showAlert]);

  const closeInvoiceModal = useCallback((force = false) => {
    if (saving && !force) return;
    setViewingPO(null);
    setEditingInvoice(null);
  }, [saving]);

  const normalizePaymentSource = useCallback(
    (payment: any) => ({
      ...payment,
      isPaymentSubcontract: true,
      poNo: payment.paymentNo || payment.poNo || "-",
      poType: payment.paymentType || "SP",
      vendorId: payment.contractorId || payment.vendorId || "",
      vendorName: payment.contractorName || payment.vendorName || "",
      poDate: payment.openDate,
      poOpenDate: payment.openDate,
      receiveType: "Payment Subcontractor",
      grandTotal: Number(payment.amount) || 0,
      amount: Number(payment.amount) || 0,
      description:
        payment.description ||
        `Payment งวด ${payment.periodNo || ""} - ${payment.paymentNo || payment.id || ""}`,
      items: Array.isArray(payment.items)
        ? payment.items.map((it: any, idx: number) => ({
            ...it,
            poItemIndex: Number.isFinite(Number(it?.poItemIndex))
              ? Number(it.poItemIndex)
              : idx,
            description: it.description || "งานจ้างเหมา/ค่าแรง",
            unit: it.unit || "งวด",
            quantity: Number(it.quantity || 1) || 1,
            price: Number(it.thisPeriodAmount ?? it.price ?? it.amount ?? 0) || 0,
            amount: Number(it.thisPeriodAmount ?? it.amount ?? 0) || 0,
          }))
        : [],
    }),
    []
  );

  const getInvoiceSource = useCallback(
    (invoice: any) => {
      const matchedPO = pos.find((po) => po.id === invoice.poId);
      if (matchedPO) {
        const configuredItems = Array.isArray(matchedPO?.payBeforeReceiveInvoiceSetup?.items)
          ? matchedPO.payBeforeReceiveInvoiceSetup.items
          : [];
        const shouldUseConfiguredItems = Boolean(
          invoice?.invoiceMode === "pay_before_receive" ||
          matchedPO?.invoiceMode === "pay_before_receive" ||
          matchedPO?.payBeforeReceiveChecked
        );

        return {
          ...matchedPO,
          items:
            shouldUseConfiguredItems && configuredItems.length > 0
              ? configuredItems.map((item: any, idx: number) => ({
                  ...item,
                  poItemIndex: Number.isFinite(Number(item?.poItemIndex))
                    ? Number(item.poItemIndex)
                    : idx,
                  quantity: Number(item?.invoiceQty ?? item?.quantity ?? 0),
                  invoiceQty: Number(item?.invoiceQty ?? item?.quantity ?? 0),
                  price: Number(item?.price || 0),
                  amount: Number(item?.amount || 0),
                }))
              : matchedPO.items,
        };
      }

      const matchedPayment = (payments || []).find(
        (payment: any) =>
          payment.id === invoice.poId ||
          payment.paymentNo === invoice.poNo ||
          payment.paymentNo === invoice.poRef
      );
      if (matchedPayment) return normalizePaymentSource(matchedPayment);

      return {
        id: invoice.poId || invoice.id,
        poNo: invoice.poNo || invoice.poRef || "-",
        poType: "OTHER",
        vendorId: invoice.vendorId || "",
        vendorName: invoice.vendorName || "",
        amount: Number(invoice.amount) || 0,
        items: Array.isArray(invoice.items)
          ? invoice.items.map((item: any, idx: number) => ({
              ...item,
              poItemIndex: Number.isFinite(Number(item?.poItemIndex))
                ? Number(item.poItemIndex)
                : idx,
              quantity: Number(item.quantity || item.invoiceQty || 0),
              price: Number(item.price || 0),
              amount: Number(item.amount || 0),
            }))
          : [],
      };
    },
    [normalizePaymentSource, payments, pos]
  );

  const buildInvoiceItemsForForm = useCallback((source: any, invoice?: any) => {
    const invoiceItems = Array.isArray(invoice?.items) ? invoice.items : [];
    const sourceItems = Array.isArray(source?.items) ? source.items : [];
    const usedInvoiceIndexes = new Set<number>();

    const normalizedSourceItems = sourceItems.map((item: any, idx: number) => {
      const itemIndex = Number.isFinite(Number(item?.poItemIndex))
        ? Number(item.poItemIndex)
        : idx;
      const matchedIndex = invoiceItems.findIndex((invoiceItem: any) => {
        const invoiceItemIndex = Number.isFinite(Number(invoiceItem?.poItemIndex))
          ? Number(invoiceItem.poItemIndex)
          : -1;
        if (invoiceItemIndex === itemIndex) return true;
        return (
          String(invoiceItem?.materialNo || "") === String(item?.materialNo || "") &&
          String(invoiceItem?.description || "") === String(item?.description || "")
        );
      });
      const matchedItem = matchedIndex >= 0 ? invoiceItems[matchedIndex] : null;
      if (matchedIndex >= 0) usedInvoiceIndexes.add(matchedIndex);

      const maxQty = Number(item?.quantity ?? matchedItem?.quantity ?? 0);
      const invoiceQty = Number(
        matchedItem?.quantity ?? matchedItem?.invoiceQty ?? item?.quantity ?? 0
      );

      return {
        ...item,
        poItemIndex: itemIndex,
        quantity: maxQty,
        invoiceQty,
        checked: Boolean(matchedItem),
      };
    });

    const remainingInvoiceItems = invoiceItems
      .map((item: any, idx: number) => ({ item, idx }))
      .filter(({ idx }) => !usedInvoiceIndexes.has(idx))
      .map(({ item, idx }) => ({
        ...item,
        poItemIndex: Number.isFinite(Number(item?.poItemIndex))
          ? Number(item.poItemIndex)
          : sourceItems.length + idx,
        quantity: Number(item?.quantity ?? item?.invoiceQty ?? 0),
        invoiceQty: Number(item?.quantity ?? item?.invoiceQty ?? 0),
        checked: true,
      }));

    return [...normalizedSourceItems, ...remainingInvoiceItems];
  }, []);

  const getSelectedInvoiceDescription = useCallback(
    (items: any[], fallback = "-") => {
      const selectedItems = (items || []).filter((item) => item.checked);
      if (selectedItems.length === 0) return fallback;
      const firstDescription = selectedItems[0]?.description || fallback;
      return selectedItems.length > 1
        ? `${firstDescription} (+${selectedItems.length - 1} รายการ)`
        : firstDescription;
    },
    []
  );

  const openPODetail = (po: any) => {
    const source = getInvoiceSource({
      poId: po.id,
      invoiceMode: po?.payBeforeReceiveChecked ? "pay_before_receive" : "",
    });
    setEditingInvoice(null);
    setViewingPO(source);
      setInvoiceForm({
        invNo: "",
        invDate: new Date().toISOString().split("T")[0],
        paymentType: po.paymentType || "เครดิต",
        bankAccountNo: "",
        isDeposit: Boolean(po?.payBeforeReceiveInvoiceSetup?.isDeposit),
        depositAmount: Number(po?.payBeforeReceiveInvoiceSetup?.depositAmount || 0),
        originalDepositAmount: Number(po?.payBeforeReceiveInvoiceSetup?.depositAmount || 0),
        settleRemaining: false,
        items: buildInvoiceItemsForForm(source, { items: source?.items || [] }),
      });
  };

  const openInvoiceEditor = useCallback(
    (invoice: any) => {
      const source = getInvoiceSource(invoice);
      setEditingInvoice(invoice);
      setViewingPO(source);
      setInvoiceForm({
        invNo: invoice.invNo || "",
        invDate: invoice.invDate || new Date().toISOString().split("T")[0],
        paymentType: invoice.paymentType || source?.paymentType || "เครดิต",
        bankAccountNo: invoice.bankAccountNo || "",
        isDeposit: Boolean(invoice.isDeposit),
        depositAmount: Number(invoice.depositAmount || 0),
        originalDepositAmount: Number(invoice.depositAmount || 0),
        settleRemaining: false,
        items: buildInvoiceItemsForForm(source, invoice),
      });
    },
    [buildInvoiceItemsForForm, getInvoiceSource]
  );

  const openDepositSettlement = useCallback(
    (invoice: any) => {
      const source = getInvoiceSource(invoice);
      const originalDepositAmount = Number(invoice.depositAmount || 0);
      setEditingInvoice(invoice);
      setViewingPO(source);
      setInvoiceForm({
        invNo: invoice.invNo || "",
        invDate: invoice.invDate || new Date().toISOString().split("T")[0],
        paymentType: invoice.paymentType || source?.paymentType || "เครดิต",
        bankAccountNo: invoice.bankAccountNo || "",
        isDeposit: false,
        depositAmount: originalDepositAmount,
        originalDepositAmount,
        settleRemaining: true,
        items: buildInvoiceItemsForForm(source, invoice),
      });
    },
    [buildInvoiceItemsForForm, getInvoiceSource]
  );

  const handleSaveInvoice = async () => {
    if (isEditingInvoice) {
      if (!canEditInvoiceHistory) {
        showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์แก้ไขใบแจ้งหนี้", "warning");
        return;
      }
    } else if (!canUseFunction("invoice", "add")) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์บันทึกใบแจ้งหนี้", "warning");
      return;
    }
    if (!viewingPO) return;
    const isTransferPayment = invoiceForm.paymentType === "โอน";
    if (!invoiceForm.invNo.trim())
      return showAlert("กรุณากรอกข้อมูล", "กรุณากรอกเลขที่ใบแจ้งหนี้", "warning");
    if (isTransferPayment && !invoiceForm.bankAccountNo.trim())
      return showAlert("กรุณากรอกข้อมูล", "กรุณากรอกเลขบัญชี", "warning");

    if (invoiceForm.isDeposit && Number(invoiceForm.depositAmount || 0) <= 0)
      return showAlert("ข้อมูลไม่ครบ", "กรุณาระบุจำนวนเงินมัดจำ", "warning");

    const selectedItems = invoiceForm.items.filter((i) => i.checked);
    if (selectedItems.length === 0)
      return showAlert("ไม่มีรายการ", "กรุณาเลือกรายการอย่างน้อย 1 รายการ", "warning");

    setSaving(true);
    try {
      const calculatedAmount = selectedItems.reduce(
        (sum, item) => sum + Number(item.invoiceQty) * Number(item.price || 0),
        0
      );
      const originalDepositAmount = Number(
        invoiceForm.settleRemaining
          ? (invoiceForm.originalDepositAmount || editingInvoice?.depositAmount || 0)
          : (invoiceForm.depositAmount || 0)
      );
      const remainingAmount = Math.max(0, calculatedAmount - originalDepositAmount);
      const totalAmount =
        invoiceForm.settleRemaining
          ? remainingAmount
          : invoiceForm.isDeposit && Number(invoiceForm.depositAmount || 0) > 0
            ? Number(invoiceForm.depositAmount || 0)
            : calculatedAmount;
      if (invoiceForm.settleRemaining && totalAmount <= 0) {
        return showAlert("ข้อมูลไม่ถูกต้อง", "ไม่พบยอดคงเหลือสำหรับจ่ายส่วนที่เหลือ", "warning");
      }
      const invoiceStatus = getPoInvoiceStatus(invoiceForm.paymentType, !invoiceForm.settleRemaining && invoiceForm.isDeposit);
      const invoicePayload = {
        invNo: invoiceForm.invNo.trim(),
        invDate: invoiceForm.invDate,
        paymentType: invoiceForm.paymentType,
        bankAccountNo: isTransferPayment ? invoiceForm.bankAccountNo.trim() : "",
        poId: viewingPO.id,
        poNo: viewingPO.poNo,
        poRef: viewingPO.poNo || editingInvoice?.poRef || editingInvoice?.poNo,
        vendorId: viewingPO.vendorId,
        vendorName: getVendorName(
          viewingPO.vendorId,
          viewingPO.vendorName || editingInvoice?.vendorName
        ),
        items: selectedItems.map((item) => ({
          poItemIndex: item.poItemIndex,
          materialNo: item.materialNo || "",
          description: item.description || "",
          unit: item.unit || "",
          quantity: item.invoiceQty,
          price: item.price || 0,
          amount: Number(item.invoiceQty) * Number(item.price || 0),
        })),
        amount: totalAmount,
        isDeposit: Boolean(!invoiceForm.settleRemaining && invoiceForm.isDeposit),
        depositAmount: originalDepositAmount,
        originalAmount: calculatedAmount,
        remainingAmount: invoiceForm.settleRemaining
          ? 0
          : invoiceForm.isDeposit
            ? remainingAmount
            : 0,
        depositSettled: Boolean(invoiceForm.settleRemaining),
        invoiceMode:
          viewingPO?.invoiceMode ||
          editingInvoice?.invoiceMode ||
          (viewingPO?.payBeforeReceiveChecked ? "pay_before_receive" : ""),
        description: getSelectedInvoiceDescription(
          selectedItems,
          editingInvoice?.description || poDescription(viewingPO)
        ),
        projectId: editingInvoice?.projectId || selectedProjectId,
        status: invoiceStatus,
        createdBy:
          editingInvoice?.createdBy ||
          `${userData?.firstName || ""} ${userData?.lastName || ""}`.trim(),
      };

      if (isEditingInvoice) {
        const success = await updateData(
          "invoices",
          editingInvoice.id,
          invoicePayload,
          { skipLog: true }
        );
        if (success) {
          if (!viewingPO.isPaymentSubcontract) {
            await updateData(
              "pos",
              viewingPO.id,
              {
                status: invoiceStatus,
                statusNow: invoiceStatus,
              },
              { skipLog: true }
            );
            await ensureConfiguredReceiveAfterPayment(viewingPO);
          }
          await logAction(
            "Edit Invoice",
            `แก้ไข Invoice | ${getInvoiceLogSummary(editingInvoice, invoicePayload)} | มูลค่า: ${formatLogCurrency(invoicePayload.amount) || "฿0"}${invoiceForm.settleRemaining ? " | ดำเนินการจ่ายส่วนที่เหลือ" : ""}`,
            editingInvoice.projectId || selectedProjectId
          );
          closeInvoiceModal(true);
          showAlert("สำเร็จ", invoiceForm.settleRemaining ? "บันทึกยอดส่วนที่เหลือและส่งกลับเข้า flow หลักแล้ว" : "แก้ไขใบแจ้งหนี้เรียบร้อยแล้ว", "success");
        }
      } else {
        const success = await addData("invoices", invoicePayload, null, { skipLog: true });
        if (!success) return;
        await logAction(
          "Create Invoice",
          `สร้าง Invoice | ${getInvoiceLogSummary({ ...invoicePayload, id: invoicePayload.invNo || viewingPO.id })} | แหล่งที่มา: ${truncateLogText(viewingPO.poNo || viewingPO.id, 60)}`,
          selectedProjectId
        );

        if (!viewingPO.isPaymentSubcontract) {
          await updateData(
            "pos",
            viewingPO.id,
            {
              status: invoiceStatus,
              statusNow: invoiceStatus,
            },
            { skipLog: true }
          );
          await ensureConfiguredReceiveAfterPayment(viewingPO);
        }

        closeInvoiceModal(true);
        showAlert("สำเร็จ", "บันทึกใบแจ้งหนี้เรียบร้อยแล้ว", "success");
      }
    } catch (e: any) {
      showAlert("เกิดข้อผิดพลาด", e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const projectInvoices = useMemo(
    () => invoices.filter((inv) => inv.projectId === selectedProjectId),
    [invoices, selectedProjectId]
  );

  const canSettleDeposit = useCallback((invoice: any) => {
    return getInvoiceOutstandingDepositAmount(invoice) > 0;
  }, []);

  const historyInvoices = useMemo(
    () =>
      [...projectInvoices].sort((a: any, b: any) => {
        const aTime = new Date(a.invDate || a.createdAt || 0).getTime();
        const bTime = new Date(b.invDate || b.createdAt || 0).getTime();
        return bTime - aTime;
      }),
    [projectInvoices]
  );

  const pendingInvoices = useMemo(() => [], []);

  const filteredHistoryInvoices = useMemo(() => {
    if (!histSearch) return historyInvoices;
    const q = histSearch.toLowerCase();
    return historyInvoices.filter(
      (inv) =>
        (inv.invNo || "").toLowerCase().includes(q) ||
        (inv.poNo || inv.poRef || "").toLowerCase().includes(q) ||
        (inv.vendorName || "").toLowerCase().includes(q)
    );
  }, [historyInvoices, histSearch]);

  // ─── Computed totals for invoice items ────────────────────────────────────
  const invoiceTotalAmount = useMemo(
    () =>
      invoiceForm.items
        .filter((i) => i.checked)
        .reduce(
          (sum, i) => sum + Number(i.invoiceQty) * Number(i.price || 0),
          0
        ),
    [invoiceForm.items]
  );
  const isTransferPayment = invoiceForm.paymentType === "โอน";

  const invoiceListTotals = useMemo(
    () => ({
      exVat: filteredPOs.reduce((sum, po) => sum + getPoAmountExVat(po), 0),
      grand: filteredPOs.reduce(
        (sum, po) => sum + Number(po.grandTotal || po.amount || po.totalAmount || 0),
        0
      ),
    }),
    [filteredPOs, getPoAmountExVat]
  );

  return (
    <div className="space-y-4">
      {/* ── Page Header + Tabs ── */}
      <div className="flex items-center justify-between gap-4 bg-white/40 p-2 rounded-2xl border border-slate-100/50 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center shadow-sm">
              <FileText size={19} className="text-violet-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-violet-800 leading-none">
                F. ใบแจ้งหนี้ (Invoice)
              </h2>
              <p className="text-[10px] text-violet-400 mt-1">
                จัดการใบแจ้งหนี้จาก PO ที่รับสินค้าแล้ว
              </p>
            </div>
          </div>

          {/* ── Tabs ── */}
          <div className="flex items-center gap-1 bg-violet-50/50 rounded-xl border border-violet-100/50 p-1 w-fit">
            <button
              type="button"
              onClick={() => setActiveTab("po")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "po"
                  ? "bg-white text-violet-600 shadow-sm ring-1 ring-violet-200"
                  : "text-violet-400 hover:text-violet-600 hover:bg-white/50"
              }`}
            >
              <Package size={13} />
              PO พร้อมวางบิล
              <span
                className={`text-[9px] font-bold rounded-full px-1 py-0.5 min-w-[16px] text-center ${
                  activeTab === "po"
                    ? "bg-violet-100 text-violet-600"
                    : "bg-violet-50 text-violet-400"
                }`}
              >
                {invoiceEligiblePOs.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("history")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "history"
                  ? "bg-white text-amber-600 shadow-sm ring-1 ring-amber-200"
                  : "text-amber-400 hover:text-amber-600 hover:bg-white/50"
              }`}
            >
              <DollarSign size={13} />
              ประวัติ Invoice
              <span
                className={`text-[9px] font-bold rounded-full px-1 py-0.5 min-w-[16px] text-center ${
                  activeTab === "history"
                    ? "bg-amber-100 text-amber-600"
                    : "bg-amber-50 text-amber-400"
                }`}
              >
                {historyInvoices.length}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════
          Tab: PO พร้อมวางบิล
      ══════════════════════════════════════ */}
      {activeTab === "po" && (
        <div className="space-y-2">
          {/* Search toolbar */}
          <Card className="px-4 py-3 bg-gradient-to-r from-violet-50 to-purple-50 border-violet-100">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search
                  size={13}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-violet-300 pointer-events-none"
                />
                <input
                  type="text"
                  value={poPOSearch}
                  onChange={(e) => setPoPOSearch(e.target.value)}
                  placeholder="ค้นหา PO No."
                  className="pl-7 pr-2 py-1.5 text-xs border border-violet-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 w-36"
                />
              </div>
              <div className="relative">
                <Search
                  size={13}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-violet-300 pointer-events-none"
                />
                <input
                  type="text"
                  value={poVendorSearch}
                  onChange={(e) => setPoVendorSearch(e.target.value)}
                  placeholder="ค้นหา Vendor"
                  className="pl-7 pr-2 py-1.5 text-xs border border-violet-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 w-36"
                />
              </div>
              {(poPOSearch || poVendorSearch) && (
                <button
                  type="button"
                  onClick={() => {
                    setPoPOSearch("");
                    setPoVendorSearch("");
                  }}
                  className="text-slate-400 hover:text-red-500 transition-colors"
                >
                  <X size={13} />
                </button>
              )}
              <span className="ml-auto text-[11px] text-violet-400">
                {filteredPOs.length} รายการ
              </span>
            </div>
          </Card>

          {/* Empty state */}
          {Object.keys(groupedPOs).length === 0 ? (
            <Card className="py-12 text-center border-violet-100">
              <div className="w-14 h-14 rounded-full bg-violet-50 flex items-center justify-center mx-auto mb-3">
                <Package size={26} className="text-violet-300" />
              </div>
              <p className="text-sm font-medium text-slate-500">
                ไม่พบ PO ที่พร้อมวางบิล
              </p>
              <p className="text-xs text-slate-400 mt-1">
                แสดง PO สถานะ Received (โฟลวปกติ), Wait Invoice (Pay before receive), Wait Pay (Payment Subcontractor)
              </p>
            </Card>
          ) : (
            Object.entries(groupedPOs).map(([type, poList], groupIdx) => {
              const c = GROUP_COLORS[groupIdx % 2];
              const isExpanded = expandedTypes[type] !== false;
              return (
                <Card key={type} className={`overflow-hidden border ${c.border}`}>
                  {/* Group header */}
                  <button
                    type="button"
                    onClick={() => toggleType(type)}
                    className={`w-full flex items-center justify-between px-4 py-3 ${c.header} transition-colors`}
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown size={15} className="text-slate-500" />
                      ) : (
                        <ChevronRight size={15} className="text-slate-500" />
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-lg text-xs font-bold ${c.badge}`}
                      >
                        {type}
                      </span>
                      <span className="text-sm font-semibold text-slate-700">
                        {PO_TYPE_LABELS[type] || type}
                      </span>
                      <span className="text-xs text-slate-400">
                        ({poList.length} PO)
                      </span>
                    </div>
                  </button>

                  {/* Group table */}
                  {isExpanded && (
                    <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left text-xs text-slate-600 md:min-w-0">
                      <thead
                        className={`${c.thead} text-slate-500 uppercase font-semibold`}
                      >
                        <tr>
                          <th className="py-1.5 px-3 text-center md:hidden">Actions</th>
                          <th className="py-1.5 px-3">PO No.</th>
                          <th className="py-1.5 px-3">Vendor</th>
                          <th className="py-1.5 px-3">วันที่ PO</th>
                          <th className="py-1.5 px-3">รายละเอียด</th>
                          <th className="py-1.5 px-3 text-center">ใบตรวจรับ</th>
                          <th className="py-1.5 px-3 text-right">ยอดรวม</th>
                          <th className="hidden py-1.5 px-3 text-center md:table-cell">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {poList.map((po) => (
                          (() => {
                            const receiveDocs = receiveDocsByPoId[po.id] || [];
                            const latestReceiveWithPdf = receiveDocs.find((rcv) => rcv?.pdfUrl);
                            return (
                              <tr
                                key={po.id}
                                className={`${c.rowHover} cursor-pointer transition-colors`}
                                onClick={() => openPODetail(po)}
                              >
                                <td className="py-1.5 px-3 text-center md:hidden">
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      type="button"
                                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-medium transition-colors ${c.btn}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openPODetail(po);
                                      }}
                                    >
                                      <FileText size={11} /> ลงข้อมูลใบแจ้งหนี้
                                    </button>
                                    {canDeleteInvoiceSource && (
                                      <button
                                        type="button"
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-red-200 bg-red-50 text-[10px] font-medium text-red-600 transition-colors hover:bg-red-100"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteInvoiceSource(po);
                                        }}
                                        title="ลบรายการ"
                                      >
                                        <Trash2 size={11} />
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td
                                  className={`py-1.5 px-3 font-semibold ${c.poNo}`}
                                >
                                  {po.poNo}
                                </td>
                                <td className="py-1.5 px-3" title={getPoVendorName(po)}>
                                  {getPoVendorName(po)}
                                </td>
                                <td className="py-1.5 px-3 whitespace-nowrap">
                                  {formatDate(po.poDate || po.poOpenDate)}
                                </td>
                                <td
                                  className="py-1.5 px-3 max-w-[260px] truncate"
                                  title={poDescription(po)}
                                >
                                  {poDescription(po)}
                                </td>
                                <td className="hidden py-1.5 px-3 text-center md:table-cell">
                                  {latestReceiveWithPdf ? (
                                    <button
                                      type="button"
                                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-medium transition-colors ${c.btn}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        window.open(latestReceiveWithPdf.pdfUrl, "_blank", "noopener,noreferrer");
                                      }}
                                      title={latestReceiveWithPdf.rpNo || latestReceiveWithPdf.receiveNo || "เปิดใบตรวจรับสินค้า"}
                                    >
                                      <Eye size={11} />
                                      {latestReceiveWithPdf.rpNo || latestReceiveWithPdf.receiveNo || "ดูใบตรวจรับ"}
                                      {receiveDocs.length > 1 ? ` +${receiveDocs.length - 1}` : ""}
                                    </button>
                                  ) : (
                                    <span className="text-slate-300">-</span>
                                  )}
                                </td>
                                <td className="py-1.5 px-3 text-right font-semibold">
                                  {formatCurrency(po.grandTotal || po.amount || po.totalAmount || 0)}
                                </td>
                                <td className="py-1.5 px-3 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      type="button"
                                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-medium transition-colors ${c.btn}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openPODetail(po);
                                      }}
                                    >
                                      <FileText size={11} /> ลงข้อมูลใบแจ้งหนี้
                                    </button>
                                    {canDeleteInvoiceSource && (
                                      <button
                                        type="button"
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-red-200 bg-red-50 text-[10px] font-medium text-red-600 transition-colors hover:bg-red-100"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteInvoiceSource(po);
                                        }}
                                        title="ลบรายการ"
                                      >
                                        <Trash2 size={11} />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })()
                        ))}
                      </tbody>
                    </table>
                    </div>
                  )}
                </Card>
              );
            })
          )}

          <Card className="overflow-hidden border-slate-200">
            <table className="w-full text-left text-xs text-slate-600">
              <tfoot className="border-t-2 border-slate-300">
                <tr className="bg-slate-50">
                  <td className="px-3 py-2 text-right text-xs font-semibold text-slate-600">
                    ยอดรวมทั้งหมด (Ex VAT):
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-bold text-slate-800 w-40">
                    {formatCurrency(invoiceListTotals.exVat)}
                  </td>
                </tr>
                <tr className="bg-slate-100">
                  <td className="px-3 py-2 text-right text-xs font-semibold text-slate-700">
                    ยอดรวมทั้งหมด:
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-bold text-slate-900">
                    {formatCurrency(invoiceListTotals.grand)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </Card>

          {/* Pending invoice list stays in PO tab until paid */}
          <Card className="hidden">
            <div className="px-4 py-2 bg-violet-50/60 border-b border-violet-100 flex items-center justify-between">
              <h4 className="text-xs font-bold text-violet-700">Invoice รออนุมัติจ่าย</h4>
              <span className="text-[11px] text-violet-500">{pendingInvoices.length} รายการ</span>
            </div>
            <table className="w-full min-w-[860px] text-left text-xs text-slate-600 md:min-w-0">
              <thead className="bg-violet-50/40 text-slate-500 uppercase font-semibold border-b border-violet-100">
                <tr>
                  <th className="py-1.5 px-3 text-center md:hidden">Actions</th>
                  <th className="py-1.5 px-3">Invoice No.</th>
                  <th className="py-1.5 px-3">Ref. PO</th>
                  <th className="py-1.5 px-3">Vendor</th>
                  <th className="py-1.5 px-3">วันที่</th>
                  <th className="py-1.5 px-3">ประเภทการชำระเงิน</th>
                  <th className="py-1.5 px-3 text-right">จำนวนเงิน</th>
                  <th className="py-1.5 px-3 text-center">สถานะ</th>
                  <th className="hidden py-1.5 px-3 text-center md:table-cell">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-50">
                {pendingInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      ยังไม่มี Invoice ที่รออนุมัติจ่าย
                    </td>
                  </tr>
                ) : (
                  pendingInvoices.map((inv, idx) => (
                    <tr
                      key={inv.id}
                      className={`transition-colors ${
                        idx % 2 === 0 ? "bg-white" : "bg-violet-50/20"
                      } hover:bg-violet-50/40`}
                    >
                      <td className="py-1.5 px-3 md:hidden">
                        <div className="flex items-center justify-center gap-1">
                          {canUseFunction("invoice", "approve") &&
                            (userRoles.includes("PM") || userRoles.includes("Administrator")) &&
                            inv.status === "Pending PM" && (
                              <Button
                                variant="success"
                                size="sm"
                                className="px-2 py-0.5 text-[10px]"
                                onClick={() => undefined}
                              >
                                PM อนุมัติจ่าย
                              </Button>
                            )}
                          {canUseFunction("invoice", "delete") && (
                            <button
                              className="text-red-400 hover:text-red-600 transition-colors"
                              onClick={() => handleDeleteInvoice(inv)}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-1.5 px-3 font-semibold text-violet-700">{inv.invNo}</td>
                      <td className="py-1.5 px-3 font-medium text-amber-600">{inv.poNo || inv.poRef || "-"}</td>
                      <td className="py-1.5 px-3">{inv.vendorName || "-"}</td>
                      <td className="py-1.5 px-3">{inv.invDate || inv.receiveDate || "-"}</td>
                      <td className="py-1.5 px-3">
                        {inv.paymentType ? (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${getPaymentTypeBadgeClass(inv.paymentType)}`}
                          >
                            {inv.paymentType}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-right font-semibold">
                        {formatCurrency(inv.amount)}
                        {inv.isDeposit && (
                          <div className="mt-0.5 text-[10px] font-semibold text-violet-500">
                            มัดจำ
                            {getInvoiceOutstandingDepositAmount(inv) > 0
                              ? ` • คงเหลือ ${formatCurrency(getInvoiceOutstandingDepositAmount(inv))}`
                              : ""}
                          </div>
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-center">
                        <Badge status={getInvoiceDisplayStatus(inv)} />
                      </td>
                      <td className="hidden py-1.5 px-3 md:table-cell">
                        <div className="flex items-center justify-center gap-1">
                          {canUseFunction("invoice", "approve") &&
                            (userRoles.includes("PM") || userRoles.includes("Administrator")) &&
                            inv.status === "Pending PM" && (
                              <Button
                                variant="success"
                                size="sm"
                                className="px-2 py-0.5 text-[10px]"
                                onClick={() => undefined}
                              >
                                PM อนุมัติจ่าย
                              </Button>
                            )}
                          {canUseFunction("invoice", "delete") && (
                            <button
                              className="text-red-400 hover:text-red-600 transition-colors"
                              onClick={() => handleDeleteInvoice(inv)}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════
          Tab: ประวัติ Invoice
      ══════════════════════════════════════ */}
      {activeTab === "history" && (
        <div className="space-y-2">
          {/* Search */}
          <Card className="px-4 py-3 bg-gradient-to-r from-amber-50 to-orange-50 border-amber-100">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search
                  size={13}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-amber-300 pointer-events-none"
                />
                <input
                  type="text"
                  value={histSearch}
                  onChange={(e) => setHistSearch(e.target.value)}
                  placeholder="ค้นหา Invoice / PO / Vendor"
                  className="pl-7 pr-2 py-1.5 text-xs border border-amber-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 w-60"
                />
              </div>
              {histSearch && (
                <button
                  onClick={() => setHistSearch("")}
                  className="text-slate-400 hover:text-red-500"
                >
                  <X size={13} />
                </button>
              )}
              <span className="ml-auto text-[11px] text-amber-400">
                {filteredHistoryInvoices.length} รายการ
              </span>
            </div>
          </Card>

          {/* Invoice table */}
          <Card className="overflow-x-auto border-amber-100">
            <table className="w-full min-w-[860px] text-left text-xs text-slate-600 md:min-w-0">
              <thead className="bg-gradient-to-r from-amber-50 to-orange-50 text-slate-600 uppercase font-semibold border-b border-amber-100">
                <tr>
                  <th className="py-1.5 px-3 text-center md:hidden">Actions</th>
                  <th className="py-1.5 px-3">Invoice No.</th>
                  <th className="py-1.5 px-3">Ref. PO</th>
                  <th className="py-1.5 px-3">Vendor</th>
                  <th className="py-1.5 px-3">วันที่</th>
                  <th className="py-1.5 px-3">ประเภทชำระ</th>
                  <th className="py-1.5 px-3 text-right">จำนวนเงิน</th>
                  <th className="py-1.5 px-3 text-center">สถานะ</th>
                  <th className="hidden py-1.5 px-3 text-center md:table-cell">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-50">
                {filteredHistoryInvoices.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="py-10 text-center text-slate-400"
                    >
                      <DollarSign
                        size={28}
                        className="mx-auto mb-2 opacity-25"
                      />
                      ไม่มีข้อมูล Invoice ในประวัติ
                    </td>
                  </tr>
                ) : (
                  filteredHistoryInvoices.map((inv, idx) => (
                    <tr
                      key={inv.id}
                      className={`transition-colors ${
                        idx % 2 === 0 ? "bg-white" : "bg-amber-50/25"
                      } hover:bg-amber-50/60`}
                    >
                      <td className="py-1.5 px-3 md:hidden">
                        <div className="flex items-center justify-center gap-1">
                          {canEditInvoiceHistory && (
                            <button
                              className="text-amber-500 hover:text-amber-700 transition-colors"
                              onClick={() => openInvoiceEditor(inv)}
                              title="แก้ไข Invoice"
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                          {canEditInvoiceHistory && canSettleDeposit(inv) && (
                            <button
                              className="rounded-lg bg-fuchsia-50 px-2 py-1 text-[10px] font-semibold text-fuchsia-700 transition-colors hover:bg-fuchsia-100"
                              onClick={() => openDepositSettlement(inv)}
                              title="จ่ายส่วนที่เหลือ"
                            >
                              จ่ายส่วนที่เหลือ
                            </button>
                          )}
                          {canUseFunction("invoice", "delete") && (
                            <button
                              className="text-red-400 hover:text-red-600 transition-colors"
                              onClick={() => handleDeleteInvoice(inv)}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-1.5 px-3 font-semibold text-amber-700">
                        {inv.invNo}
                      </td>
                      <td className="py-1.5 px-3 font-medium text-violet-600">
                        {inv.poNo || inv.poRef || "-"}
                      </td>
                      <td className="hidden py-1.5 px-3 md:table-cell">
                        {inv.vendorName || "-"}
                      </td>
                      <td className="py-1.5 px-3">
                        {inv.invDate || inv.receiveDate || "-"}
                      </td>
                      <td className="py-1.5 px-3">
                        {inv.paymentType ? (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${getPaymentTypeBadgeClass(inv.paymentType)}`}
                          >
                            {inv.paymentType}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-right font-semibold">
                        {formatCurrency(inv.amount)}
                        {inv.isDeposit && (
                          <div className="mt-0.5 text-[10px] font-semibold text-amber-500">
                            มัดจำ
                            {getInvoiceOutstandingDepositAmount(inv) > 0
                              ? ` • คงเหลือ ${formatCurrency(getInvoiceOutstandingDepositAmount(inv))}`
                              : ""}
                          </div>
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-center">
                        <Badge status={getInvoiceDisplayStatus(inv)} />
                      </td>
                      <td className="py-1.5 px-3">
                        <div className="flex items-center justify-center gap-1">
                          {canEditInvoiceHistory && (
                            <button
                              className="text-amber-500 hover:text-amber-700 transition-colors"
                              onClick={() => openInvoiceEditor(inv)}
                              title="แก้ไข Invoice"
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                          {canEditInvoiceHistory && canSettleDeposit(inv) && (
                            <button
                              className="rounded-lg bg-fuchsia-50 px-2 py-1 text-[10px] font-semibold text-fuchsia-700 transition-colors hover:bg-fuchsia-100"
                              onClick={() => openDepositSettlement(inv)}
                              title="จ่ายส่วนที่เหลือ"
                            >
                              จ่ายส่วนที่เหลือ
                            </button>
                          )}
                          {canUseFunction("invoice", "delete") && (
                            <button
                              className="text-red-400 hover:text-red-600 transition-colors"
                              onClick={() => handleDeleteInvoice(inv)}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════
          Modal: ลงข้อมูลใบแจ้งหนี้
      ══════════════════════════════════════ */}
      <AnimatePresence>
        {viewingPO && (
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-start justify-center z-[10010] p-4 overflow-y-auto"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={modalOverlayVariants}
            transition={overlayTransition}
            onClick={() => closeInvoiceModal()}
          >
            <motion.div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8"
              variants={modalContentVariants}
              transition={modalTransition}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-violet-100 bg-gradient-to-r from-violet-50 via-purple-50 to-white rounded-t-2xl">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
                    <FileText size={20} className="text-violet-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-violet-800">
                      {isEditingInvoice ? "แก้ไขใบแจ้งหนี้" : "ลงข้อมูลใบแจ้งหนี้"}
                    </h3>
                    <p className="text-xs text-violet-400">
                      {viewingPO.poNo} —{" "}
                      {getVendorName(viewingPO.vendorId, viewingPO.vendorName)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => closeInvoiceModal()}
                  className="p-2 rounded-lg hover:bg-violet-100 text-violet-400 hover:text-violet-600 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-4 max-h-[72vh] overflow-y-auto custom-scrollbar space-y-3">
                {/* PO Info Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    {
                      label: "PO No.",
                      value: viewingPO.poNo,
                      tone: "violet",
                    },
                    {
                      label: "ประเภท PO",
                      value:
                        PO_TYPE_LABELS[viewingPO.poType] ||
                        viewingPO.poType ||
                        "-",
                      tone: "violet",
                    },
                    {
                      label: "Vendor",
                      value: getVendorName(viewingPO.vendorId, viewingPO.vendorName),
                      tone: "amber",
                    },
                    {
                      label: "ยอด PO",
                      value: formatCurrency(viewingPO.amount),
                      tone: "amber",
                    },
                  ].map((f) => (
                    <div
                      key={f.label}
                      className={`rounded-lg p-2.5 ${
                        f.tone === "violet"
                          ? "bg-violet-50 border border-violet-100"
                          : "bg-amber-50 border border-amber-100"
                      }`}
                    >
                      <p
                        className={`text-[9px] font-semibold uppercase tracking-wide ${
                          f.tone === "violet"
                            ? "text-violet-400"
                            : "text-amber-400"
                        }`}
                      >
                        {f.label}
                      </p>
                      <p
                        className={`text-xs font-bold truncate mt-0.5 ${
                          f.tone === "violet"
                            ? "text-violet-800"
                            : "text-amber-800"
                        }`}
                        title={String(f.value)}
                      >
                        {f.value}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Invoice Entry Fields */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-gradient-to-r from-violet-50/60 to-amber-50/60 rounded-xl p-3 border border-violet-100">
                  <div>
                    <label className="flex items-center gap-1 text-xs font-semibold text-violet-700 mb-1.5">
                      <FileText size={11} /> เลขที่ใบแจ้งหนี้{" "}
                      <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น INV 69030001"
                      value={invoiceForm.invNo}
                      onChange={(e) =>
                        setInvoiceForm((f) => ({
                          ...f,
                          invNo: e.target.value,
                        }))
                      }
                      className="w-full border border-violet-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 bg-white"
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-1 text-xs font-semibold text-violet-700 mb-1.5">
                      <Calendar size={11} /> วันที่ใบแจ้งหนี้
                    </label>
                    <input
                      type="date"
                      value={invoiceForm.invDate}
                      onChange={(e) =>
                        setInvoiceForm((f) => ({
                          ...f,
                          invDate: e.target.value,
                        }))
                      }
                      className="w-full border border-violet-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 bg-white"
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-1 text-xs font-semibold text-amber-700 mb-1.5">
                      <CreditCard size={11} /> ประเภทการชำระเงิน
                    </label>
                    <select
                      value={invoiceForm.paymentType}
                      onChange={(e) =>
                        setInvoiceForm((f) => ({
                          ...f,
                          paymentType: e.target.value,
                          bankAccountNo: e.target.value === "โอน" ? f.bankAccountNo : "",
                        }))
                      }
                      className="w-full border border-amber-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 bg-white"
                    >
                      {PAYMENT_TYPES.map((pt) => (
                        <option key={pt} value={pt}>
                          {pt}
                        </option>
                      ))}
                    </select>
                  </div>
                  {isTransferPayment && (
                    <div className="md:col-span-2">
                      <label className="flex items-center gap-1 text-xs font-semibold text-sky-700 mb-1.5">
                        <CreditCard size={11} /> เลขบัญชี
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={invoiceForm.bankAccountNo}
                        onChange={(e) =>
                          setInvoiceForm((f) => ({
                            ...f,
                            bankAccountNo: e.target.value,
                          }))
                        }
                        placeholder="กรอกเลขบัญชีสำหรับการโอน"
                        className="w-full border border-sky-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-400 bg-white"
                      />
                    </div>
                  )}
                  <div className="md:col-span-3 rounded-xl border border-violet-100 bg-white/80 p-3">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <label className={`inline-flex items-center gap-2 text-sm font-semibold ${isFixedPayBeforeReceiveInvoice ? "text-violet-800" : "text-slate-400"}`}>
                        <input
                          type="checkbox"
                          checked={!!invoiceForm.isDeposit}
                          disabled={isFixedPayBeforeReceiveInvoice}
                          onChange={(e) =>
                            setInvoiceForm((f) => ({
                              ...f,
                              isDeposit: e.target.checked,
                              depositAmount: e.target.checked ? f.depositAmount : 0,
                            }))
                          }
                          className="accent-violet-500 w-3.5 h-3.5 disabled:opacity-60"
                        />
                        <span>มัดจำ</span>
                      </label>
                      {invoiceForm.isDeposit && (
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-semibold text-violet-700">จำนวนเงินมัดจำ</label>
                          <input
                            type="number"
                            min={0}
                            value={invoiceForm.depositAmount || ""}
                            disabled={isFixedPayBeforeReceiveInvoice}
                            onChange={(e) =>
                              setInvoiceForm((f) => ({
                                ...f,
                                depositAmount: Number(e.target.value),
                              }))
                            }
                            className="w-40 border border-violet-200 rounded-xl px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:bg-slate-100 disabled:text-slate-400"
                            placeholder="0.00"
                          />
                        </div>
                      )}
                    </div>
                    {isFixedPayBeforeReceiveInvoice && (
                      <div className="mt-2 text-[11px] text-violet-600">
                        {invoiceForm.settleRemaining
                          ? `กำลังบันทึกยอดส่วนที่เหลือ ${formatCurrency(Math.max(0, invoiceTotalAmount - Number(invoiceForm.originalDepositAmount || 0)))} หลังหักมัดจำ ${formatCurrency(invoiceForm.originalDepositAmount || 0)}`
                          : "Invoice จาก flow จ่ายก่อนรับของ จะอ้างอิงจำนวนและยอดมัดจำจากข้อมูลที่ตั้งค่าไว้"}
                      </div>
                    )}
                  </div>
                </div>

                {/* Items Table */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      รายการสินค้าจาก PO
                      <span className="text-[11px] font-normal text-slate-400">
                        ({invoiceForm.items.length} รายการ) — เลือกรายการที่ต้องการวางบิล
                      </span>
                    </h4>
                  </div>
                  <div className="border border-violet-100 rounded-xl overflow-hidden">
                    <table className="w-full text-xs text-slate-600">
                      <thead className="bg-gradient-to-r from-violet-50 to-purple-50 text-slate-500 uppercase font-semibold">
                        <tr>
                          <th className="py-1.5 px-3 text-center w-8">
                            <input
                              type="checkbox"
                              checked={
                                invoiceForm.items.length > 0 &&
                                invoiceForm.items.every((i) => i.checked)
                              }
                              onChange={(e) =>
                                setInvoiceForm((f) => ({
                                  ...f,
                                  items: f.items.map((item) => ({
                                    ...item,
                                    checked: e.target.checked,
                                  })),
                                }))
                              }
                              className="accent-violet-500 w-3.5 h-3.5"
                            />
                          </th>
                          <th className="py-1.5 px-3">#</th>
                          <th className="py-1.5 px-3">รหัสวัสดุ</th>
                          <th className="py-1.5 px-3">รายละเอียด</th>
                          <th className="py-1.5 px-3 text-center">หน่วย</th>
                          <th className="py-1.5 px-3 text-right">ราคา/หน่วย</th>
                          <th className="py-1.5 px-3 text-right w-24">
                            จำนวนวางบิล
                          </th>
                          <th className="py-1.5 px-3 text-right">จำนวนเงิน</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-violet-50">
                        {invoiceForm.items.map((item, idx) => (
                          <tr
                            key={idx}
                            className={`transition-colors ${
                              !item.checked
                                ? "opacity-40 bg-slate-50"
                                : idx % 2 === 0
                                ? "bg-white"
                                : "bg-violet-50/20"
                            }`}
                          >
                            <td className="py-1.5 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={item.checked}
                                onChange={(e) =>
                                  setInvoiceForm((f) => ({
                                    ...f,
                                    items: f.items.map((it, i) =>
                                      i === idx
                                        ? { ...it, checked: e.target.checked }
                                        : it
                                    ),
                                  }))
                                }
                                className="accent-violet-500 w-3.5 h-3.5"
                              />
                            </td>
                            <td className="py-1.5 px-3 text-slate-400">
                              {idx + 1}
                            </td>
                            <td className="py-1.5 px-3 font-mono text-[10px] text-slate-500">
                              {item.materialNo || "-"}
                            </td>
                            <td className="py-1.5 px-3">
                              {item.description || "-"}
                            </td>
                            <td className="py-1.5 px-3 text-center">
                              {item.unit || "-"}
                            </td>
                            <td className="py-1.5 px-3 text-right">
                              {formatCurrency(item.price || 0)}
                            </td>
                            <td className="py-1.5 px-3 text-right">
                              {isFixedPayBeforeReceiveInvoice ? (
                                <span className="font-medium text-slate-700">{Number(item.invoiceQty || 0)}</span>
                              ) : (
                                <input
                                  type="number"
                                  min={0}
                                  max={item.quantity}
                                  value={item.invoiceQty}
                                  disabled={!item.checked}
                                  onChange={(e) =>
                                    setInvoiceForm((f) => ({
                                      ...f,
                                      items: f.items.map((it, i) =>
                                        i === idx
                                          ? {
                                              ...it,
                                              invoiceQty: Number(e.target.value),
                                            }
                                          : it
                                      ),
                                    }))
                                  }
                                  className="w-20 border border-violet-200 rounded-lg px-2 py-1 text-right text-xs focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white disabled:bg-slate-50 disabled:cursor-not-allowed"
                                />
                              )}
                            </td>
                            <td className="py-1.5 px-3 text-right font-semibold text-violet-700">
                              {formatCurrency(
                                Number(item.invoiceQty) *
                                  Number(item.price || 0)
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gradient-to-r from-amber-50 to-orange-50 border-t border-amber-100">
                        <tr>
                          <td
                            colSpan={7}
                            className="py-3 px-3 text-right text-sm font-bold text-amber-700"
                          >
                            รวมยอดวางบิล
                          </td>
                          <td className="py-3 px-3 text-right text-sm font-bold text-amber-700">
                            {formatCurrency(
                              invoiceForm.settleRemaining
                                ? Math.max(0, invoiceTotalAmount - Number(invoiceForm.originalDepositAmount || 0))
                                : invoiceForm.isDeposit && Number(invoiceForm.depositAmount || 0) > 0
                                  ? Number(invoiceForm.depositAmount || 0)
                                  : invoiceTotalAmount
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-between px-5 py-3 border-t border-violet-100 bg-gradient-to-r from-violet-50/40 to-amber-50/40 rounded-b-2xl">
                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <AlertCircle size={11} />
                  {isEditingInvoice
                    ? "Administrator สามารถแก้ไขข้อมูล Invoice ได้จากตารางประวัติ"
                    : "หลังบันทึก สถานะ PO จะเปลี่ยนตาม Receive Type"}
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => closeInvoiceModal()}
                    disabled={saving}
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    ยกเลิก
                  </button>
                  {(isEditingInvoice ? canEditInvoiceHistory : canUseFunction("invoice", "add")) && (
                    <button
                      type="button"
                      onClick={handleSaveInvoice}
                      disabled={saving}
                      className="flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 shadow-md shadow-violet-200 transition-all disabled:opacity-50"
                    >
                      {saving ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          กำลังบันทึก...
                        </>
                      ) : (
                        <>
                          <Check size={14} /> {isEditingInvoice ? "บันทึกการแก้ไข" : "บันทึกใบแจ้งหนี้"}
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default InvoiceView;
