// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { collection, doc, onSnapshot, query, writeBatch } from "firebase/firestore";
import { AnimatePresence, motion } from "framer-motion";




import {
  Calendar,
  CreditCard,
  FileText,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { useAppData } from "../contexts/AppDataContext";
import { useUI } from "../contexts/UIContext";
import { Badge, Button, Card, formatCurrency } from "../components/ui";
import {
  modalContentVariants,
  modalOverlayVariants,
  modalTransition,
  overlayTransition,
} from "../lib/animations";
import {
  buildDeleteLogDetails,
  buildRecordSummary,
  formatLogCurrency,
  truncateLogText,
} from "../lib/systemLogDetails";
import { buildConfiguredReceiveData } from "../lib/poDocumentFlow";

const VIEW_CONFIG = {
  billing: {
    moduleKey: "billing",
    collectionName: "billings",
    title: "Billing",
    titlePrefix: "G.",
    description: "สร้างและจัดการรายการ Billing แบบตาราง พร้อมปุ่มสร้างรายการใหม่",
    numberLabel: "Billing No.",
    numberPlaceholder: "เช่น BILL-0001",
    refLabel: "Ref. PO",
    emptyText: "ยังไม่มีรายการ Billing สำหรับโครงการนี้",
    actionLabel: "สร้าง Billing",
    editLabel: "แก้ไข Billing",
    deleteLabel: "ลบ Billing",
    saveLogLabel: "Billing",
    icon: ReceiptText,
    theme: {
      iconBox: "bg-gradient-to-br from-cyan-100 to-sky-100",
      iconText: "text-cyan-700",
      title: "text-cyan-800",
      desc: "text-cyan-500",
      accent: "bg-cyan-600 hover:bg-cyan-700",
      border: "border-cyan-100",
      soft: "bg-cyan-50/60",
      head: "from-cyan-50 to-sky-50",
      altRow: "bg-cyan-50/20",
      hoverRow: "hover:bg-cyan-50/60",
      number: "text-cyan-700",
      edit: "text-cyan-500 hover:text-cyan-700",
      filterIcon: "text-cyan-300",
      filterBorder: "border-cyan-200 focus:ring-cyan-200 focus:border-cyan-400",
    },
  },
  pay: {
    moduleKey: "pay",
    collectionName: "pays",
    title: "Pay",
    titlePrefix: "H.",
    description: "สร้างและจัดการรายการ Pay แบบตาราง พร้อมปุ่มสร้างรายการใหม่",
    numberLabel: "Pay No.",
    numberPlaceholder: "เช่น PAY-0001",
    refLabel: "Ref. Billing/PO",
    emptyText: "ยังไม่มีรายการ Pay สำหรับโครงการนี้",
    actionLabel: "สร้าง Pay",
    editLabel: "แก้ไข Pay",
    deleteLabel: "ลบ Pay",
    saveLogLabel: "Pay",
    icon: Wallet,
    theme: {
      iconBox: "bg-gradient-to-br from-emerald-100 to-teal-100",
      iconText: "text-emerald-700",
      title: "text-emerald-800",
      desc: "text-emerald-500",
      accent: "bg-emerald-600 hover:bg-emerald-700",
      border: "border-emerald-100",
      soft: "bg-emerald-50/60",
      head: "from-emerald-50 to-teal-50",
      altRow: "bg-emerald-50/20",
      hoverRow: "hover:bg-emerald-50/60",
      number: "text-emerald-700",
      edit: "text-emerald-500 hover:text-emerald-700",
      filterIcon: "text-emerald-300",
      filterBorder: "border-emerald-200 focus:ring-emerald-200 focus:border-emerald-400",
    },
  },
};

const PAYMENT_TYPES = ["เครดิต", "โอน", "เช็ค", "เงินสด"];
const BILLING_PAYMENT_TYPES = PAYMENT_TYPES.filter((item) => item !== "เครดิต");
const PAY_PAYMENT_TYPES = ["เงินสด", "โอน", "เช็ค"];

const getDefaultForm = () => ({
  docNo: "",
  docDate: new Date().toISOString().split("T")[0],
  dueDate: "",
  vendorId: "",
  vendorName: "",
  poRef: "",
  paymentType: "เครดิต",
  amount: "",
  selectedInvoiceIds: [],
  selectedBillingIds: [],
  description: "",
  note: "",
  status: "Draft",
});

const VAT_RATE = 0.07;

const getInvoiceAmountBeforeVat = (invoice: any) => Number(invoice?.amount || 0);

const getInvoiceConfiguredAmount = (invoice: any) =>
  Array.isArray(invoice?.items)
    ? invoice.items.reduce((sum: number, item: any) => sum + Number(item?.amount || (Number(item?.quantity || 0) * Number(item?.price || 0))), 0)
    : 0;

const getInvoiceOutstandingDepositAmount = (invoice: any) => {
  if (!invoice?.isDeposit) return 0;
  const explicitRemaining = Number(invoice?.remainingAmount);
  if (Number.isFinite(explicitRemaining) && explicitRemaining > 0) return explicitRemaining;
  const configuredAmount = getInvoiceConfiguredAmount(invoice);
  return Math.max(0, configuredAmount - Number(invoice?.depositAmount || 0));
};

const hasOutstandingDeposit = (invoice: any) => getInvoiceOutstandingDepositAmount(invoice) > 0;

const getInvoiceAmountAfterVat = (invoice: any) => {
  const beforeVat = getInvoiceAmountBeforeVat(invoice);
  return beforeVat + beforeVat * VAT_RATE;
};

const getInvoiceVendorKey = (invoice: any) =>
  String(invoice?.vendorId || invoice?.vendorName || "").trim();

const getBillingVendorKey = (billing: any) =>
  String(billing?.vendorId || billing?.vendorName || "").trim();

const getDocumentVendorKey = (record: any) =>
  String(record?.vendorId || record?.vendorName || "").trim();

const getVendorDisplayName = (record: any, fallbackKey = "") =>
  String(record?.vendorName || fallbackKey || "").trim();

const normalizeIdList = (values: any[] = []) =>
  Array.from(new Set((values || []).map((value) => String(value)).filter(Boolean)));

const isCreditInvoice = (invoice: any) => {
  const status = String(invoice?.status || "").trim().toLowerCase();
  const paymentType = String(invoice?.paymentType || "").trim().toLowerCase();
  if (status === "deposit" || hasOutstandingDeposit(invoice)) return false;
  if (status === "inpay") return false;
  return status === "invcredit" || paymentType === "เครดิต";
};

const isInpayStatus = (value: any) => String(value || "").trim().toLowerCase() === "inpay";
const isPaidStatus = (value: any) => String(value || "").trim().toLowerCase() === "paid";
const isPaidInvoiceRecord = (invoice: any) => {
  if (isPaidStatus(invoice?.status) || isPaidStatus(invoice?.statusNow)) return true;
  const paymentType = String(invoice?.paymentType || "").trim();
  if (["เงินสด", "โอน", "เช็ค"].includes(paymentType)) return true;
  return false;
};

const getLedgerCollectionName = (menuType: string) => (menuType === "pay" ? "pays" : "billings");

const BillingPayView = React.memo(({ menuType = "billing" }) => {
  const config = VIEW_CONFIG[menuType] || VIEW_CONFIG.billing;
  const Icon = config.icon;
  const {
    db,
    appId,
    pos = [],
    invoices: contextInvoices = [],
    receives = [],
    vendors = [],
    projects = [],
    prs = [],
    addData,
    updateData,
    deleteData,
    showAlert,
    openConfirm,
    logAction,
    userData,
    user,
    canUseFunction,
  } = useAppData();
  const { selectedProjectId } = useUI();

  const [rows, setRows] = useState([]);
  const [localInvoices, setLocalInvoices] = useState([]);
  const [billingRows, setBillingRows] = useState([]);
  const [payRows, setPayRows] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingRow, setEditingRow] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState(getDefaultForm());
  const [activeBillingTab, setActiveBillingTab] = useState<"current" | "history">("current");
  const [activePayTab, setActivePayTab] = useState<"current" | "history">("current");

  const canCreate = canUseFunction(config.moduleKey, "create");
  const canEdit = canUseFunction(config.moduleKey, "edit");
  const canDelete = canUseFunction(config.moduleKey, "delete");
  const isBillingMode = config.moduleKey === "billing";
  const isPayMode = config.moduleKey === "pay";
  const invoices = useMemo(() => {
    const invoiceMap = new Map();
    [...(contextInvoices || []), ...(localInvoices || [])].forEach((invoice: any) => {
      if (!invoice?.id) return;
      invoiceMap.set(String(invoice.id), invoice);
    });
    return Array.from(invoiceMap.values());
  }, [contextInvoices, localInvoices]);
  const logCollectionName = getLedgerCollectionName(config.moduleKey);
  const getRowLogSummary = useCallback(
    (row: any, patch: any = null) => buildRecordSummary(logCollectionName, patch ? { ...row, ...patch } : row, row?.id),
    [logCollectionName]
  );

  const syncPoStatusForInvoiceIds = useCallback(
    async (invoiceIds: string[], status: string) => {
      const ids = Array.from(new Set((invoiceIds || []).map(String).filter(Boolean)));
      if (ids.length === 0 || !status) return;

      const poIds = Array.from(new Set(
        ids
          .map((invoiceId) => invoices.find((invoice: any) => String(invoice.id) === invoiceId)?.poId)
          .filter(Boolean)
      ));
      if (poIds.length === 0) return;

      const updates = await Promise.all(
        poIds.map((poId: string) =>
          updateData(
            "pos",
            poId,
            {
              status,
              statusNow: status,
              updatedAt: new Date().toISOString(),
            },
            { skipLog: true }
          )
        )
      );

      if (updates.some((result) => !result)) {
        throw new Error("เปลี่ยนสถานะ PO ตาม Invoice บางรายการไม่สำเร็จ");
      }
    },
    [invoices, updateData]
  );

  const getBasePoStatus = useCallback((po: any) => {
    if (!po) return "Received";
    if (po?.payBeforeReceiveChecked || po?.invoiceMode === "pay_before_receive") return "Wait Invoice";
    return "Received";
  }, []);

  const normalizeInvoiceFlowStatus = useCallback((value: any) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "paid") return "paid";
    if (normalized === "inpay") return "Inpay";
    if (normalized === "invcredit") return "Invcredit";
    if (normalized === "deposit") return "Deposit";
    return "";
  }, []);

  const getNextPoStatusFromInvoices = useCallback((poId: string, invoiceOverrides: Map<string, any> = new Map(), deletedInvoiceIds: Set<string> = new Set()) => {
    const po = (pos || []).find((item: any) => String(item.id) === String(poId));
    if (!po) return null;

    const remainingInvoices = (invoices || [])
      .filter((invoice: any) => String(invoice.poId || "") === String(poId) && !deletedInvoiceIds.has(String(invoice.id)))
      .map((invoice: any) => (
        invoiceOverrides.has(String(invoice.id))
          ? { ...invoice, ...invoiceOverrides.get(String(invoice.id)) }
          : invoice
      ));

    const statuses = remainingInvoices.map((invoice: any) => (
      hasOutstandingDeposit(invoice) ? "Deposit" : normalizeInvoiceFlowStatus(invoice?.status)
    ));
    if (statuses.includes("paid")) return "paid";
    if (statuses.includes("Inpay")) return "Inpay";
    if (statuses.includes("Invcredit")) return "Invcredit";
    if (statuses.includes("Deposit")) return "Deposit";
    return getBasePoStatus(po);
  }, [getBasePoStatus, invoices, normalizeInvoiceFlowStatus, pos]);

  const getEffectiveInvoicesForPo = useCallback((poId: string, invoiceOverrides: Map<string, any> = new Map()) => {
    return (invoices || [])
      .filter((invoice: any) => String(invoice?.poId || "") === String(poId))
      .map((invoice: any) => (
        invoiceOverrides.has(String(invoice.id))
          ? { ...invoice, ...invoiceOverrides.get(String(invoice.id)) }
          : invoice
      ));
  }, [invoices]);

  const getPayLinkedAutoReceives = useCallback((docNo: string) => {
    const normalizedDocNo = String(docNo || "").trim();
    if (!normalizedDocNo) return [];
    return (receives || []).filter((receive: any) => (
      receive?.autoCreatedFromPayDocument &&
      String(receive?.sourcePayNo || "").trim() === normalizedDocNo
    ));
  }, [receives]);

  const syncAutoReceivesForPay = useCallback(async ({
    previousDocNo = "",
    nextDocNo = "",
    nextDocDate = "",
    billingIds = [],
    invoiceIds = [],
    invoiceOverrides = new Map(),
    projectId = "",
  }) => {
    const targetInvoiceIds = normalizeIdList(invoiceIds);
    const targetPoIds = Array.from(new Set(
      targetInvoiceIds
        .map((invoiceId) => invoices.find((invoice: any) => String(invoice.id) === invoiceId)?.poId)
        .filter(Boolean)
        .map((poId) => String(poId))
    ));
    const targetPos = targetPoIds
      .map((poId) => pos.find((po: any) => String(po.id) === poId))
      .filter((po: any) => (
        po &&
        po.receivedAfterPaymentChecked &&
        Array.isArray(po?.receivedAfterPaymentSetup?.items) &&
        po.receivedAfterPaymentSetup.items.length > 0
      ))
      .filter((po: any) => {
        const effectiveInvoices = getEffectiveInvoicesForPo(po.id, invoiceOverrides);
        return effectiveInvoices.length > 0 && effectiveInvoices.every((invoice: any) => normalizeInvoiceFlowStatus(invoice?.status) === "paid");
      });

    const desiredPoIds = new Set(targetPos.map((po: any) => String(po.id)));
    const previousReceives = previousDocNo ? getPayLinkedAutoReceives(previousDocNo) : [];
    const previousReceiveByPoId = new Map(
      previousReceives.map((receive: any) => [String(receive.poId), receive])
    );
    const nextIso = new Date().toISOString();
    const createdReceiveNos: string[] = [];
    const deletedReceiveNos: string[] = [];
    const workingReceives = [...(receives || [])];

    for (const receive of previousReceives) {
      const poId = String(receive?.poId || "");
      if (desiredPoIds.has(poId)) continue;
      const deleted = await deleteData("receives", receive.id, { skipLog: true });
      if (!deleted) {
        throw new Error(`ลบ Receive ${receive.rpNo || receive.receiveNo || receive.id} ที่ผูกกับ Pay เดิมไม่สำเร็จ`);
      }
      deletedReceiveNos.push(receive.rpNo || receive.receiveNo || receive.id);
      await logAction?.(
        "Delete Receive",
        `${buildDeleteLogDetails("receives", receive, receive.id)} | ที่มา: Rollback Pay ${previousDocNo}`,
        receive.projectId || projectId
      );
    }

    for (const po of targetPos) {
      const poId = String(po.id);
      const linkedPrevReceive = previousReceiveByPoId.get(poId);
      if (linkedPrevReceive) {
        const patch: any = {};
        if (String(linkedPrevReceive.sourcePayNo || "").trim() !== String(nextDocNo || "").trim()) {
          patch.sourcePayNo = nextDocNo;
        }
        if (String(linkedPrevReceive.sourcePayDate || "").trim() !== String(nextDocDate || "").trim()) {
          patch.sourcePayDate = nextDocDate;
        }
        const poInvoiceIds = targetInvoiceIds.filter((invoiceId) => {
          const invoice = invoices.find((item: any) => String(item.id) === invoiceId);
          return String(invoice?.poId || "") === poId;
        });
        patch.sourceInvoiceIds = poInvoiceIds;
        patch.sourceBillingIds = normalizeIdList(billingIds);
        if (Object.keys(patch).length > 0) {
          patch.updatedAt = nextIso;
          const updated = await updateData("receives", linkedPrevReceive.id, patch, { skipLog: true });
          if (!updated) {
            throw new Error(`อัปเดต Receive ${linkedPrevReceive.rpNo || linkedPrevReceive.receiveNo || linkedPrevReceive.id} ไม่สำเร็จ`);
          }
        }
        continue;
      }

      const hasExistingReceive = workingReceives.some((receive: any) => String(receive?.poId || "") === poId);
      if (hasExistingReceive) continue;

      const project = projects.find((item: any) => item.id === po.projectId) || null;
      const configuredReceive = buildConfiguredReceiveData({
        po,
        setup: po.receivedAfterPaymentSetup,
        prs,
        vendors,
        receives: workingReceives,
        project,
        user,
        userData,
      });
      if (!configuredReceive) continue;

      const poInvoiceIds = targetInvoiceIds.filter((invoiceId) => {
        const invoice = invoices.find((item: any) => String(item.id) === invoiceId);
        return String(invoice?.poId || "") === poId;
      });
      const receivePayload = {
        ...configuredReceive.receiveData,
        autoCreatedFromPoApproval: false,
        autoCreatedFromPayDocument: true,
        sourcePayNo: nextDocNo,
        sourcePayDate: nextDocDate,
        sourceInvoiceIds: poInvoiceIds,
        sourceBillingIds: normalizeIdList(billingIds),
      };
      const created = await addData("receives", receivePayload, null, { skipLog: true });
      if (!created) {
        throw new Error(`สร้าง Receive อัตโนมัติสำหรับ PO ${po.poNo || po.id} ไม่สำเร็จ`);
      }
      workingReceives.push({
        id: receivePayload.receiveNo,
        ...receivePayload,
      });
      createdReceiveNos.push(receivePayload.rpNo || receivePayload.receiveNo || po.poNo || po.id);
      await logAction?.(
        "Create Receive",
        `สร้าง Receive | ${buildRecordSummary("receives", receivePayload, receivePayload.receiveNo || po.id)} | ที่มา: Auto receive after Pay ${nextDocNo}`,
        po.projectId || projectId
      );
    }

    return { createdReceiveNos, deletedReceiveNos };
  }, [
    addData,
    deleteData,
    getEffectiveInvoicesForPo,
    getPayLinkedAutoReceives,
    invoices,
    logAction,
    normalizeInvoiceFlowStatus,
    pos,
    projects,
    prs,
    receives,
    updateData,
    user,
    userData,
    vendors,
  ]);

  const syncPoStatusFromInvoiceOverrides = useCallback(
    async (invoiceIds: string[], invoiceOverrides: Map<string, any> = new Map()) => {
      const ids = normalizeIdList(invoiceIds);
      if (ids.length === 0) return;

      const poIds = Array.from(new Set(
        ids
          .map((invoiceId) => invoices.find((invoice: any) => String(invoice.id) === invoiceId)?.poId)
          .filter(Boolean)
          .map((poId) => String(poId))
      ));
      if (poIds.length === 0) return;

      const updates = await Promise.all(
        poIds.map(async (poId) => {
          const nextStatus = getNextPoStatusFromInvoices(poId, invoiceOverrides);
          if (!nextStatus) return true;
          return updateData(
            "pos",
            poId,
            {
              status: nextStatus,
              statusNow: nextStatus,
              updatedAt: new Date().toISOString(),
            },
            { skipLog: true }
          );
        })
      );

      if (updates.some((result) => !result)) {
        throw new Error("เปลี่ยนสถานะ PO ตาม Invoice บางรายการไม่สำเร็จ");
      }
    },
    [getNextPoStatusFromInvoices, invoices, updateData]
  );

  useEffect(() => {
    const ref = collection(db, "artifacts", appId, "public", "data", config.collectionName);
    return onSnapshot(
      query(ref),
      (snap) => setRows(snap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }))),
      (err) => console.error(`Error syncing ${config.collectionName}:`, err)
    );
  }, [appId, config.collectionName, db]);

  useEffect(() => {
    if (!isPayMode) return;
    const ref = collection(db, "artifacts", appId, "public", "data", "invoices");
    return onSnapshot(
      query(ref),
      (snap) => setLocalInvoices(snap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }))),
      (err) => console.error("Error syncing invoices for pay history:", err)
    );
  }, [appId, db, isPayMode]);

  useEffect(() => {
    if (!isPayMode) return;
    const ref = collection(db, "artifacts", appId, "public", "data", "billings");
    return onSnapshot(
      query(ref),
      (snap) => setBillingRows(snap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }))),
      (err) => console.error("Error syncing billings for pay:", err)
    );
  }, [appId, db, isPayMode]);

  useEffect(() => {
    if (!isBillingMode) return;
    const ref = collection(db, "artifacts", appId, "public", "data", "pays");
    return onSnapshot(
      query(ref),
      (snap) => setPayRows(snap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }))),
      (err) => console.error("Error syncing pays for billing:", err)
    );
  }, [appId, db, isBillingMode]);

  const formatDate = useCallback((value?: string) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("th-TH");
  }, []);

  const closeModal = useCallback(() => {
    if (saving) return;
    setIsModalOpen(false);
    setEditingRow(null);
    setFormData(getDefaultForm());
  }, [saving]);

  const openCreateModal = useCallback(() => {
    setEditingRow(null);
    setFormData({
      ...getDefaultForm(),
      paymentType: isBillingMode
        ? (BILLING_PAYMENT_TYPES[0] || "")
        : isPayMode
          ? (PAY_PAYMENT_TYPES[0] || "")
          : "เครดิต",
    });
    setIsModalOpen(true);
  }, [isBillingMode, isPayMode]);

  const openEditModal = useCallback((row: any) => {
    const normalizedVendorKey = isBillingMode
      ? (
          (row.invoiceIds || [])
            .map((invoiceId: any) => invoices.find((invoice: any) => String(invoice.id) === String(invoiceId)))
            .map((invoice: any) => getInvoiceVendorKey(invoice))
            .find(Boolean) || getDocumentVendorKey(row)
        )
      : isPayMode
        ? (
            (row.billingIds || [])
              .map((billingId: any) => billingRows.find((billing: any) => String(billing.id) === String(billingId)))
              .map((billing: any) => getBillingVendorKey(billing))
              .find(Boolean) || getDocumentVendorKey(row)
          )
        : getDocumentVendorKey(row);
    setEditingRow(row);
    setFormData({
      docNo: row.docNo || "",
      docDate: row.docDate || new Date().toISOString().split("T")[0],
      dueDate: row.dueDate || "",
      vendorId: normalizedVendorKey,
      vendorName: row.vendorName || "",
      poRef: row.poRef || "",
      paymentType: row.paymentType || (isBillingMode
        ? (BILLING_PAYMENT_TYPES[0] || "")
        : isPayMode
          ? (PAY_PAYMENT_TYPES[0] || "")
          : "เครดิต"),
      amount: row.amount != null ? String(row.amount) : "",
      selectedInvoiceIds: Array.isArray(row.invoiceIds) ? row.invoiceIds : [],
      selectedBillingIds: Array.isArray(row.billingIds) ? row.billingIds : [],
      description: row.description || "",
      note: row.note || "",
      status: row.status || "Draft",
    });
    setIsModalOpen(true);
  }, [billingRows, invoices, isBillingMode, isPayMode]);

  const projectRows = useMemo(() => {
    if (!selectedProjectId) return [];
    return rows
      .filter((row: any) => row.projectId === selectedProjectId)
      .sort((a: any, b: any) => {
        const aTime = new Date(a.docDate || a.createdAt || 0).getTime();
        const bTime = new Date(b.docDate || b.createdAt || 0).getTime();
        return bTime - aTime;
      });
  }, [rows, selectedProjectId]);

  const currentBillingRows = useMemo(
    () => projectRows.filter((row: any) => !isBillingMode || (!isInpayStatus(row.status) && !isPaidStatus(row.status))),
    [isBillingMode, projectRows]
  );

  const billingHistoryRows = useMemo(
    () => projectRows.filter((row: any) => isBillingMode && (isInpayStatus(row.status) || isPaidStatus(row.status))),
    [isBillingMode, projectRows]
  );

  const currentPayRows = useMemo(
    () => projectRows.filter((row: any) => !isPayMode || !isPaidStatus(row.status)),
    [isPayMode, projectRows]
  );

  const paidInvoiceHistoryRows = useMemo(() => {
    if (!selectedProjectId || !isPayMode) return [];
    
    const projectPoNos = new Set(
      pos.filter((po: any) => po.projectId === selectedProjectId).map((po: any) => po.poNo).filter(Boolean)
    );

    return invoices
      .filter((invoice: any) => {
        const invoiceProjectId =
          invoice?.projectId ||
          pos.find((po: any) => String(po.id) === String(invoice?.poId || ""))?.projectId ||
          "";
        
        const belongsToProject = 
          invoiceProjectId === selectedProjectId || 
          projectPoNos.has(invoice?.poRef) || 
          projectPoNos.has(invoice?.poNo);

        return belongsToProject && isPaidInvoiceRecord(invoice);
      })
      .sort((a: any, b: any) => {
        const aTime = new Date(a.payDate || a.invDate || a.updatedAt || a.createdAt || 0).getTime();
        const bTime = new Date(b.payDate || b.invDate || b.updatedAt || b.createdAt || 0).getTime();
        return bTime - aTime;
      })
      .map((invoice: any) => {
        const linkedPay = projectRows.find((row: any) => (
          String(row?.docNo || "") === String(invoice?.payNo || "") ||
          normalizeIdList(row?.invoiceIds || []).includes(String(invoice.id))
        ));
        const paymentType =
          linkedPay?.paymentType ||
          invoice.payPaymentType ||
          invoice.paymentMethod ||
          invoice.paymentType ||
          "-";

        return {
          id: `paid-invoice-${invoice.id}`,
          sourceType: "invoice",
          invoiceId: invoice.id,
          docNo: invoice.invNo || invoice.id || "-",
          poRef: invoice.poNo || invoice.poRef || invoice.billingNo || invoice.payNo || "-",
          vendorId: invoice.vendorId || "",
          vendorName: invoice.vendorName || "",
          docDate: invoice.payDate || invoice.invDate || invoice.updatedAt || invoice.createdAt || "",
          description: invoice.payNo
            ? `Invoice ${invoice.invNo || invoice.id} / Pay ${invoice.payNo}`
            : `Invoice ${invoice.invNo || invoice.id}`,
          note: invoice.note || "",
          paymentType,
          amount: getInvoiceAmountBeforeVat(invoice),
          amountBeforeVat: getInvoiceAmountBeforeVat(invoice),
          amountAfterVat: getInvoiceAmountAfterVat(invoice),
          status: invoice.status || invoice.statusNow || "paid",
        };
      });
  }, [invoices, isPayMode, pos, projectRows, selectedProjectId]);

  const payHistoryRows = useMemo(() => {
    if (!isPayMode) return [];

    const payDocs = projectRows.filter((row: any) => isPaidStatus(row.status));
    const paidInvoiceIds = new Set(
      paidInvoiceHistoryRows
        .map((row: any) => String(row?.invoiceId || ""))
        .filter(Boolean)
    );
    const orphanPayDocs = payDocs.filter((row: any) => {
      const linkedInvoiceIds = normalizeIdList(row.invoiceIds || []);
      const hasLinkedPaidInvoice = linkedInvoiceIds.some((invoiceId) => paidInvoiceIds.has(invoiceId));
      const hasInvoiceByPayNo = (invoices || []).some((invoice: any) => (
        isPaidInvoiceRecord(invoice) &&
        String(invoice?.payNo || "") === String(row?.docNo || "")
      ));
      return !hasLinkedPaidInvoice && !hasInvoiceByPayNo;
    });

    return [...paidInvoiceHistoryRows, ...orphanPayDocs].sort((a: any, b: any) => {
      const aTime = new Date(a.docDate || a.createdAt || 0).getTime();
      const bTime = new Date(b.docDate || b.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }, [invoices, isPayMode, paidInvoiceHistoryRows, projectRows]);

  const visibleRows = useMemo(
    () => {
      if (isBillingMode) return activeBillingTab === "history" ? billingHistoryRows : currentBillingRows;
      if (isPayMode) return activePayTab === "history" ? payHistoryRows : currentPayRows;
      return projectRows;
    },
    [activeBillingTab, activePayTab, billingHistoryRows, currentBillingRows, currentPayRows, isBillingMode, isPayMode, payHistoryRows, projectRows]
  );

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return visibleRows;
    return visibleRows.filter((row: any) =>
      [
        row.docNo,
        row.poRef,
        row.vendorName,
        row.description,
        row.note,
        row.paymentType,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [searchTerm, visibleRows]);

  const totalAmount = useMemo(
    () => filteredRows.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0),
    [filteredRows]
  );

  const billedInvoiceIds = useMemo(() => {
    const ids = new Set<string>();
    rows.forEach((row: any) => {
      if (editingRow?.id && row.id === editingRow.id) return;
      if (Array.isArray(row.invoiceIds)) {
        row.invoiceIds.forEach((id: any) => {
          if (id) ids.add(String(id));
        });
      }
    });
    return ids;
  }, [editingRow?.id, rows]);

  const selectedBillingInvoiceIds = useMemo(
    () => new Set(normalizeIdList(formData.selectedInvoiceIds || [])),
    [formData.selectedInvoiceIds]
  );

  const billingInvoiceCandidates = useMemo(() => {
    if (!selectedProjectId || !isBillingMode) return [];

    const projectPoNos = new Set(
      pos.filter((po: any) => po.projectId === selectedProjectId).map((po: any) => po.poNo).filter(Boolean)
    );

    return invoices
      .filter((invoice: any) => {
        const invoiceId = String(invoice.id || "");
        const invoiceProjectId =
          invoice?.projectId ||
          pos.find((po: any) => String(po.id) === String(invoice?.poId || ""))?.projectId ||
          "";
        const belongsToProject = 
          invoiceProjectId === selectedProjectId || 
          projectPoNos.has(invoice?.poRef) || 
          projectPoNos.has(invoice?.poNo);

        return (
          belongsToProject &&
          (
            selectedBillingInvoiceIds.has(invoiceId) ||
            (isCreditInvoice(invoice) && !billedInvoiceIds.has(invoiceId))
          )
        );
      })
      .sort((a: any, b: any) => {
        const aTime = new Date(a.invDate || a.createdAt || 0).getTime();
        const bTime = new Date(b.invDate || b.createdAt || 0).getTime();
        return bTime - aTime;
      });
  }, [billedInvoiceIds, invoices, isBillingMode, selectedBillingInvoiceIds, selectedProjectId, pos]);

  const billingVendorOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    billingInvoiceCandidates.forEach((invoice: any) => {
      const key = getInvoiceVendorKey(invoice);
      if (!key) return;
      const name = getVendorDisplayName(invoice, key);
      const current = map.get(key);
      map.set(key, {
        id: key,
        name,
        count: (current?.count || 0) + 1,
      });
    });
    const editingVendorKey = getDocumentVendorKey(editingRow);
    const editingVendorName = getVendorDisplayName(editingRow, editingVendorKey);
    if (editingVendorKey && editingVendorName && !map.has(editingVendorKey)) {
      map.set(editingVendorKey, { id: editingVendorKey, name: editingVendorName, count: 0 });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [billingInvoiceCandidates, editingRow]);

  const selectedVendorInvoices = useMemo(() => {
    if (!formData.vendorId) return [];
    return billingInvoiceCandidates.filter(
      (invoice: any) => getInvoiceVendorKey(invoice) === formData.vendorId
    );
  }, [billingInvoiceCandidates, formData.vendorId]);

  const selectedBillingInvoices = useMemo(() => {
    const ids = new Set((formData.selectedInvoiceIds || []).map((id: any) => String(id)));
    return selectedVendorInvoices.filter((invoice: any) => ids.has(String(invoice.id)));
  }, [formData.selectedInvoiceIds, selectedVendorInvoices]);

  const selectedBillingTotals = useMemo(() => {
    const beforeVat = selectedBillingInvoices.reduce(
      (sum: number, invoice: any) => sum + getInvoiceAmountBeforeVat(invoice),
      0
    );
    const vat = beforeVat * VAT_RATE;
    return {
      beforeVat,
      vat,
      afterVat: beforeVat + vat,
    };
  }, [selectedBillingInvoices]);

  const paidBillingIds = useMemo(() => {
    const ids = new Set<string>();
    if (!isPayMode) return ids;
    rows.forEach((row: any) => {
      if (editingRow?.id && row.id === editingRow.id) return;
      if (!isPaidStatus(row.status) || !Array.isArray(row.billingIds)) return;
      row.billingIds.forEach((id: any) => {
        if (id) ids.add(String(id));
      });
    });
    return ids;
  }, [editingRow?.id, isPayMode, rows]);

  const selectedPayBillingIds = useMemo(
    () => new Set(normalizeIdList(formData.selectedBillingIds || [])),
    [formData.selectedBillingIds]
  );

  const payBillingCandidates = useMemo(() => {
    if (!selectedProjectId || !isPayMode) return [];
    return billingRows
      .filter((billing: any) => {
        const billingId = String(billing.id);
        return (
          billing?.projectId === selectedProjectId &&
          (isInpayStatus(billing.status) || selectedPayBillingIds.has(billingId)) &&
          (!paidBillingIds.has(billingId) || selectedPayBillingIds.has(billingId))
        );
      })
      .sort((a: any, b: any) => {
        const aTime = new Date(a.docDate || a.createdAt || 0).getTime();
        const bTime = new Date(b.docDate || b.createdAt || 0).getTime();
        return bTime - aTime;
      });
  }, [billingRows, isPayMode, paidBillingIds, selectedPayBillingIds, selectedProjectId]);

  const payVendorOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    payBillingCandidates.forEach((billing: any) => {
      const key = getBillingVendorKey(billing);
      if (!key) return;
      const name = getVendorDisplayName(billing, key);
      const current = map.get(key);
      map.set(key, {
        id: key,
        name,
        count: (current?.count || 0) + 1,
      });
    });
    const editingVendorKey = getDocumentVendorKey(editingRow);
    const editingVendorName = getVendorDisplayName(editingRow, editingVendorKey);
    if (editingVendorKey && editingVendorName && !map.has(editingVendorKey)) {
      map.set(editingVendorKey, { id: editingVendorKey, name: editingVendorName, count: 0 });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [editingRow, payBillingCandidates]);

  const selectedVendorPayBillings = useMemo(() => {
    if (!formData.vendorId) return [];
    return payBillingCandidates.filter(
      (billing: any) => getBillingVendorKey(billing) === formData.vendorId
    );
  }, [formData.vendorId, payBillingCandidates]);

  const selectedPayBillings = useMemo(() => {
    const ids = new Set((formData.selectedBillingIds || []).map((id: any) => String(id)));
    return selectedVendorPayBillings.filter((billing: any) => ids.has(String(billing.id)));
  }, [formData.selectedBillingIds, selectedVendorPayBillings]);

  const selectedPayTotals = useMemo(() => {
    return selectedPayBillings.reduce(
      (totals: any, billing: any) => {
        const beforeVat = Number(billing.amountBeforeVat ?? billing.amount ?? 0);
        const vat = Number(billing.vatAmount ?? 0);
        const afterVat = Number(billing.amountAfterVat ?? beforeVat + vat);
        return {
          beforeVat: totals.beforeVat + beforeVat,
          vat: totals.vat + vat,
          afterVat: totals.afterVat + afterVat,
        };
      },
      { beforeVat: 0, vat: 0, afterVat: 0 }
    );
  }, [selectedPayBillings]);

  const handleVendorChange = useCallback((vendorId: string) => {
    const billingVendor = billingVendorOptions.find((item) => item.id === vendorId);
    const payVendor = payVendorOptions.find((item) => item.id === vendorId);
    setFormData((prev) => ({
      ...prev,
      vendorId,
      vendorName: isBillingMode
        ? (billingVendor?.name || "")
        : isPayMode
          ? (payVendor?.name || "")
          : prev.vendorName,
      selectedInvoiceIds: isBillingMode ? [] : prev.selectedInvoiceIds,
      selectedBillingIds: isPayMode ? [] : prev.selectedBillingIds,
      poRef: isBillingMode || isPayMode ? "" : prev.poRef,
      amount: isBillingMode || isPayMode ? "" : prev.amount,
    }));
  }, [billingVendorOptions, isBillingMode, isPayMode, payVendorOptions]);

  const updateBillingInvoiceSelection = useCallback((invoiceIds: string[]) => {
    const idSet = new Set(invoiceIds.map(String));
    const selected = selectedVendorInvoices.filter((invoice: any) => idSet.has(String(invoice.id)));
    const beforeVat = selected.reduce(
      (sum: number, invoice: any) => sum + getInvoiceAmountBeforeVat(invoice),
      0
    );
    const invoiceRefs = selected.map((invoice: any) => invoice.invNo || invoice.id).filter(Boolean);
    const poRefs = selected.map((invoice: any) => invoice.poNo || invoice.poRef).filter(Boolean);

    setFormData((prev) => ({
      ...prev,
      selectedInvoiceIds: invoiceIds,
      poRef: poRefs.join(", "),
      amount: beforeVat ? String(beforeVat) : "",
      description:
        invoiceRefs.length > 0
          ? `Billing from Invoice: ${invoiceRefs.join(", ")}`
          : prev.description,
    }));
  }, [selectedVendorInvoices]);

  const toggleBillingInvoice = useCallback((invoiceId: string) => {
    const currentIds = (formData.selectedInvoiceIds || []).map(String);
    const nextIds = currentIds.includes(String(invoiceId))
      ? currentIds.filter((id) => id !== String(invoiceId))
      : [...currentIds, String(invoiceId)];
    updateBillingInvoiceSelection(nextIds);
  }, [formData.selectedInvoiceIds, updateBillingInvoiceSelection]);

  const updatePayBillingSelection = useCallback((billingIds: string[]) => {
    const idSet = new Set(billingIds.map(String));
    const selected = selectedVendorPayBillings.filter((billing: any) => idSet.has(String(billing.id)));
    const totalAfterVat = selected.reduce((sum: number, billing: any) => {
      const beforeVat = Number(billing.amountBeforeVat ?? billing.amount ?? 0);
      const vat = Number(billing.vatAmount ?? 0);
      return sum + Number(billing.amountAfterVat ?? beforeVat + vat);
    }, 0);
    const billingRefs = selected.map((billing: any) => billing.docNo || billing.id).filter(Boolean);
    const poRefs = selected.map((billing: any) => billing.poRef).filter(Boolean);

    setFormData((prev) => ({
      ...prev,
      selectedBillingIds: billingIds,
      poRef: poRefs.length > 0 ? poRefs.join(", ") : billingRefs.join(", "),
      amount: totalAfterVat ? String(totalAfterVat) : "",
      description:
        billingRefs.length > 0
          ? `Pay from Billing: ${billingRefs.join(", ")}`
          : prev.description,
    }));
  }, [selectedVendorPayBillings]);

  const togglePayBilling = useCallback((billingId: string) => {
    const currentIds = (formData.selectedBillingIds || []).map(String);
    const nextIds = currentIds.includes(String(billingId))
      ? currentIds.filter((id) => id !== String(billingId))
      : [...currentIds, String(billingId)];
    updatePayBillingSelection(nextIds);
  }, [formData.selectedBillingIds, updatePayBillingSelection]);

  const handleSave = useCallback(async () => {
    if (!selectedProjectId) {
      showAlert?.("ยังไม่เลือกโครงการ", "กรุณาเลือกโครงการก่อนสร้างรายการ", "warning");
      return;
    }
    if (!formData.docNo.trim()) {
      showAlert?.("ข้อมูลไม่ครบ", `กรุณากรอก ${config.numberLabel}`, "warning");
      return;
    }
    if (!formData.docDate) {
      showAlert?.("ข้อมูลไม่ครบ", "กรุณาเลือกวันที่เอกสาร", "warning");
      return;
    }
    if (isBillingMode && !formData.vendorId) {
      showAlert?.("ข้อมูลไม่ครบ", "กรุณาเลือก Vendor จาก Invoice เครดิต", "warning");
      return;
    }
    if (isPayMode && !formData.vendorId) {
      showAlert?.("ข้อมูลไม่ครบ", "กรุณาเลือก Vendor จากประวัติ Billing สถานะ Inpay", "warning");
      return;
    }
    if (isBillingMode && (!formData.selectedInvoiceIds || formData.selectedInvoiceIds.length === 0)) {
      showAlert?.("ข้อมูลไม่ครบ", "กรุณาเลือก Invoice อย่างน้อย 1 รายการ", "warning");
      return;
    }
    if (isPayMode && (!formData.selectedBillingIds || formData.selectedBillingIds.length === 0)) {
      showAlert?.("ข้อมูลไม่ครบ", "กรุณาเลือก Billing อย่างน้อย 1 รายการ", "warning");
      return;
    }
    if (!formData.amount || Number(formData.amount) <= 0) {
      showAlert?.("ข้อมูลไม่ครบ", "กรุณากรอกจำนวนเงินให้มากกว่า 0", "warning");
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const billingInvoiceIds = isBillingMode
        ? normalizeIdList(formData.selectedInvoiceIds || [])
        : [];
      const billingInvoiceMap = new Map(
        billingInvoiceCandidates.map((invoice: any) => [String(invoice.id), invoice])
      );
      const billingInvoices = isBillingMode
        ? billingInvoiceIds
            .map((invoiceId) => billingInvoiceMap.get(invoiceId))
            .filter(Boolean)
        : [];
      const billingAmountBeforeVat = isBillingMode
        ? billingInvoices.reduce((sum: number, invoice: any) => sum + getInvoiceAmountBeforeVat(invoice), 0)
        : Number(formData.amount || 0);
      const billingVatAmount = isBillingMode ? billingAmountBeforeVat * VAT_RATE : 0;
      const billingAmountAfterVat = isBillingMode
        ? billingAmountBeforeVat + billingVatAmount
        : Number(formData.amount || 0);
      const payBillingIds = isPayMode
        ? normalizeIdList(formData.selectedBillingIds || [])
        : [];
      const payBillingMap = new Map(
        payBillingCandidates.map((billing: any) => [String(billing.id), billing])
      );
      const payBillings = isPayMode
        ? payBillingIds
            .map((billingId) => payBillingMap.get(billingId))
            .filter(Boolean)
        : [];
      const payAmountBeforeVat = isPayMode
        ? payBillings.reduce((sum: number, billing: any) => sum + Number(billing.amountBeforeVat ?? billing.amount ?? 0), 0)
        : billingAmountBeforeVat;
      const payVatAmount = isPayMode
        ? payBillings.reduce((sum: number, billing: any) => {
            const beforeVat = Number(billing.amountBeforeVat ?? billing.amount ?? 0);
            return sum + Number(billing.vatAmount ?? Math.max(Number(billing.amountAfterVat ?? beforeVat) - beforeVat, 0));
          }, 0)
        : billingVatAmount;
      const payAmountAfterVat = isPayMode
        ? payBillings.reduce((sum: number, billing: any) => {
            const beforeVat = Number(billing.amountBeforeVat ?? billing.amount ?? 0);
            const vat = Number(billing.vatAmount ?? 0);
            return sum + Number(billing.amountAfterVat ?? beforeVat + vat);
          }, 0)
        : billingAmountAfterVat;
      const payInvoiceIds = isPayMode
        ? Array.from(new Set(payBillings.flatMap((billing: any) => Array.isArray(billing.invoiceIds) ? billing.invoiceIds.map(String) : [])))
        : billingInvoiceIds;
      const payInvoiceRefs = isPayMode
        ? Array.from(new Set(payBillings.flatMap((billing: any) => Array.isArray(billing.invoiceRefs) ? billing.invoiceRefs : []))).filter(Boolean)
        : billingInvoices.map((invoice: any) => invoice.invNo || invoice.id).filter(Boolean);
      const payload = {
        docNo: formData.docNo.trim(),
        docDate: formData.docDate,
        dueDate: formData.dueDate || "",
        vendorId: formData.vendorId || "",
        vendorName: formData.vendorName || "",
        poRef: formData.poRef.trim(),
        paymentType: formData.paymentType,
        amount: isPayMode ? payAmountAfterVat : billingAmountBeforeVat,
        amountBeforeVat: isPayMode ? payAmountBeforeVat : billingAmountBeforeVat,
        vatAmount: isPayMode ? payVatAmount : billingVatAmount,
        amountAfterVat: isPayMode ? payAmountAfterVat : billingAmountAfterVat,
        invoiceIds: isPayMode ? payInvoiceIds : billingInvoiceIds,
        invoiceRefs: isPayMode ? payInvoiceRefs : billingInvoices.map((invoice: any) => invoice.invNo || invoice.id).filter(Boolean),
        invoices: billingInvoices.map((invoice: any) => ({
          id: invoice.id,
          invNo: invoice.invNo || "",
          invDate: invoice.invDate || "",
          poNo: invoice.poNo || invoice.poRef || "",
          amountBeforeVat: getInvoiceAmountBeforeVat(invoice),
          amountAfterVat: getInvoiceAmountAfterVat(invoice),
        })),
        billingIds: payBillingIds,
        billingRefs: payBillings.map((billing: any) => billing.docNo || billing.id).filter(Boolean),
        billings: payBillings.map((billing: any) => ({
          id: billing.id,
          docNo: billing.docNo || "",
          docDate: billing.docDate || "",
          poRef: billing.poRef || "",
          invoiceIds: Array.isArray(billing.invoiceIds) ? billing.invoiceIds : [],
          invoiceRefs: Array.isArray(billing.invoiceRefs) ? billing.invoiceRefs : [],
          amountBeforeVat: Number(billing.amountBeforeVat ?? billing.amount ?? 0),
          vatAmount: Number(billing.vatAmount ?? 0),
          amountAfterVat: Number(billing.amountAfterVat ?? Number(billing.amount || 0)),
        })),
        description: formData.description.trim(),
        note: formData.note.trim(),
        status: isBillingMode ? "Inpay" : isPayMode ? "paid" : (formData.status || "Draft"),
        projectId: editingRow?.projectId || selectedProjectId,
        createdBy:
          editingRow?.createdBy ||
          `${userData?.firstName || ""} ${userData?.lastName || ""}`.trim(),
        updatedAt: now,
        ...(isPayMode
          ? {
              paidAt: now,
              paidBy: `${userData?.firstName || ""} ${userData?.lastName || ""}`.trim(),
            }
          : {}),
        ...(!isPayMode && editingRow?.paidAt ? { paidAt: editingRow.paidAt } : {}),
        ...(!isPayMode && editingRow?.paidBy ? { paidBy: editingRow.paidBy } : {}),
      };

      if (editingRow) {
        const ok = await updateData(config.collectionName, editingRow.id, payload, { skipLog: true });
        if (!ok) return;
        let payAutoReceiveResult = { createdReceiveNos: [], deletedReceiveNos: [] as string[] };
        if (isBillingMode) {
          const previousInvoiceIds = normalizeIdList(editingRow.invoiceIds || []);
          const touchedInvoiceIds = normalizeIdList([...previousInvoiceIds, ...billingInvoiceIds]);
          const billingInvoiceOverrides = new Map<string, any>();

          const invoiceUpdates = await Promise.all(
            touchedInvoiceIds.map((invoiceId: string) => {
              const invoice = invoices.find((item: any) => String(item.id) === invoiceId);
              const isSelected = billingInvoiceIds.includes(invoiceId);
              const patch = isSelected
                ? {
                    status: "Inpay",
                    billingNo: payload.docNo,
                    billingDate: payload.docDate,
                    updatedAt: now,
                  }
                : invoice?.payNo
                  ? {
                      status: "paid",
                      billingNo: null,
                      billingDate: null,
                      updatedAt: now,
                    }
                  : {
                      status: "Invcredit",
                      billingNo: null,
                      billingDate: null,
                      payNo: null,
                      payDate: null,
                      updatedAt: now,
                    };
              billingInvoiceOverrides.set(invoiceId, patch);
              return updateData("invoices", invoiceId, patch, { skipLog: true });
            })
          );
          if (invoiceUpdates.some((result) => !result)) {
            throw new Error("บันทึก Billing แล้ว แต่เปลี่ยนสถานะ Invoice บางรายการไม่สำเร็จ");
          }
          if (touchedInvoiceIds.length > 0) {
            await syncPoStatusFromInvoiceOverrides(touchedInvoiceIds, billingInvoiceOverrides);
          }
        }
        if (isPayMode) {
          const previousBillingIds = normalizeIdList(editingRow.billingIds || []);
          const touchedBillingIds = normalizeIdList([...previousBillingIds, ...payBillingIds]);
          const billingUpdates = await Promise.all(
            touchedBillingIds.map((billingId: string) => {
              const isSelected = payBillingIds.includes(billingId);
              return updateData(
                "billings",
                billingId,
                isSelected
                  ? {
                      status: "paid",
                      payNo: payload.docNo,
                      payDate: payload.docDate,
                      updatedAt: now,
                    }
                  : {
                      status: "Inpay",
                      payNo: null,
                      payDate: null,
                      updatedAt: now,
                    },
                { skipLog: true }
              );
            })
          );
          if (billingUpdates.some((result) => !result)) {
            throw new Error("บันทึก Pay แล้ว แต่เปลี่ยนสถานะ Billing บางรายการไม่สำเร็จ");
          }

          const previousPayInvoiceIds = normalizeIdList(
            Array.isArray(editingRow.invoiceIds) && editingRow.invoiceIds.length > 0
              ? editingRow.invoiceIds
              : (editingRow.billings || []).flatMap((billing: any) => (
                  Array.isArray(billing?.invoiceIds) ? billing.invoiceIds : []
                ))
          );
          const otherPaidPayInvoiceIds = new Set<string>();
          rows.forEach((row: any) => {
            if (String(row.id) === String(editingRow.id) || !isPaidStatus(row.status)) return;
            normalizeIdList(row.invoiceIds || []).forEach((invoiceId) => {
              otherPaidPayInvoiceIds.add(invoiceId);
            });
          });

          const touchedPayInvoiceIds = normalizeIdList([...previousPayInvoiceIds, ...payInvoiceIds]);
          const payInvoiceOverrides = new Map<string, any>();
          const invoiceUpdates = await Promise.all(
            touchedPayInvoiceIds.map((invoiceId: string) => {
              const isSelected = payInvoiceIds.includes(invoiceId);
              if (!isSelected && otherPaidPayInvoiceIds.has(invoiceId)) {
                return Promise.resolve(true);
              }

              const patch = isSelected
                ? {
                    status: "paid",
                    payNo: payload.docNo,
                    payDate: payload.docDate,
                    payPaymentType: payload.paymentType,
                    updatedAt: now,
                  }
                : {
                    status: "Inpay",
                    payNo: null,
                    payDate: null,
                    payPaymentType: null,
                    updatedAt: now,
                  };
              payInvoiceOverrides.set(invoiceId, patch);
              return updateData("invoices", invoiceId, patch, { skipLog: true });
            })
          );
          if (invoiceUpdates.some((result) => !result)) {
            throw new Error("บันทึก Pay แล้ว แต่เปลี่ยนสถานะ Invoice บางรายการไม่สำเร็จ");
          }
          payAutoReceiveResult = await syncAutoReceivesForPay({
            previousDocNo: editingRow.docNo || "",
            nextDocNo: payload.docNo,
            nextDocDate: payload.docDate,
            billingIds: payBillingIds,
            invoiceIds: payInvoiceIds,
            invoiceOverrides: payInvoiceOverrides,
            projectId: payload.projectId,
          });
          if (payInvoiceOverrides.size > 0) {
            await syncPoStatusFromInvoiceOverrides(Array.from(payInvoiceOverrides.keys()), payInvoiceOverrides);
          }
        }
        await logAction?.(
          `Edit ${config.saveLogLabel}`,
          `แก้ไข ${config.saveLogLabel} | ${getRowLogSummary(editingRow, payload)} | มูลค่า: ${formatLogCurrency(payload.amountAfterVat ?? payload.amount) || "฿0"}${
            isPayMode && payAutoReceiveResult.createdReceiveNos.length > 0
              ? ` | Auto Receive: ${payAutoReceiveResult.createdReceiveNos.join(", ")}`
              : ""
          }${
            isPayMode && payAutoReceiveResult.deletedReceiveNos.length > 0
              ? ` | ลบ Receive เดิม: ${payAutoReceiveResult.deletedReceiveNos.join(", ")}`
              : ""
          }`,
          payload.projectId
        );
        showAlert?.("สำเร็จ", `แก้ไข ${config.title} เรียบร้อยแล้ว`, "success");
      } else {
        const ok = await addData(
          config.collectionName,
          { ...payload, createdAt: new Date().toISOString() },
          null,
          { skipLog: true }
        );
        if (!ok) return;
        let payAutoReceiveResult = { createdReceiveNos: [], deletedReceiveNos: [] as string[] };
        if (isBillingMode && billingInvoiceIds.length > 0) {
          const invoiceUpdates = await Promise.all(
            billingInvoiceIds.map((invoiceId: string) =>
              updateData(
                "invoices",
                invoiceId,
                {
                  status: "Inpay",
                  billingNo: payload.docNo,
                  billingDate: payload.docDate,
                  updatedAt: new Date().toISOString(),
                },
                { skipLog: true }
              )
            )
          );
          if (invoiceUpdates.some((result) => !result)) {
            throw new Error("สร้าง Billing แล้ว แต่เปลี่ยนสถานะ Invoice บางรายการไม่สำเร็จ");
          }
        }
        if (isBillingMode && billingInvoiceIds.length > 0) {
          await syncPoStatusForInvoiceIds(billingInvoiceIds, "Inpay");
        }
        if (isPayMode && payBillingIds.length > 0) {
          const now = new Date().toISOString();
          const billingUpdates = await Promise.all(
            payBillingIds.map((billingId: string) =>
              updateData(
                "billings",
                billingId,
                {
                  status: "paid",
                  payNo: payload.docNo,
                  payDate: payload.docDate,
                  payPaymentType: payload.paymentType,
                  updatedAt: now,
                },
                { skipLog: true }
              )
            )
          );
          if (billingUpdates.some((result) => !result)) {
            throw new Error("สร้าง Pay แล้ว แต่เปลี่ยนสถานะ Billing บางรายการไม่สำเร็จ");
          }
          const invoiceUpdates = await Promise.all(
            payInvoiceIds.map((invoiceId: string) =>
              updateData(
                "invoices",
                invoiceId,
                {
                  status: "paid",
                  payNo: payload.docNo,
                  payDate: payload.docDate,
                  updatedAt: now,
                },
                { skipLog: true }
              )
            )
          );
          if (invoiceUpdates.some((result) => !result)) {
            throw new Error("สร้าง Pay แล้ว แต่เปลี่ยนสถานะ Invoice บางรายการไม่สำเร็จ");
          }
          const payInvoiceOverrides = new Map<string, any>(
            payInvoiceIds.map((invoiceId: string) => [invoiceId, {
              status: "paid",
              payNo: payload.docNo,
              payDate: payload.docDate,
              payPaymentType: payload.paymentType,
              updatedAt: now,
            }])
          );
          payAutoReceiveResult = await syncAutoReceivesForPay({
            nextDocNo: payload.docNo,
            nextDocDate: payload.docDate,
            billingIds: payBillingIds,
            invoiceIds: payInvoiceIds,
            invoiceOverrides: payInvoiceOverrides,
            projectId: payload.projectId,
          });
        }
        if (isPayMode && payInvoiceIds.length > 0) {
          await syncPoStatusForInvoiceIds(payInvoiceIds, "paid");
        }
        await logAction?.(
          `Create ${config.saveLogLabel}`,
          `สร้าง ${config.saveLogLabel} | ${getRowLogSummary({ ...payload, id: payload.docNo || payload.poRef || config.saveLogLabel }, payload)} | อ้างอิง: ${truncateLogText(payload.poRef || "-", 80)}${
            isPayMode && payAutoReceiveResult.createdReceiveNos.length > 0
              ? ` | Auto Receive: ${payAutoReceiveResult.createdReceiveNos.join(", ")}`
              : ""
          }`,
          payload.projectId
        );
        showAlert?.("สำเร็จ", `สร้าง ${config.title} เรียบร้อยแล้ว`, "success");
      }
      if (isBillingMode) setActiveBillingTab("history");
      if (isPayMode) setActivePayTab("history");
      closeModal();
    } catch (error: any) {
      showAlert?.("เกิดข้อผิดพลาด", error?.message || String(error), "error");
    } finally {
      setSaving(false);
    }
  }, [
    addData,
    billingInvoiceCandidates,
    closeModal,
    config.collectionName,
    config.numberLabel,
    config.saveLogLabel,
    config.title,
    editingRow,
    formData,
    isBillingMode,
    isPayMode,
    invoices,
    logAction,
    payBillingCandidates,
    rows,
    selectedProjectId,
    showAlert,
    syncPoStatusForInvoiceIds,
    syncPoStatusFromInvoiceOverrides,
    updateData,
    userData,
  ]);

  const handleDelete = useCallback((row: any) => {
    openConfirm?.(
      "ยืนยันการลบ",
      `ต้องการลบ ${config.title} ${row.docNo || row.id} ใช่หรือไม่?`,
      async () => {
        const nowIso = new Date().toISOString();
        const basePath = ["artifacts", appId, "public", "data"] as const;

        try {
          if (isBillingMode) {
            const linkedPay = (payRows || []).find((pay: any) =>
              Array.isArray(pay?.billingIds) &&
              pay.billingIds.map((id: any) => String(id)).includes(String(row.id))
            );

            if (linkedPay) {
              showAlert?.(
                "ยังลบไม่ได้",
                `Billing ${row.docNo || row.id} ถูกใช้งานใน Pay ${linkedPay.docNo || linkedPay.id} กรุณาลบ Pay ก่อน`,
                "warning"
              );
              return;
            }

            const invoiceIds = Array.from(new Set((row.invoiceIds || []).map((id: any) => String(id)).filter(Boolean)));
            const invoiceOverrides = new Map<string, any>();
            const touchedPoIds = new Set<string>();
            const batch = writeBatch(db);

            batch.delete(doc(db, ...basePath, "billings", row.id));

            invoiceIds.forEach((invoiceId) => {
              invoiceOverrides.set(invoiceId, {
                status: "Invcredit",
                billingNo: null,
                billingDate: null,
                payNo: null,
                payDate: null,
                updatedAt: nowIso,
              });
              const invoice = (invoices || []).find((item: any) => String(item.id) === invoiceId);
              if (invoice?.poId) touchedPoIds.add(String(invoice.poId));
              batch.update(doc(db, ...basePath, "invoices", invoiceId), {
                status: "Invcredit",
                billingNo: null,
                billingDate: null,
                payNo: null,
                payDate: null,
                updatedAt: nowIso,
              });
            });

            touchedPoIds.forEach((poId) => {
              const nextPoStatus = getNextPoStatusFromInvoices(poId, invoiceOverrides);
              if (!nextPoStatus) return;
              batch.update(doc(db, ...basePath, "pos", poId), {
                status: nextPoStatus,
                statusNow: nextPoStatus,
                updatedAt: nowIso,
              });
            });

            await batch.commit();
          } else if (isPayMode) {
            const billingIds = Array.from(new Set((row.billingIds || []).map((id: any) => String(id)).filter(Boolean)));
            const invoiceIds = Array.from(new Set((row.invoiceIds || []).map((id: any) => String(id)).filter(Boolean)));
            const linkedReceives = getPayLinkedAutoReceives(row.docNo || "");
            const invoiceOverrides = new Map<string, any>();
            const touchedPoIds = new Set<string>();
            const batch = writeBatch(db);

            batch.delete(doc(db, ...basePath, "pays", row.id));

            linkedReceives.forEach((receive: any) => {
              batch.delete(doc(db, ...basePath, "receives", receive.id));
            });

            billingIds.forEach((billingId) => {
              batch.update(doc(db, ...basePath, "billings", billingId), {
                status: "Inpay",
                payNo: null,
                payDate: null,
                updatedAt: nowIso,
              });
            });

            invoiceIds.forEach((invoiceId) => {
              invoiceOverrides.set(invoiceId, {
                status: "Inpay",
                payNo: null,
                payDate: null,
                payPaymentType: null,
                updatedAt: nowIso,
              });
              const invoice = (invoices || []).find((item: any) => String(item.id) === invoiceId);
              if (invoice?.poId) touchedPoIds.add(String(invoice.poId));
              batch.update(doc(db, ...basePath, "invoices", invoiceId), {
                status: "Inpay",
                payNo: null,
                payDate: null,
                payPaymentType: null,
                updatedAt: nowIso,
              });
            });

            touchedPoIds.forEach((poId) => {
              const nextPoStatus = getNextPoStatusFromInvoices(poId, invoiceOverrides);
              if (!nextPoStatus) return;
              batch.update(doc(db, ...basePath, "pos", poId), {
                status: nextPoStatus,
                statusNow: nextPoStatus,
                updatedAt: nowIso,
              });
            });

            await batch.commit();
          } else {
            const ok = await deleteData(config.collectionName, row.id, { skipLog: true });
            if (!ok) return;
          }
        } catch (error: any) {
          showAlert?.("เกิดข้อผิดพลาด", error?.message || String(error), "error");
          return;
        }

        await logAction?.(
          `Delete ${config.saveLogLabel}`,
          `${buildDeleteLogDetails(logCollectionName, row, row.id)}${
            isPayMode && getPayLinkedAutoReceives(row.docNo || "").length > 0
              ? ` | ลบ Receive อัตโนมัติ ${getPayLinkedAutoReceives(row.docNo || "").length} รายการ`
              : ""
          }`,
          row.projectId
        );
        showAlert?.("สำเร็จ", `ลบ ${config.title} เรียบร้อยแล้ว`, "success");
      },
      "danger"
    );
  }, [appId, config.collectionName, config.saveLogLabel, config.title, db, deleteData, getNextPoStatusFromInvoices, getPayLinkedAutoReceives, invoices, isBillingMode, isPayMode, logAction, openConfirm, payRows, showAlert]);

  const numberHeader = config.numberLabel;
  const refHeader = config.refLabel;
  const modalNode = (
    <AnimatePresence>
      {isModalOpen && (
        <motion.div
          className="fixed inset-0 z-[10010] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-md"
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={modalOverlayVariants}
          transition={overlayTransition}
          onClick={closeModal}
        >
          <motion.div
            className="my-8 w-full max-w-3xl rounded-2xl bg-white shadow-2xl"
            variants={modalContentVariants}
            transition={modalTransition}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`flex items-center justify-between rounded-t-2xl border-b px-5 py-3 ${config.theme.soft} ${config.theme.border}`}>
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${config.theme.iconBox}`}>
                  <Icon size={18} className={config.theme.iconText} />
                </div>
                <div>
                  <h3 className={`text-lg font-bold ${config.theme.title}`}>
                    {editingRow ? config.editLabel : config.actionLabel}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isBillingMode
                      ? "เลือก Vendor จาก Invoice เครดิต แล้วเลือกรายการ Invoice ที่ต้องการสร้าง Billing"
                      : isPayMode
                        ? "เลือก Vendor จากประวัติ Billing สถานะ Inpay แล้วเลือกรายการ Billing ที่ต้องการจ่าย"
                        : "โครงสร้างสร้างรายการแบบฟอร์มเดี่ยวในแนวเดียวกับหน้า PO"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-700">
                    <FileText size={12} /> {config.numberLabel}
                  </label>
                  <input
                    type="text"
                    value={formData.docNo}
                    onChange={(e) => setFormData((prev) => ({ ...prev, docNo: e.target.value }))}
                    placeholder={config.numberPlaceholder}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </div>
                <div>
                  <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-700">
                    <Calendar size={12} /> {isPayMode ? "วันที่จ่าย" : "วันที่เอกสาร"}
                  </label>
                  <input
                    type="date"
                    value={formData.docDate}
                    onChange={(e) => setFormData((prev) => ({ ...prev, docDate: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </div>
                {isBillingMode && (
                  <div>
                    <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-700">
                      <Calendar size={12} /> วันครบกำหนดชำระ
                    </label>
                    <input
                      type="date"
                      value={formData.dueDate}
                      onChange={(e) => setFormData((prev) => ({ ...prev, dueDate: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                )}
                <div>
                  <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-700">
                    <FileText size={12} /> {config.refLabel}
                  </label>
                  <input
                    type="text"
                    value={formData.poRef}
                    onChange={(e) => setFormData((prev) => ({ ...prev, poRef: e.target.value }))}
                    placeholder="กรอกเลขอ้างอิง"
                    readOnly={isBillingMode || isPayMode}
                    className={`w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 ${
                      isBillingMode || isPayMode ? "bg-slate-50 text-slate-600" : "bg-white"
                    }`}
                  />
                </div>
                <div>
                  <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-700">
                    <CreditCard size={12} /> ประเภทการชำระ
                  </label>
                  <select
                    value={formData.paymentType}
                    onChange={(e) => setFormData((prev) => ({ ...prev, paymentType: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  >
                    {(isBillingMode ? BILLING_PAYMENT_TYPES : isPayMode ? PAY_PAYMENT_TYPES : PAYMENT_TYPES).map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-700">
                    <FileText size={12} /> Vendor
                  </label>
                  <select
                    value={formData.vendorId}
                    onChange={(e) => handleVendorChange(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  >
                    <option value="">เลือก Vendor</option>
                    {(isBillingMode ? billingVendorOptions : payVendorOptions).map((vendor: any) => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.name}
                        {isBillingMode ? ` (${vendor.count} Invoice)` : isPayMode ? ` (${vendor.count} Billing)` : ""}
                      </option>
                    ))}
                  </select>
                  {isBillingMode && billingVendorOptions.length === 0 && (
                    <p className="mt-1 text-[11px] text-amber-600">
                      ไม่มี Invoice สถานะ Invcredit ที่พร้อมสร้าง Billing
                    </p>
                  )}
                  {isPayMode && payVendorOptions.length === 0 && (
                    <p className="mt-1 text-[11px] text-amber-600">
                      ไม่มี Billing สถานะ Inpay ที่พร้อมสร้าง Pay
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-700">
                    <Wallet size={12} /> {isBillingMode ? "ยอดก่อน VAT" : isPayMode ? "ยอดจ่ายหลัง VAT" : "จำนวนเงิน"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
                    readOnly={isBillingMode || isPayMode}
                    placeholder="0.00"
                    className={`w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 ${
                      isBillingMode || isPayMode ? "bg-slate-50 text-slate-600" : "bg-white"
                    }`}
                  />
                </div>
              </div>

              {isBillingMode && (
                <div className="rounded-2xl border border-cyan-100 bg-cyan-50/40 p-3">
                  <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-cyan-800">เลือก Invoice เครดิต</h4>
                      <p className="text-[11px] text-slate-500">
                        แสดงเฉพาะ Invoice สถานะ Invcredit ของ Vendor ที่เลือก
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={!formData.vendorId || selectedVendorInvoices.length === 0}
                        onClick={() => updateBillingInvoiceSelection(selectedVendorInvoices.map((invoice: any) => String(invoice.id)))}
                      >
                        เลือกทั้งหมด
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={!formData.selectedInvoiceIds?.length}
                        onClick={() => updateBillingInvoiceSelection([])}
                      >
                        ล้าง
                      </Button>
                    </div>
                  </div>

                  {!formData.vendorId ? (
                    <div className="rounded-xl border border-dashed border-cyan-200 bg-white/70 px-3 py-6 text-center text-sm text-slate-400">
                      กรุณาเลือก Vendor ก่อน
                    </div>
                  ) : selectedVendorInvoices.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-cyan-200 bg-white/70 px-3 py-6 text-center text-sm text-slate-400">
                      ไม่มี Invoice เครดิตของ Vendor นี้
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-auto rounded-xl border border-cyan-100 bg-white">
                      <table className="w-full min-w-[720px] text-left text-xs">
                        <thead className="sticky top-0 bg-cyan-50 text-slate-600">
                          <tr>
                            <th className="px-3 py-2 text-center">เลือก</th>
                            <th className="px-3 py-2">Invoice No.</th>
                            <th className="px-3 py-2">Ref. PO</th>
                            <th className="px-3 py-2">วันที่</th>
                            <th className="px-3 py-2 text-right">ก่อน VAT</th>
                            <th className="px-3 py-2 text-right">หลัง VAT</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-cyan-50">
                          {selectedVendorInvoices.map((invoice: any) => {
                            const checked = (formData.selectedInvoiceIds || []).map(String).includes(String(invoice.id));
                            return (
                              <tr key={invoice.id} className={checked ? "bg-cyan-50/50" : "bg-white"}>
                                <td className="px-3 py-2 text-center">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleBillingInvoice(String(invoice.id))}
                                    className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                                  />
                                </td>
                                <td className="px-3 py-2 font-semibold text-cyan-700">{invoice.invNo || "-"}</td>
                                <td className="px-3 py-2 text-amber-600">{invoice.poNo || invoice.poRef || "-"}</td>
                                <td className="px-3 py-2 whitespace-nowrap">{formatDate(invoice.invDate)}</td>
                                <td className="px-3 py-2 text-right font-semibold">{formatCurrency(getInvoiceAmountBeforeVat(invoice))}</td>
                                <td className="px-3 py-2 text-right font-semibold text-slate-800">{formatCurrency(getInvoiceAmountAfterVat(invoice))}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                    <div className="rounded-xl bg-white px-3 py-2 text-right shadow-sm">
                      <p className="text-[11px] font-semibold text-slate-500">รวมก่อน VAT</p>
                      <p className="text-sm font-bold text-slate-800">{formatCurrency(selectedBillingTotals.beforeVat)}</p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2 text-right shadow-sm">
                      <p className="text-[11px] font-semibold text-slate-500">VAT 7%</p>
                      <p className="text-sm font-bold text-cyan-700">{formatCurrency(selectedBillingTotals.vat)}</p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2 text-right shadow-sm">
                      <p className="text-[11px] font-semibold text-slate-500">รวมหลัง VAT</p>
                      <p className="text-base font-extrabold text-slate-900">{formatCurrency(selectedBillingTotals.afterVat)}</p>
                    </div>
                  </div>
                </div>
              )}

              {isPayMode && (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3">
                  <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-emerald-800">เลือก Billing สถานะ Inpay</h4>
                      <p className="text-[11px] text-slate-500">
                        แสดงเฉพาะ Billing จากประวัติ Billing ของ Vendor ที่เลือก
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={!formData.vendorId || selectedVendorPayBillings.length === 0}
                        onClick={() => updatePayBillingSelection(selectedVendorPayBillings.map((billing: any) => String(billing.id)))}
                      >
                        เลือกทั้งหมด
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={!formData.selectedBillingIds?.length}
                        onClick={() => updatePayBillingSelection([])}
                      >
                        ล้าง
                      </Button>
                    </div>
                  </div>

                  {!formData.vendorId ? (
                    <div className="rounded-xl border border-dashed border-emerald-200 bg-white/70 px-3 py-6 text-center text-sm text-slate-400">
                      กรุณาเลือก Vendor ก่อน
                    </div>
                  ) : selectedVendorPayBillings.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-emerald-200 bg-white/70 px-3 py-6 text-center text-sm text-slate-400">
                      ไม่มี Billing สถานะ Inpay ของ Vendor นี้
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-auto rounded-xl border border-emerald-100 bg-white">
                      <table className="w-full min-w-[760px] text-left text-xs">
                        <thead className="sticky top-0 bg-emerald-50 text-slate-600">
                          <tr>
                            <th className="px-3 py-2 text-center">เลือก</th>
                            <th className="px-3 py-2">Billing No.</th>
                            <th className="px-3 py-2">Ref. PO</th>
                            <th className="px-3 py-2">วันที่ Billing</th>
                            <th className="px-3 py-2 text-right">ก่อน VAT</th>
                            <th className="px-3 py-2 text-right">VAT</th>
                            <th className="px-3 py-2 text-right">หลัง VAT</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-emerald-50">
                          {selectedVendorPayBillings.map((billing: any) => {
                            const checked = (formData.selectedBillingIds || []).map(String).includes(String(billing.id));
                            const beforeVat = Number(billing.amountBeforeVat ?? billing.amount ?? 0);
                            const vat = Number(billing.vatAmount ?? 0);
                            const afterVat = Number(billing.amountAfterVat ?? beforeVat + vat);
                            return (
                              <tr key={billing.id} className={checked ? "bg-emerald-50/50" : "bg-white"}>
                                <td className="px-3 py-2 text-center">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => togglePayBilling(String(billing.id))}
                                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                  />
                                </td>
                                <td className="px-3 py-2 font-semibold text-emerald-700">{billing.docNo || "-"}</td>
                                <td className="px-3 py-2 text-amber-600">{billing.poRef || "-"}</td>
                                <td className="px-3 py-2 whitespace-nowrap">{formatDate(billing.docDate)}</td>
                                <td className="px-3 py-2 text-right font-semibold">{formatCurrency(beforeVat)}</td>
                                <td className="px-3 py-2 text-right font-semibold text-emerald-700">{formatCurrency(vat)}</td>
                                <td className="px-3 py-2 text-right font-semibold text-slate-800">{formatCurrency(afterVat)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                    <div className="rounded-xl bg-white px-3 py-2 text-right shadow-sm">
                      <p className="text-[11px] font-semibold text-slate-500">รวมก่อน VAT</p>
                      <p className="text-sm font-bold text-slate-800">{formatCurrency(selectedPayTotals.beforeVat)}</p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2 text-right shadow-sm">
                      <p className="text-[11px] font-semibold text-slate-500">VAT</p>
                      <p className="text-sm font-bold text-emerald-700">{formatCurrency(selectedPayTotals.vat)}</p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2 text-right shadow-sm">
                      <p className="text-[11px] font-semibold text-slate-500">รวมจ่าย</p>
                      <p className="text-base font-extrabold text-slate-900">{formatCurrency(selectedPayTotals.afterVat)}</p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">รายละเอียด</label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder={`ระบุรายละเอียด ${config.title}`}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">หมายเหตุ</label>
                <textarea
                  rows={2}
                  value={formData.note}
                  onChange={(e) => setFormData((prev) => ({ ...prev, note: e.target.value }))}
                  placeholder="หมายเหตุเพิ่มเติม"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <Button type="button" variant="secondary" onClick={closeModal} disabled={saving}>
                ยกเลิก
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving} className={`${config.theme.accent} text-white`}>
                {saving ? "กำลังบันทึก..." : editingRow ? "บันทึกการแก้ไข" : "บันทึกรายการ"}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border bg-white/40 p-3 shadow-sm ${config.theme.border}`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl shadow-sm ${config.theme.iconBox}`}>
              <Icon size={20} className={config.theme.iconText} />
            </div>
            <div>
              <h2 className={`text-lg font-bold leading-none ${config.theme.title}`}>
                {config.titlePrefix} {config.title}
              </h2>
              <p className={`mt-1 text-[11px] ${config.theme.desc}`}>{config.description}</p>
            </div>
          </div>
          {canCreate && (
            <Button type="button" onClick={openCreateModal} className={`${config.theme.accent} text-white`}>
              <span className="flex items-center gap-2">
                <Plus size={15} />
                {config.actionLabel}
              </span>
            </Button>
          )}
        </div>
      </div>

      {isBillingMode && (
        <div className="flex flex-wrap gap-2 rounded-2xl border border-cyan-100 bg-white/50 p-2 shadow-sm">
          <button
            type="button"
            onClick={() => setActiveBillingTab("current")}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              activeBillingTab === "current"
                ? "bg-cyan-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-cyan-50 hover:text-cyan-700"
            }`}
          >
            Billing ({currentBillingRows.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveBillingTab("history")}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              activeBillingTab === "history"
                ? "bg-cyan-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-cyan-50 hover:text-cyan-700"
            }`}
          >
            ประวัติ Billing ({billingHistoryRows.length})
          </button>
        </div>
      )}

      {isPayMode && (
        <div className="flex flex-wrap gap-2 rounded-2xl border border-emerald-100 bg-white/50 p-2 shadow-sm">
          <button
            type="button"
            onClick={() => setActivePayTab("current")}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              activePayTab === "current"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-emerald-50 hover:text-emerald-700"
            }`}
          >
            Pay ({currentPayRows.length})
          </button>
          <button
            type="button"
            onClick={() => setActivePayTab("history")}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              activePayTab === "history"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-emerald-50 hover:text-emerald-700"
            }`}
          >
            ประวัติ Pay ({payHistoryRows.length})
          </button>
        </div>
      )}

      <Card className={`border ${config.theme.border}`}>
        <div className={`flex flex-col gap-3 rounded-xl border px-4 py-3 md:flex-row md:items-center ${config.theme.soft} ${config.theme.border}`}>
          <div className="relative">
            <Search size={14} className={`pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 ${config.theme.filterIcon}`} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={`ค้นหา ${config.title} No. / Vendor / Ref.`}
              className={`w-72 rounded-xl border bg-white py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 ${config.theme.filterBorder}`}
            />
          </div>
          <div className="ml-auto text-right">
            <p className="text-[11px] text-slate-500">{filteredRows.length} รายการ</p>
            <p className="text-sm font-bold text-slate-800">{formatCurrency(totalAmount)}</p>
          </div>
        </div>
      </Card>

      <Card className={`overflow-x-auto border ${config.theme.border}`}>
        <table className="w-full min-w-[980px] text-left text-xs text-slate-600">
          <thead className={`bg-gradient-to-r ${config.theme.head} border-b ${config.theme.border} text-slate-600 uppercase font-semibold`}>
            <tr>
              <th className="px-3 py-2">{numberHeader}</th>
              <th className="px-3 py-2">{refHeader}</th>
              <th className="px-3 py-2">Vendor</th>
              <th className="px-3 py-2">วันที่</th>
              {isBillingMode && <th className="px-3 py-2">วันครบกำหนดชำระ</th>}
              <th className="px-3 py-2">รายละเอียด</th>
              <th className="px-3 py-2">ชำระ</th>
              <th className="px-3 py-2 text-right">จำนวนเงิน</th>
              <th className="px-3 py-2 text-center">สถานะ</th>
              <th className="px-3 py-2 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={isBillingMode ? 10 : 9} className="px-3 py-12 text-center text-sm text-slate-400">
                  {isBillingMode && activeBillingTab === "history"
                    ? "ยังไม่มีประวัติ Billing สำหรับโครงการนี้"
                    : isPayMode && activePayTab === "history"
                      ? "ยังไม่มีประวัติ Pay สำหรับโครงการนี้"
                    : config.emptyText}
                </td>
              </tr>
            ) : (
              filteredRows.map((row: any, idx: number) => (
                <tr
                  key={row.id}
                  className={`transition-colors ${idx % 2 === 0 ? "bg-white" : config.theme.altRow} ${config.theme.hoverRow}`}
                >
                  <td className={`px-3 py-2 font-semibold ${config.theme.number}`}>{row.docNo || "-"}</td>
                  <td className="px-3 py-2 font-medium text-amber-600">{row.poRef || "-"}</td>
                  <td className="px-3 py-2">{row.vendorName || "-"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.docDate)}</td>
                  {isBillingMode && (
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.dueDate ? formatDate(row.dueDate) : "-"}
                    </td>
                  )}
                  <td className="px-3 py-2 max-w-[260px] truncate" title={row.description || row.note || "-"}>
                    {row.description || row.note || "-"}
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      {row.paymentType || "-"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">{formatCurrency(row.amount || 0)}</td>
                  <td className="px-3 py-2 text-center">
                    <Badge status={row.status || "Draft"} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-2">
                      {canEdit && row.sourceType !== "invoice" && (
                        <button
                          type="button"
                          onClick={() => openEditModal(row)}
                          className={`transition-colors ${config.theme.edit}`}
                          title={config.editLabel}
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      {canDelete && row.sourceType !== "invoice" && (
                        <button
                          type="button"
                          onClick={() => handleDelete(row)}
                          className="text-red-400 transition-colors hover:text-red-600"
                          title={config.deleteLabel}
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

      {typeof document !== "undefined" ? createPortal(modalNode, document.body) : null}
    </div>
  );
});

export default BillingPayView;
