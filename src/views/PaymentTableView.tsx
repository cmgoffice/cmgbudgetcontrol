// @ts-nocheck
import React, { useState, useMemo } from "react";
import ReactDOM from "react-dom";
import {
  Search, CreditCard, FileSpreadsheet, Paperclip,
  Trash2, Eye, Filter, FileText, ChevronLeft, ChevronRight, Wallet,
} from "lucide-react";
import { useAppData } from "../contexts/AppDataContext";
import { useUI } from "../contexts/UIContext";
import ColumnVisibilityToggle from "../components/ColumnVisibilityToggle";
import { Card, Badge, formatCurrency } from "../components/ui";
import { resolvePaymentSignatureImage } from "../lib/paymentSignatureStamps";
import { buildPoBudgetReturnPlan, enqueuePoBudgetReturnJob } from "../lib/poBudgetReturn";

const BANK_ACCOUNT_OPTIONS = [
  "KBANK-4971008992",
  "SCB-6443017701",
  "GSB-000001396654",
  "GSB-020284909098",
];

const PAYMENT_TABLES_PER_PAGE = 10;

// Payment No. ใช้เลขท้ายเป็นเลขงวด เช่น PO-001-001, PO-001-002
// จึงต้องแยกเลข PO หลักออกมาก่อน แล้วค่อยเรียงงวดเป็นตัวเลข
const getPaymentPeriodNoForSort = (payment: any): number => {
  const explicitPeriod = Number.parseInt(String(payment?.periodNo ?? ""), 10);
  if (Number.isFinite(explicitPeriod) && explicitPeriod > 0) return explicitPeriod;

  const suffix = String(payment?.paymentNo || "").match(/-(\d+)$/);
  const periodFromPaymentNo = suffix ? Number.parseInt(suffix[1], 10) : NaN;
  return Number.isFinite(periodFromPaymentNo) && periodFromPaymentNo > 0 ? periodFromPaymentNo : 0;
};

const getPaymentGroupKeyForSort = (payment: any): string => {
  const paymentNo = String(payment?.paymentNo || "").trim();
  if (paymentNo) return paymentNo.replace(/-\d+$/, "");

  const poReference = String(payment?.sourcePoNo || payment?.poNo || "").trim();
  if (poReference) return poReference;

  const selectedPrIds = Array.isArray(payment?.selectedPrIds)
    ? payment.selectedPrIds.map((id: any) => String(id)).sort().join("|")
    : "";
  return selectedPrIds || String(payment?.id || "");
};

const comparePaymentRows = (left: any, right: any): number => {
  const groupCompare = getPaymentGroupKeyForSort(left).localeCompare(
    getPaymentGroupKeyForSort(right),
    undefined,
    { numeric: true, sensitivity: "base" },
  );
  if (groupCompare !== 0) return groupCompare;

  const periodCompare = getPaymentPeriodNoForSort(left) - getPaymentPeriodNoForSort(right);
  if (periodCompare !== 0) return periodCompare;

  return String(left?.paymentNo || left?.id || "").localeCompare(
    String(right?.paymentNo || right?.id || ""),
    undefined,
    { numeric: true, sensitivity: "base" },
  );
};

const PaymentTableView = React.memo(() => {
  const {
    payments = [],
    paymentsReady,
    prs = [],
    invoices = [],
    addData,
    updateData,
    vendors,
    pos = [],
    projects,
    visibleProjects,
    openConfirm,
    showAlert,
    deleteData,
    logAction,
    canUseFunction,
    userRole,
    userRoles = [],
    userData,
    user,
    isColumnVisible,
    db,
    appId,
  } = useAppData();

  const { selectedProjectId } = useUI();

  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterProject, setFilterProject] = useState(selectedProjectId || "all");
  const [viewingPayment, setViewingPayment] = useState<any>(null);
  const [paymentSignatureImages, setPaymentSignatureImages] = useState<Record<string, string | null>>({});
  const [backfillPaymentId, setBackfillPaymentId] = useState<string | null>(null);
  const [backfilledPaymentIds, setBackfilledPaymentIds] = useState<Set<string>>(new Set());
  const [invoicePaymentModal, setInvoicePaymentModal] = useState<any>(null);
  const [historicalPaymentType, setHistoricalPaymentType] = useState("เครดิต");
  const [historicalBankAccountNo, setHistoricalBankAccountNo] = useState("");
  const [paymentPage, setPaymentPage] = useState(1);

  React.useEffect(() => {
    setFilterProject(selectedProjectId || "all");
  }, [selectedProjectId]);

  React.useEffect(() => {
    if (!viewingPayment) {
      setPaymentSignatureImages({});
      return;
    }

    let cancelled = false;
    setPaymentSignatureImages({});
    (async () => {
      const entries = await Promise.all(
        ["Signature1", "Signature2", "Signature3"].map(async (slot) => {
          try {
            const image = await resolvePaymentSignatureImage(viewingPayment, slot, {
              currentUserData: userData,
              currentAuthUser: user,
            });
            return [slot, image || null];
          } catch (err) {
            console.warn(`[PaymentTable Signature UI] Resolve ${slot} failed:`, err);
            return [slot, null];
          }
        })
      );
      if (!cancelled) setPaymentSignatureImages(Object.fromEntries(entries));
    })();

    return () => {
      cancelled = true;
    };
  }, [viewingPayment, userData, user]);

  const allStatuses = ["Draft", "Pending", "Approved", "Reject", "Paid", "จบงาน"];

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return payments.filter((p: any) => {
      const contractor = vendors?.find((v: any) => v.id === p.contractorId);
      const searchableContractTitle = String(p.contractTitle || "").toLowerCase();
      const searchablePoNo = String(p.sourcePoNo || p.poNo || "").toLowerCase();
      const matchSearch =
        !q ||
        (p.paymentNo || "").toLowerCase().includes(q) ||
        searchablePoNo.includes(q) ||
        searchableContractTitle.includes(q) ||
        (p.paymentType || "").toLowerCase().includes(q) ||
        (contractor?.name || "").toLowerCase().includes(q) ||
        (p.billingCycle || "").toLowerCase().includes(q) ||
        (p.jobCompletedBy || p.completedBy || "").toLowerCase().includes(q);
      const normalizedStatus = p.jobCompleted ? "จบงาน" : (p.status === "Rejected" ? "Reject" : p.status);
      const matchStatus = filterStatus === "all" || normalizedStatus === filterStatus;
      const matchType = filterType === "all" || p.paymentType === filterType;
      const matchProject = filterProject === "all" || p.projectId === filterProject;
      return matchSearch && matchStatus && matchType && matchProject;
    }).sort(comparePaymentRows);
  }, [payments, vendors, searchTerm, filterStatus, filterType, filterProject]);

  const paymentGroups = useMemo(() => {
    const groups = new Map<string, any>();

    filtered.forEach((payment: any) => {
      const groupKey = getPaymentGroupKeyForSort(payment);
      if (!groups.has(groupKey)) {
        const paymentPoIds = new Set([
          ...(Array.isArray(payment?.selectedPrIds) ? payment.selectedPrIds : []),
          payment?.sourcePoId,
          payment?.poId,
          payment?.poRef,
        ].filter(Boolean).map((id: any) => String(id)));
        const linkedPo = (pos || []).find((po: any) => (
          paymentPoIds.has(String(po.id)) || paymentPoIds.has(String(po.poNo || ""))
        )) || (pos || []).find((po: any) => String(po.poNo || "") === groupKey);

        groups.set(groupKey, {
          key: groupKey,
          po: linkedPo || null,
          poNo: payment?.sourcePoNo || payment?.poNo || linkedPo?.poNo || groupKey,
          contractTitle: payment?.contractTitle || linkedPo?.contractTitle || "-",
          payments: [],
        });
      }
      groups.get(groupKey).payments.push(payment);
    });

    return Array.from(groups.values());
  }, [filtered, pos]);

  const totalPaymentPages = Math.max(1, Math.ceil(paymentGroups.length / PAYMENT_TABLES_PER_PAGE));

  React.useEffect(() => {
    setPaymentPage(1);
  }, [searchTerm, filterStatus, filterType, filterProject]);

  React.useEffect(() => {
    setPaymentPage((currentPage) => Math.min(Math.max(currentPage, 1), totalPaymentPages));
  }, [totalPaymentPages]);

  const visiblePaymentGroups = useMemo(() => {
    const start = (paymentPage - 1) * PAYMENT_TABLES_PER_PAGE;
    return paymentGroups.slice(start, start + PAYMENT_TABLES_PER_PAGE);
  }, [paymentGroups, paymentPage]);

  const statusColors: Record<string, string> = {
    "Draft": "bg-slate-50 text-slate-500 border-slate-200",
    "Pending": "bg-amber-50 text-amber-700 border-amber-200",
    "Approved": "bg-emerald-50 text-emerald-700 border-emerald-200",
    "Reject": "bg-red-50 text-red-700 border-red-200",
    "Rejected": "bg-red-50 text-red-700 border-red-200",
    "Paid": "bg-teal-50 text-teal-700 border-teal-200",
    "จบงาน": "bg-teal-100 text-teal-800 border-teal-300",
  };

  const hasInvoiceForPayment = (payment: any) => {
    const paymentId = String(payment?.id || "");
    const paymentNo = String(payment?.paymentNo || "");
    const periodNo = String(payment?.periodNo || "");
    return (invoices || []).some((invoice: any) => {
      if (invoice?.sourceType === "payment" && String(invoice.paymentId || invoice.poId || "") === paymentId) return true;
      if (String(invoice?.poId || "") === paymentId) return true;
      return paymentNo && String(invoice?.paymentNo || "") === paymentNo && (
        !periodNo || !invoice?.paymentPeriodNo || String(invoice.paymentPeriodNo) === periodNo
      );
    });
  };

  const canBackfillPaymentInvoice = userRole === "Administrator" || canUseFunction?.("invoice", "add") !== false;
  const isPaidPayment = (payment: any) => String(payment?.status || "").trim().toLowerCase() === "paid";
  const openHistoricalInvoiceModal = (payment: any) => {
    setHistoricalPaymentType("เครดิต");
    setHistoricalBankAccountNo("");
    setInvoicePaymentModal(payment);
  };

  const handleCreateHistoricalInvoice = (payment: any) => {
    if (!canBackfillPaymentInvoice) {
      showAlert?.("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์สร้าง Invoice", "warning");
      return;
    }
    if (!isPaidPayment(payment)) {
      showAlert?.("สร้างไม่ได้", "ฟังก์ชันนี้ใช้สำหรับ Payment ที่สถานะ Paid เท่านั้น", "warning");
      return;
    }
    if (hasInvoiceForPayment(payment) || backfilledPaymentIds.has(String(payment.id))) {
      showAlert?.("รายการมีอยู่แล้ว", "Payment รายการนี้มี Invoice แล้ว จึงไม่สร้างซ้ำ", "info");
      return;
    }

    openConfirm?.(
      "สร้าง Invoice ย้อนหลัง",
      `ต้องการสร้าง Invoice สถานะ Paid จาก Payment ${payment.paymentNo || payment.id} ใช่หรือไม่?`,
      async () => {
        const paymentId = String(payment.id || "");
        if (!paymentId || backfillPaymentId) return;
        setBackfillPaymentId(paymentId);
        try {
          if (hasInvoiceForPayment(payment)) {
            showAlert?.("รายการมีอยู่แล้ว", "พบ Invoice ของ Payment รายการนี้แล้ว", "info");
            return;
          }

          const sourcePoId = payment.sourcePoId || payment.poRef || payment.selectedPrIds?.[0] || "";
          const sourcePo = (pos || []).find((po: any) => String(po.id) === String(sourcePoId));
          const paymentVendor = (vendors || []).find((vendor: any) => String(vendor.id) === String(payment.contractorId || payment.vendorId || ""));
          const paymentVendorName = payment.contractorName || payment.vendorName || paymentVendor?.name || "";
          const paymentItems = Array.isArray(payment.items) ? payment.items : [];
          const items = paymentItems.map((item: any, index: number) => {
            const qtyRaw = Number(item.thisPeriodQty ?? item.quantity);
            const amount = Number(item.thisPeriodAmount ?? item.amount ?? 0) || 0;
            const quantity = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;
            return {
              ...item,
              poItemIndex: Number.isFinite(Number(item.poItemIndex)) ? Number(item.poItemIndex) : index,
              description: item.description || "งานจ้างเหมา/ค่าแรง",
              unit: item.unit || "งวด",
              quantity,
              invoiceQty: quantity,
              price: quantity > 0 ? amount / quantity : 0,
              amount,
            };
          });
          const amount = Number(payment.amount) || items.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
          const attachments = Array.isArray(payment.paymentAttachments) && payment.paymentAttachments.length > 0
            ? payment.paymentAttachments
            : payment.paySlipUrl
              ? [{ url: payment.paySlipUrl, name: payment.paySlipName || "Pay Slip" }]
              : [];
          const now = new Date().toISOString();
          const invoiceNo = payment.invoiceNo || `INV-${payment.paymentNo || payment.id}`;
          const invoicePayload = {
            invNo: invoiceNo,
            invDate: payment.payDate || payment.updatedAt || payment.openDate || now.split("T")[0],
            paymentType: historicalPaymentType,
            bankAccountNo: historicalPaymentType === "โอน" ? historicalBankAccountNo.trim() : "",
            poId: payment.id,
            poNo: payment.paymentNo || payment.id,
            poRef: payment.paymentNo || payment.id,
            sourcePoId: sourcePoId || null,
            sourcePoNo: sourcePo?.poNo || payment.sourcePoNo || "",
            sourceType: "payment",
            paymentId: payment.id,
            paymentNo: payment.paymentNo || payment.id,
            paymentPeriodNo: payment.periodNo || "",
            paymentPeriodSnapshot: {
              paymentNo: payment.paymentNo || payment.id,
              periodNo: payment.periodNo || "",
              billingCycle: payment.billingCycle || "",
              amount,
              items: paymentItems,
              statusBeforeInvoice: payment.status || "Paid",
            },
            vendorId: payment.contractorId || "",
            vendorName: paymentVendorName,
            items,
            amount,
            originalAmount: amount,
            remainingAmount: 0,
            isDeposit: false,
            depositAmount: 0,
            invoiceMode: "payment_subcontract",
            description: `Payment งวด ${payment.periodNo || ""} - ${payment.paymentNo || payment.id}`,
            projectId: payment.projectId || selectedProjectId,
            status: "paid",
            invoiceAttachments: attachments,
            legacyBackfill: true,
            legacyBackfillAt: now,
            legacyBackfillBy: userData?.name || userData?.email || userRole || "",
            createdAt: now,
            createdBy: userData?.name || userData?.email || userRole || "",
          };

          // Deterministic ID makes the migration idempotent even if two users
          // click the action before the realtime invoice list refreshes.
          const historicalInvoiceId = `payment-backfill-${payment.id}-${payment.periodNo || "1"}`;
          const invoiceId = await addData("invoices", invoicePayload, historicalInvoiceId, { skipLog: true });
          if (!invoiceId) throw new Error("สร้าง Invoice ไม่สำเร็จ");

          const invoiceIds = Array.from(new Set([
            ...(Array.isArray(payment.invoiceIds) ? payment.invoiceIds : []),
            String(invoiceId),
          ].filter(Boolean)));
          const paymentUpdated = await updateData("payments", payment.id, {
            invoiceId: String(invoiceId),
            invoiceNo,
            invoiceIds,
            sourceInvoiceIds: invoiceIds,
            legacyInvoiceBackfilled: true,
            legacyInvoiceBackfilledAt: now,
          }, { skipLog: true });
          if (!paymentUpdated) throw new Error("สร้าง Invoice แล้ว แต่เชื่อมกลับไปยัง Payment ไม่สำเร็จ");

          await logAction?.(
            "Create Historical Invoice",
            `สร้าง Invoice ย้อนหลังจาก Payment ${payment.paymentNo || payment.id} | Invoice ${invoiceNo} | ยอด ${amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`,
            payment.projectId || selectedProjectId
          );
          setBackfilledPaymentIds((prev) => new Set([...prev, paymentId]));
          showAlert?.("สำเร็จ", `สร้าง Invoice ${invoiceNo} สถานะ Paid แล้ว และจะแสดงในประวัติ Pay`, "success");
        } catch (error: any) {
          showAlert?.("เกิดข้อผิดพลาด", error?.message || String(error), "error");
        } finally {
          setBackfillPaymentId(null);
        }
      },
      "warning"
    );
  };

  const handleDelete = (p: any) => {
    openConfirm?.(
      "ยืนยันการลบ",
      `ต้องการลบ Payment ${p.paymentNo} ใช่หรือไม่?`,
      async () => {
        await deleteData("payments", p.id, { skipLog: true });
        await logAction?.("Delete Payment", `ลบ Payment ${p.paymentNo}`);
        showAlert?.("สำเร็จ", "ลบ Payment เรียบร้อย", "success");
      },
      "danger"
    );
  };

  // ใช้สิทธิ์เดียวกับปุ่มคืนยอดใน Log PO เพื่อให้ Administrator ตั้ง Role ได้จากจุดเดิม
  const isAdministrator = userRole === "Administrator" || userRoles.includes("Administrator");
  const canStartPoBudgetReturn = isAdministrator || canUseFunction?.("po-table", "returnBudget") === true;

  const handleStartPoBudgetReturn = React.useCallback((po: any, tableCompleted = false) => {
    if (!po?.id || !canStartPoBudgetReturn) return;
    if (String(po?.poType || "").toUpperCase() !== "SP") {
      showAlert?.("ไม่รองรับ PO ประเภทนี้", "ฟังก์ชันคืนยอดรองรับเฉพาะ PO Type SP", "info");
      return;
    }
    if (!paymentsReady) {
      showAlert?.("กำลังโหลด Payment", "กรุณารอข้อมูล Payment โหลดเสร็จแล้วลองใหม่", "info");
      return;
    }

    const plan = buildPoBudgetReturnPlan({ po, payments, prs });
    const processStatus = String(po?.budgetReturnProcessStatus || "");
    if (["Queued", "Running", "Waiting Budget Approval"].includes(processStatus)) {
      showAlert?.("กำลังดำเนินการ", `PO ${po.poNo || po.id} มี Process คืน Budget อยู่แล้ว (${processStatus})`, "info");
      return;
    }
    if (!plan.latestPayment) {
      showAlert?.("ยังไม่มี Payment", "ฟังก์ชันนี้รองรับเฉพาะ PO ที่มี Payment เท่านั้น", "warning");
      return;
    }
    if (!tableCompleted) {
      showAlert?.("ยังไม่จบงาน", "ตาราง Payment ต้องเป็นสถานะจบงานก่อนเริ่มคืนยอด", "warning");
      return;
    }
    if (plan.paymentComplete || plan.balanceBeforeRev <= 0 || plan.returnableAmount <= 0) {
      showAlert?.("ไม่มี Balance ให้คืน", "Payment ใช้ครบ 100% แล้ว จึงไม่ต้องคืน Budget", "info");
      return;
    }

    const prSummary = plan.linkedPrs
      .map((row: any) => `${row.prNo}: คืน ${formatCurrency(row.returnableAmount)} → Rev PR ${formatCurrency(row.newPrTotal)}`)
      .join("\n");
    const message = [
      `PO: ${plan.poNo}`,
      `Payment งวดล่าสุด: ${plan.latestPaymentNo || "-"}`,
      `Balance PO: ${formatCurrency(plan.balanceBeforeRev)}`,
      `ยอดคืน PR/Budget: ${formatCurrency(plan.returnableAmount)}`,
      `ส่วนลดจัดซื้อ (ไม่คืน): ${formatCurrency(plan.procurementSaving)}`,
      prSummary ? `\nรายละเอียด PR:\n${prSummary}` : "",
      "\nระบบจะส่งยอดคืนเข้าโฟลว์ Balance PR และรอผู้มีสิทธิ์ตรวจสอบ จากนั้นต้องไปที่หน้า Budget แล้วกด ‘รับ Budget คืน’ เพื่อรับยอดกลับเข้าระบบ",
    ].filter(Boolean).join("\n");

    openConfirm?.(
      "เริ่มคืน Balance PO เข้า Budget",
      message,
      async () => {
        try {
          await enqueuePoBudgetReturnJob({
            db,
            appId,
            po,
            plan,
            actor: { name: userData?.displayName || userData?.name || userRole, uid: user?.uid, email: user?.email },
          });
          await logAction?.(
            "Start PO Budget Return",
            `เริ่มคืน Balance PO ${plan.poNo}: Balance ${formatCurrency(plan.balanceBeforeRev)} / คืน Budget ${formatCurrency(plan.returnableAmount)} / ส่วนลดไม่คืน ${formatCurrency(plan.procurementSaving)}`,
            po.projectId
          );
          showAlert?.("ส่ง Process แล้ว", `PO ${plan.poNo} ถูกส่งเข้ากระบวนการคืนยอดหลังบ้านแล้ว`, "success");
        } catch (error: any) {
          showAlert?.("เริ่ม Process ไม่สำเร็จ", error?.message || "ไม่สามารถสร้าง Process คืน Budget ได้", "error");
        }
      },
      "warning",
      {
        requireText: "Confirm",
        requireTextLabel: "พิมพ์ Confirm เพื่อยืนยันการคืน Budget",
        requireTextPlaceholder: "Confirm",
      }
    );
  }, [appId, canStartPoBudgetReturn, db, logAction, openConfirm, payments, paymentsReady, prs, showAlert, user, userData, userRole]);

  const renderPaymentRow = (p: any, isCompletedGroup = false) => {
    const contractor = vendors?.find((v: any) => v.id === p.contractorId);
    const displayStatus = p.jobCompleted ? "จบงาน" : (p.status === "Rejected" ? "Reject" : (p.status || "Draft"));
    const statusCls = statusColors[displayStatus] || "bg-slate-50 text-slate-500 border-slate-200";
    const paymentHasInvoice = hasInvoiceForPayment(p) || backfilledPaymentIds.has(String(p.id));
    const isBackfilling = backfillPaymentId === String(p.id);

    return (
      <tr
        key={p.id}
        className={`whitespace-nowrap transition-colors cursor-pointer ${
          isCompletedGroup ? "bg-emerald-50/60 hover:bg-emerald-100/70" : "odd:bg-white even:bg-slate-50/50 hover:bg-orange-50/40"
        }`}
        onClick={() => setViewingPayment(p)}
      >
        {isColumnVisible("payment-table", "actions") && (
          <td
            className="py-2 px-3 md:hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-start gap-1">
              <button
                className="p-1.5 rounded hover:bg-orange-100 text-orange-600 transition-colors"
                title="ดูรายละเอียด"
                onClick={() => setViewingPayment(p)}
              >
                <Eye size={13} />
              </button>
              {canBackfillPaymentInvoice && isPaidPayment(p) && !paymentHasInvoice && (
                <button
                  className="p-1.5 rounded hover:bg-emerald-100 text-emerald-600 transition-colors disabled:opacity-50"
                  title="สร้าง Invoice Paid ย้อนหลัง"
                  disabled={!!backfillPaymentId}
                  onClick={() => openHistoricalInvoiceModal(p)}
                >
                  {isBackfilling ? <span className="inline-block w-3 h-3 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" /> : <FileText size={13} />}
                </button>
              )}
              {canUseFunction?.("payment-subcontract", "delete") !== false && (
                <button
                  className="p-1.5 rounded hover:bg-red-100 text-red-500 transition-colors"
                  title="ลบ"
                  onClick={() => handleDelete(p)}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </td>
        )}
        {isColumnVisible("payment-table", "paymentNo") && (
          <td className="py-2 px-3 font-semibold text-orange-700">{p.paymentNo || "-"}</td>
        )}
        {isColumnVisible("payment-table", "type") && (
          <td className="py-2 px-3 text-center">
            {p.paymentType && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-200">
                {p.paymentType}
              </span>
            )}
          </td>
        )}
        {isColumnVisible("payment-table", "contractor") && (
          <td className="py-2 px-3 truncate max-w-[200px]" title={contractor?.name || "-"}>
            {contractor?.name || "-"}
          </td>
        )}
        {isColumnVisible("payment-table", "billingCycle") && (
          <td className="py-2 px-3 text-slate-500 text-[11px]">{p.billingCycle || "-"}</td>
        )}
        {isColumnVisible("payment-table", "openDate") && (
          <td className="py-2 px-3 text-slate-500 text-[11px]">{p.openDate || "-"}</td>
        )}
        {isColumnVisible("payment-table", "amount") && (
          <td className="py-2 px-3 text-right font-semibold">{formatCurrency(p.amount || 0)}</td>
        )}
        {isColumnVisible("payment-table", "status") && (
          <td className="py-2 px-3 text-center">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold ${statusCls}`}>
              {displayStatus}
            </span>
          </td>
        )}
        {isColumnVisible("payment-table", "actions") && (
          <td
            className="hidden py-2 px-3 text-right md:flex md:justify-end md:gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="p-1.5 rounded hover:bg-orange-100 text-orange-600 transition-colors"
              title="ดูรายละเอียด"
              onClick={() => setViewingPayment(p)}
            >
              <Eye size={13} />
            </button>
            {canBackfillPaymentInvoice && isPaidPayment(p) && !paymentHasInvoice && (
              <button
                className="p-1.5 rounded hover:bg-emerald-100 text-emerald-600 transition-colors disabled:opacity-50"
                title="สร้าง Invoice Paid ย้อนหลัง"
                disabled={!!backfillPaymentId}
                onClick={() => openHistoricalInvoiceModal(p)}
              >
                {isBackfilling ? <span className="inline-block w-3 h-3 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" /> : <FileText size={13} />}
              </button>
            )}
            {canUseFunction?.("payment-subcontract", "delete") !== false && (
              <button
                className="p-1.5 rounded hover:bg-red-100 text-red-500 transition-colors"
                title="ลบ"
                onClick={() => handleDelete(p)}
              >
                <Trash2 size={13} />
              </button>
            )}
          </td>
        )}
      </tr>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm bg-orange-600">
            <FileSpreadsheet size={18} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-800">Payment Subcontractor</h2>
              <ColumnVisibilityToggle tableId="payment-table" />
            </div>
            <p className="text-xs text-slate-500">
              {paymentGroups.length} ตาราง PO / {filtered.length} รายการ{filterStatus !== "all" ? ` (${filterStatus})` : " ทั้งหมด"}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="ค้นหา Payment No., ผู้รับเหมา..."
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white w-52 focus:border-orange-300 focus:ring-1 focus:ring-orange-100"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:border-orange-300 cursor-pointer"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">ทุก Type</option>
            <option value="DL">DL — จ้างเหมา</option>
            <option value="DC">DC — ค่าแรง</option>
          </select>

          <select
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:border-orange-300 cursor-pointer"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">ทุก Status</option>
            {allStatuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:border-orange-300 cursor-pointer"
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
          >
            <option value="all">ทุกโครงการ</option>
            {visibleProjects.map((proj: any) => (
              <option key={proj.id} value={proj.id}>{proj.name || proj.id}</option>
            ))}
          </select>

        </div>
      </div>

      {paymentGroups.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">
          <span className="text-slate-500">
            แสดงตารางที่ {(paymentPage - 1) * PAYMENT_TABLES_PER_PAGE + 1}–{Math.min(paymentPage * PAYMENT_TABLES_PER_PAGE, paymentGroups.length)} จาก {paymentGroups.length} ตาราง
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={paymentPage <= 1}
              onClick={() => setPaymentPage((currentPage) => Math.max(1, currentPage - 1))}
            >
              <ChevronLeft size={14} /> ก่อนหน้า
            </button>
            <span className="min-w-[72px] text-center font-semibold text-slate-700">
              หน้า {paymentPage} / {totalPaymentPages}
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={paymentPage >= totalPaymentPages}
              onClick={() => setPaymentPage((currentPage) => Math.min(totalPaymentPages, currentPage + 1))}
            >
              ถัดไป <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Grouped Payment Tables */}
      {filtered.length === 0 ? (
        <Card className="overflow-hidden">
          <div className="py-12 text-center text-slate-400 text-sm">
            ไม่พบรายการ Payment ที่ตรงกับเงื่อนไข
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {visiblePaymentGroups.map((group: any) => {
            const groupAmount = group.payments.reduce((sum: number, payment: any) => sum + (Number(payment.amount) || 0), 0);
            const poPlan = group.po ? buildPoBudgetReturnPlan({ po: group.po, payments, prs }) : null;
            const poAmountNoVat = poPlan ? Number(poPlan.poNetAmount) || 0 : null;
            const discountAmount = poPlan ? Number(poPlan.discountAmount) || 0 : 0;
            const balanceAmount = poPlan ? Number(poPlan.balanceBeforeRev) || 0 : null;
            const processStatus = String(group.po?.budgetReturnProcessStatus || "");
            const completedPayment = [...group.payments].reverse().find((payment: any) => (
              payment?.jobCompleted || payment?.status === "จบงาน"
            ));
            const isCompletedGroup = !!completedPayment;
            const completedBy = completedPayment?.jobCompletedBy || completedPayment?.completedBy || "-";
            const hasReturnBudgetPermission = canStartPoBudgetReturn
              && !!group.po
              && String(group.po?.poType || "").toUpperCase() === "SP";
            const processInProgress = ["Queued", "Running", "Waiting Budget Approval"].includes(processStatus);
            const canReturnBudget = Boolean(hasReturnBudgetPermission
              && !processInProgress
              && isCompletedGroup
              && balanceAmount !== null
              && balanceAmount > 0
              && poPlan
              && !poPlan.paymentComplete
              && poPlan.returnableAmount > 0);
            const returnBudgetDisabledReason = !group.po
              ? "ไม่พบข้อมูล PO ที่เชื่อมกับ Payment"
              : !poPlan
                ? "ยังคำนวณ Balance PO ไม่ได้"
                : processInProgress
                  ? "มี Process คืน Budget กำลังดำเนินการอยู่"
                  : !isCompletedGroup
                    ? "ตาราง Payment ยังไม่จบงาน"
                    : balanceAmount === null || balanceAmount <= 0 || poPlan.paymentComplete || poPlan.returnableAmount <= 0
                      ? "ไม่มี Balance ที่คืนได้"
                      : "ยังไม่พร้อมคืน Budget";
            return (
              <Card
                key={group.key}
                className={`overflow-hidden ${isCompletedGroup ? "border-emerald-300 bg-emerald-50/30" : "border-slate-200"}`}
              >
                <div className={`flex flex-col gap-1 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                  isCompletedGroup ? "border-emerald-200 bg-emerald-100" : "border-orange-200 bg-orange-50"
                }`}>
                  <div className="min-w-0">
                    <div className={`truncate text-sm font-bold ${isCompletedGroup ? "text-emerald-800" : "text-orange-800"}`} title={group.poNo || "-"}>
                      PO: {group.poNo || "-"}
                    </div>
                    <div className="truncate text-xs font-semibold text-slate-700" title={group.contractTitle || "-"}>
                      CONTRACT TITLE: {group.contractTitle || "-"}
                    </div>
                    {isCompletedGroup && (
                      <div className="truncate text-xs font-bold text-emerald-700" title={`จบงานโดย ${completedBy}`}>
                        จบงานโดย: {completedBy}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <span className="shrink-0 rounded-lg border border-sky-200 bg-white px-4 py-2 text-sm font-extrabold leading-tight text-sky-700 shadow-sm sm:text-base">
                      ยอด PO No VAT: {poAmountNoVat === null ? "-" : formatCurrency(poAmountNoVat)}
                    </span>
                    {discountAmount > 0 && (
                      <span className="shrink-0 rounded-lg border border-violet-200 bg-white px-2.5 py-1 text-[10px] font-bold text-violet-700">
                        ส่วนลด: {formatCurrency(discountAmount)}
                      </span>
                    )}
                    <span className={`shrink-0 rounded-lg border bg-white px-4 py-2 text-sm font-extrabold leading-tight shadow-sm sm:text-base ${
                      balanceAmount !== null && balanceAmount > 0 ? "border-emerald-200 text-emerald-700" : "border-slate-200 text-slate-600"
                    }`}>
                      Balance PO: {balanceAmount === null ? "-" : formatCurrency(balanceAmount)}
                    </span>
                    <span className={`shrink-0 rounded-full border bg-white px-2.5 py-1 text-[10px] font-bold ${
                      isCompletedGroup ? "border-emerald-200 text-emerald-700" : "border-orange-200 text-orange-700"
                    }`}>
                      {group.payments.length} งวด
                    </span>
                    {hasReturnBudgetPermission && !processInProgress && (
                      <button
                        type="button"
                        disabled={!canReturnBudget}
                        className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold shadow-sm disabled:cursor-not-allowed ${
                          canReturnBudget
                            ? "border-emerald-300 bg-emerald-600 text-white hover:bg-emerald-700"
                            : "border-slate-300 bg-slate-100 text-slate-500 opacity-80"
                        }`}
                        title={canReturnBudget
                          ? `คืน Balance PO เข้า Budget (${formatCurrency(poPlan.returnableAmount)})`
                          : returnBudgetDisabledReason}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (canReturnBudget) handleStartPoBudgetReturn(group.po, isCompletedGroup);
                        }}
                      >
                        <Wallet size={13} />
                        {canReturnBudget && poPlan
                          ? `คืน Budget (${formatCurrency(poPlan.returnableAmount)})`
                          : "คืน Budget"}
                      </button>
                    )}
                    {canStartPoBudgetReturn && processInProgress && (
                      <span className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10px] font-bold text-amber-800">
                        คืน Budget: {processStatus === "Waiting Budget Approval" ? "รอรับยอด" : processStatus === "Queued" ? "รอเริ่มทำงาน" : "กำลังดำเนินการ"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className={`w-full min-w-[800px] text-left text-xs text-slate-600 ${isCompletedGroup ? "bg-emerald-50/30" : ""}`}>
                    <thead className="bg-slate-50 text-slate-900 uppercase font-semibold border-b border-slate-200">
                      <tr>
                        {isColumnVisible("payment-table", "actions") && <th className="py-2.5 px-3 text-left w-24 md:hidden">Action</th>}
                        {isColumnVisible("payment-table", "paymentNo") && <th className="py-2.5 px-3 w-40">Payment No.</th>}
                        {isColumnVisible("payment-table", "type") && <th className="py-2.5 px-3 text-center w-20">Type</th>}
                        {isColumnVisible("payment-table", "contractor") && <th className="py-2.5 px-3">ผู้รับเหมา</th>}
                        {isColumnVisible("payment-table", "billingCycle") && <th className="py-2.5 px-3 w-36">รอบวางบิล</th>}
                        {isColumnVisible("payment-table", "openDate") && <th className="py-2.5 px-3 w-28">วันที่เปิด</th>}
                        {isColumnVisible("payment-table", "amount") && <th className="py-2.5 px-3 text-right w-32">ยอดรวม</th>}
                        {isColumnVisible("payment-table", "status") && <th className="py-2.5 px-3 text-center w-28">Status</th>}
                        {isColumnVisible("payment-table", "actions") && <th className="hidden py-2.5 px-3 text-right w-24 md:table-cell">Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {group.payments.map((payment: any) => renderPaymentRow(payment, isCompletedGroup))}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t border-slate-200">
                      <tr>
                        <td colSpan={["paymentNo", "type", "contractor", "billingCycle", "openDate"].filter(k => isColumnVisible("payment-table", k)).length || 1} className="py-2 px-3 text-xs font-bold text-slate-600">
                          รวม {group.payments.length} งวด
                        </td>
                        {isColumnVisible("payment-table", "amount") && (
                          <td className="py-2 px-3 text-right text-xs font-bold text-orange-700">
                            {formatCurrency(groupAmount)}
                          </td>
                        )}
                        <td colSpan={["status", "actions"].filter(k => isColumnVisible("payment-table", k)).length || 1} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {invoicePaymentModal && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[10030] flex items-center justify-center bg-black/50 p-4" onClick={() => setInvoicePaymentModal(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-base font-bold text-slate-800">สร้าง Invoice ย้อนหลัง</h3>
                <p className="mt-1 text-xs text-slate-500">Payment: {invoicePaymentModal.paymentNo || invoicePaymentModal.id}</p>
              </div>
              <button type="button" className="text-slate-400 hover:text-slate-700 text-xl" onClick={() => setInvoicePaymentModal(null)}>×</button>
            </div>
            <div className="space-y-4 px-5 py-5">
              <label className="block text-sm font-semibold text-slate-700">
                ประเภทการชำระเงิน <span className="text-red-500">*</span>
                <select
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
                  value={historicalPaymentType}
                  onChange={(e) => {
                    setHistoricalPaymentType(e.target.value);
                    if (e.target.value !== "โอน") setHistoricalBankAccountNo("");
                  }}
                >
                  <option value="เครดิต">เครดิต</option>
                  <option value="โอน">โอน</option>
                  <option value="เช็ค">เช็ค</option>
                  <option value="เงินสด">เงินสด</option>
                </select>
              </label>
              {historicalPaymentType === "โอน" && (
                <label className="block text-sm font-semibold text-slate-700">
                  เลขบัญชีธนาคาร <span className="text-red-500">*</span>
                  <select
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
                    value={historicalBankAccountNo}
                    onChange={(e) => setHistoricalBankAccountNo(e.target.value)}
                  >
                    <option value="">เลือกบัญชีธนาคาร</option>
                    {BANK_ACCOUNT_OPTIONS.map((account) => (
                      <option key={account} value={account}>
                        {account}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 rounded-b-2xl">
              <button type="button" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-100" onClick={() => setInvoicePaymentModal(null)}>
                ยกเลิก
              </button>
              <button
                type="button"
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={historicalPaymentType === "โอน" && !historicalBankAccountNo.trim()}
                onClick={() => {
                  if (historicalPaymentType === "โอน" && !historicalBankAccountNo.trim()) {
                    showAlert?.("ข้อมูลไม่ครบ", "กรุณากรอกเลขบัญชีธนาคารก่อนสร้าง Invoice", "warning");
                    return;
                  }
                  const payment = invoicePaymentModal;
                  setInvoicePaymentModal(null);
                  handleCreateHistoricalInvoice(payment);
                }}
              >
                สร้าง Invoice Paid
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ─── View Detail Modal — Payment Application Style (View-only) ─── */}
      {viewingPayment && (() => {
        const contractor = vendors?.find((v: any) => v.id === viewingPayment.contractorId);
        const project = projects.find((proj: any) => proj.id === viewingPayment.projectId);
        const items: any[] = viewingPayment.items || [];

        // Grand total calculations
        const contractGT = items.reduce((s, it) => s + ((Number(it.contractQty) || 0) * (Number(it.contractPrice) || 0)), 0);
        const prevAmtGT = items.reduce((s, it) => s + (Number(it.prevAccumAmount) || 0), 0);
        const tpAmtGT = items.reduce((s, it) => s + (Number(it.thisPeriodAmount) || 0), 0);
        const totalAmtGT = prevAmtGT + tpAmtGT;
        const prevPctGT = contractGT > 0 ? (prevAmtGT / contractGT) * 100 : 0;
        const tpPctGT = contractGT > 0 ? (tpAmtGT / contractGT) * 100 : 0;
        const totalPctGT = contractGT > 0 ? (totalAmtGT / contractGT) * 100 : 0;

        // Pay/Slip
        const rawPaySlipUrl = viewingPayment.paySlipUrl;
        const displayPaySlipUrl = rawPaySlipUrl && typeof rawPaySlipUrl === "object" ? rawPaySlipUrl.url : rawPaySlipUrl;
        const rawPaySlipName = viewingPayment.paySlipName;
        const displayPaySlipName = rawPaySlipName && typeof rawPaySlipName === "object" ? rawPaySlipName.name : rawPaySlipName;

        return ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[99999] p-4">
            <div className="bg-white shadow-2xl border border-slate-300 w-[90vw] max-w-[90vw] max-h-[92vh] flex flex-col rounded-2xl overflow-hidden">

              {/* ─ Title bar ─ */}
              <div className="flex items-center justify-between px-6 py-3 bg-gradient-to-r from-blue-900 to-blue-700 shrink-0 rounded-t-2xl">
                <h3 className="text-sm font-bold text-white tracking-wide">แบบฟอร์มเบิกงวดงาน / PAYMENT APPLICATION</h3>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-semibold ${statusColors[viewingPayment.jobCompleted ? "จบงาน" : viewingPayment.status] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                    {viewingPayment.jobCompleted ? "จบงาน" : (viewingPayment.status === "Rejected" ? "Reject" : (viewingPayment.status || "Draft"))}
                  </span>
                  <button
                    onClick={() => setViewingPayment(null)}
                    className="text-white/60 hover:text-white hover:bg-white/20 p-1.5 rounded-lg transition-all ml-1"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* ─ Scrollable body ─ */}
              <div className="flex-1 overflow-y-auto">
                <div className="p-5 space-y-4">

                  {/* ── Header info grid ── */}
                  <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs border border-slate-200 rounded-lg p-4 bg-slate-50/50">
                    {/* Left */}
                    <div className="space-y-1.5">
                      <div className="flex">
                        <span className="w-52 text-slate-500 font-semibold shrink-0">ชื่อโครงการ / PROJECT NAME :</span>
                        <span className="font-bold text-slate-800">{project?.name || viewingPayment.projectId || "-"}</span>
                      </div>
                      <div className="flex">
                        <span className="w-52 text-slate-500 font-semibold shrink-0">ผู้รับเหมาช่วง / SUBCONTRACTOR :</span>
                        <span className="font-bold text-slate-800">{contractor?.name || "-"}</span>
                      </div>
                      <div className="flex">
                        <span className="w-52 text-slate-500 font-semibold shrink-0">อ้างอิง PO / REF PO NO. :</span>
                        <span className="font-medium text-slate-700">{viewingPayment.paymentNo || "-"}</span>
                      </div>
                      <div className="flex">
                        <span className="w-52 text-slate-500 font-semibold shrink-0">ชื่อสัญญา / CONTRACT TITLE :</span>
                        <span className="font-medium text-slate-700">{viewingPayment.contractTitle || viewingPayment.paymentNo || "-"}</span>
                      </div>
                      {displayPaySlipUrl && (
                        <div className="flex items-center">
                          <span className="w-52 text-emerald-600 font-semibold shrink-0">เอกสารการจ่ายเงิน (Pay / Slip) :</span>
                          <a
                            href={displayPaySlipUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-700 bg-emerald-50 px-2 py-0.5 border border-emerald-200 rounded underline font-medium flex items-center gap-1 text-[11px] hover:bg-emerald-100 transition-colors"
                          >
                            <Paperclip size={11} /> {displayPaySlipName || "ดูเอกสารการจ่ายเงิน"}
                          </a>
                        </div>
                      )}
                    </div>
                    {/* Right */}
                    <div className="space-y-1.5">
                      <div className="flex">
                        <span className="w-56 text-slate-500 font-semibold shrink-0">เลขที่เบิกงวดงาน / PAYMENT NO. :</span>
                        <span className="font-bold text-blue-800">{viewingPayment.paymentNo || "-"}</span>
                      </div>
                      <div className="flex">
                        <span className="w-56 text-slate-500 font-semibold shrink-0">Payment Type :</span>
                        <span className="font-bold text-slate-800">{viewingPayment.paymentType || "-"}</span>
                      </div>
                      <div className="flex items-center">
                        <span className="w-56 text-slate-500 font-semibold shrink-0">งวดงาน / PERIOD NO. :</span>
                        <span className="font-bold px-2 py-0.5 rounded border text-orange-700 bg-orange-50 border-orange-200">
                          {viewingPayment.periodNo || 1} / {viewingPayment.periodNo || 1}
                        </span>
                      </div>
                      <div className="flex items-center">
                        <span className="w-56 text-slate-500 font-semibold shrink-0">รอบวางบิล :</span>
                        <span className="font-medium text-slate-700 bg-blue-50 border border-blue-200 rounded px-2 py-0.5">{viewingPayment.billingCycle || "-"}</span>
                      </div>
                      <div className="flex">
                        <span className="w-56 text-slate-500 font-semibold shrink-0">วันที่จัดทำเอกสาร / Date :</span>
                        <span className="font-medium text-slate-700">{viewingPayment.openDate || "-"}</span>
                      </div>
                      {viewingPayment.jobCompleted && (
                        <div className="flex">
                          <span className="w-56 text-teal-700 font-semibold shrink-0">สถานะงาน / JOB STATUS :</span>
                          <span className="font-semibold text-teal-800">
                            จบงาน — โดย {viewingPayment.jobCompletedBy || viewingPayment.completedBy || "-"}
                            {(viewingPayment.jobCompletedAt || viewingPayment.completedAt) ? ` (${new Date(viewingPayment.jobCompletedAt || viewingPayment.completedAt).toLocaleString("th-TH")})` : ""}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Attachment */}
                  {viewingPayment.attachmentUrl && (
                    <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-4 py-2 text-xs text-orange-800">
                      <Paperclip size={13} />
                      <a href={viewingPayment.attachmentUrl} target="_blank" rel="noopener noreferrer" className="underline font-medium">
                        {viewingPayment.attachmentName || "ดูเอกสารแนบ"}
                      </a>
                    </div>
                  )}

                  {/* Pay/Slip banner */}
                  {displayPaySlipUrl && (
                    <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2 text-xs text-emerald-800">
                      <Paperclip size={13} className="text-emerald-600 shrink-0" />
                      <span className="font-semibold text-emerald-700 shrink-0">เอกสารการจ่ายเงิน (Pay / Slip) :</span>
                      <a
                        href={displayPaySlipUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline font-medium text-emerald-700 hover:text-emerald-900 transition-colors"
                      >
                        {displayPaySlipName || "ดูเอกสารการจ่ายเงิน"}
                      </a>
                    </div>
                  )}

                  {/* paymentAttachments (Upload File) */}
                  {Array.isArray(viewingPayment.paymentAttachments) && viewingPayment.paymentAttachments.length > 0 && (
                    <div className="flex flex-col gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-xs">
                      <span className="font-semibold text-blue-700 flex items-center gap-1.5">
                        <Paperclip size={12} /> ไฟล์แนบ ({viewingPayment.paymentAttachments.length})
                      </span>
                      {viewingPayment.paymentAttachments.map((att: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-2 ml-1">
                          <Paperclip size={10} className="text-blue-400 shrink-0" />
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-700 underline hover:text-blue-900 truncate max-w-[300px]"
                          >
                            {att.name || `ไฟล์แนบ ${idx + 1}`}
                          </a>
                          <span className="text-[10px] text-slate-400 shrink-0">โดย {att.uploadedBy || "-"}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ── Items table — full Payment Application layout ── */}
                  <div className="border border-slate-300 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px] border-collapse min-w-max table-fixed">
                        <colgroup>
                          <col style={{ width: 40 }} />
                          <col style={{ width: 180 }} />
                          <col style={{ width: 56 }} />
                          <col style={{ width: 52 }} />
                          <col style={{ width: 80 }} />
                          <col style={{ width: 96 }} />
                          <col style={{ width: 52 }} />
                          <col style={{ width: 96 }} />
                          <col style={{ width: 48 }} />
                          <col style={{ width: 52 }} />
                          <col style={{ width: 96 }} />
                          <col style={{ width: 48 }} />
                          <col style={{ width: 52 }} />
                          <col style={{ width: 96 }} />
                          <col style={{ width: 48 }} />
                          <col style={{ width: 100 }} />
                        </colgroup>
                        <thead>
                          <tr className="bg-slate-100 border-b-2 border-slate-300">
                            <th rowSpan={2} className="border border-slate-300 px-2 py-2 text-center font-bold text-slate-700 bg-slate-100">
                              ITEM<br /><span className="font-normal text-[9px] text-slate-500">ลำดับ</span>
                            </th>
                            <th rowSpan={2} className="border border-slate-300 px-2 py-2 text-left font-bold text-slate-700 bg-slate-100">
                              DESCRIPTION<br /><span className="font-normal text-[9px] text-slate-500">รายละเอียด</span>
                            </th>
                            <th rowSpan={2} className="border border-slate-300 px-2 py-2 text-center font-bold text-slate-700 bg-slate-100">
                              หน่วย<br /><span className="font-normal text-[9px] text-slate-500">Unit</span>
                            </th>
                            <th colSpan={3} className="border border-slate-300 px-2 py-1.5 text-center font-bold text-purple-800 bg-purple-50">
                              ราคาตามสัญญา/ใบสั่งซื้อ<br /><span className="font-normal text-[9px]">CONTRACT / PO PRICE</span>
                            </th>
                            <th colSpan={3} className="border border-slate-300 px-2 py-1.5 text-center font-bold text-blue-800 bg-blue-50">
                              ผลงานสะสมรวมงวดนี้<br /><span className="font-normal text-[9px]">TOTAL ACCUMULATED</span>
                            </th>
                            <th colSpan={3} className="border border-slate-300 px-2 py-1.5 text-center font-bold text-amber-800 bg-amber-50">
                              ผลงานสะสมก่อนหน้านี้<br /><span className="font-normal text-[9px]">PREVIOUS ACCUMULATED</span>
                            </th>
                            <th colSpan={3} className="border border-slate-300 px-2 py-1.5 text-center font-bold text-green-800 bg-green-50">
                              ผลงานงวดนี้<br /><span className="font-normal text-[9px]">THIS PERIOD</span>
                            </th>
                            <th rowSpan={2} className="border border-slate-300 px-2 py-2 text-center font-bold text-slate-700 bg-slate-100">
                              หมายเหตุ<br /><span className="font-normal text-[9px] text-slate-500">REMARK</span>
                            </th>
                          </tr>
                          <tr className="bg-slate-50 border-b border-slate-300 text-[9px] font-bold text-slate-600">
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-purple-50/50 text-purple-700">ปริมาณ<br />QUANTITY</th>
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-purple-50/50 text-purple-700">ราคา/หน่วย<br />PRICE</th>
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-purple-50/50 text-purple-700">จำนวนเงิน<br />AMOUNT</th>
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-blue-50/50 text-blue-700">ปริมาณ<br />TOTAL QTY</th>
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-blue-50/50 text-blue-700">จำนวนเงิน<br />AMOUNT</th>
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-blue-50/50 text-blue-700">%<br />PROGRESS</th>
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-amber-50/50 text-amber-700">ปริมาณ<br />PREV SUM</th>
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-amber-50/50 text-amber-700">จำนวนเงิน<br />PREV AMT</th>
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-amber-50/50 text-amber-700">%<br />PREV</th>
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-green-50/50 text-green-700">ปริมาณ<br />QUANTITY</th>
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-green-50/50 text-green-700">จำนวนเงิน<br />AMOUNT</th>
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-green-50/50 text-green-700">%<br />CURR</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.length === 0 ? (
                            <tr>
                              <td colSpan={16} className="py-8 text-center text-slate-400 text-xs border border-slate-200">ยังไม่มีรายการ</td>
                            </tr>
                          ) : (
                            items.map((it: any, i: number) => {
                              const cQty = Number(it.contractQty) || 0;
                              const cPrice = Number(it.contractPrice) || 0;
                              const cAmount = cQty * cPrice;
                              const prevQty = Number(it.prevAccumQty) || 0;
                              const prevAmt = Number(it.prevAccumAmount) || 0;
                              const prevPct = cAmount > 0 ? (prevAmt / cAmount) * 100 : 0;
                              const tpQty = Number(it.thisPeriodQty) || 0;
                              const tpAmt = Number(it.thisPeriodAmount) || 0;
                              const tpPct = cAmount > 0 ? (tpAmt / cAmount) * 100 : 0;
                              const totQty = prevQty + tpQty;
                              const totAmt = prevAmt + tpAmt;
                              const totPct = cAmount > 0 ? (totAmt / cAmount) * 100 : 0;
                              return (
                                <tr key={i} className="border-b border-slate-200 hover:bg-slate-50/50">
                                  <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500 font-medium">{i + 1}</td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-slate-800 font-medium overflow-hidden max-w-0">
                                    <div className="line-clamp-2 break-words leading-tight" title={it.description || "-"}>
                                      {it.description || "-"}
                                    </div>
                                  </td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{it.unit || "-"}</td>
                                  {/* CONTRACT */}
                                  <td className="border border-slate-200 px-2 py-1.5 text-center text-purple-800">{cQty > 0 ? cQty.toLocaleString() : "-"}</td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-right text-purple-800">{cPrice > 0 ? formatCurrency(cPrice) : "-"}</td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-right font-bold text-purple-900">{cAmount > 0 ? formatCurrency(cAmount) : "-"}</td>
                                  {/* TOTAL ACCUMULATED */}
                                  <td className="border border-slate-200 px-2 py-1.5 text-center text-blue-700">{totQty > 0 ? totQty.toLocaleString() : "-"}</td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-right text-blue-700">{totAmt > 0 ? formatCurrency(totAmt) : "-"}</td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-center text-blue-700">{totPct > 0 ? `${totPct.toFixed(2)}%` : "-"}</td>
                                  {/* PREVIOUS ACCUMULATED */}
                                  <td className="border border-slate-200 px-2 py-1.5 text-center text-amber-700">{prevQty > 0 ? prevQty.toLocaleString() : "-"}</td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-right text-amber-700">{prevAmt > 0 ? formatCurrency(prevAmt) : "-"}</td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-center text-amber-700">{prevPct > 0 ? `${prevPct.toFixed(2)}%` : "-"}</td>
                                  {/* THIS PERIOD */}
                                  <td className="border border-slate-200 px-2 py-1.5 text-center text-green-700">{tpQty > 0 ? tpQty.toLocaleString() : "-"}</td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-right font-bold text-green-700">{tpAmt > 0 ? formatCurrency(tpAmt) : "-"}</td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-center text-green-700">{tpPct > 0 ? `${tpPct.toFixed(2)}%` : "-"}</td>
                                  {/* REMARK */}
                                  <td className="border border-slate-200 px-2 py-1.5 text-slate-500 text-[10px]">{it.remark || "-"}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                        {items.length > 0 && (
                          <tfoot>
                            <tr className="bg-slate-800 text-white font-bold text-[11px]">
                              <td colSpan={3} className="border border-slate-600 px-3 py-2 text-center">ผลรวมทั้งสิ้น / GRAND TOTAL</td>
                              <td colSpan={2} className="border border-slate-600 px-2 py-2 text-right text-purple-300">{formatCurrency(contractGT)}</td>
                              <td className="border border-slate-600 px-2 py-2 text-center text-purple-300">-</td>
                              <td className="border border-slate-600 px-2 py-2 text-center text-blue-300">-</td>
                              <td className="border border-slate-600 px-2 py-2 text-right text-blue-300">{formatCurrency(totalAmtGT)}</td>
                              <td className="border border-slate-600 px-2 py-2 text-center text-blue-300">{totalPctGT.toFixed(2)}%</td>
                              <td className="border border-slate-600 px-2 py-2 text-center text-amber-300">-</td>
                              <td className="border border-slate-600 px-2 py-2 text-right text-amber-300">{formatCurrency(prevAmtGT)}</td>
                              <td className="border border-slate-600 px-2 py-2 text-center text-amber-300">{prevPctGT.toFixed(2)}%</td>
                              <td className="border border-slate-600 px-2 py-2 text-center text-green-300">-</td>
                              <td className="border border-slate-600 px-2 py-2 text-right text-green-300">{formatCurrency(tpAmtGT)}</td>
                              <td className="border border-slate-600 px-2 py-2 text-center text-green-300">{tpPctGT.toFixed(2)}%</td>
                              <td className="border border-slate-600 px-2 py-2" />
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>

                  {/* ── Signature section ── */}
                  <div className="grid grid-cols-3 gap-4 text-xs mt-2 px-2">
                    {[
                      {
                        slot: "Signature1",
                        title: "PREPARE BY",
                        position: "ผู้จัดทำ",
                        date: viewingPayment.periodPreparedAt,
                        filled: !!(viewingPayment.periodPreparedBy || viewingPayment.periodPreparedByUid || viewingPayment.periodPreparedByEmail || viewingPayment.signature1UserSignatureUrl),
                      },
                      {
                        slot: "Signature2",
                        title: "CHECK BY",
                        position: "Construction Manager",
                        date: viewingPayment.periodCheckedAt,
                        filled: !!(viewingPayment.periodCheckedBy || viewingPayment.periodCheckedByUid || viewingPayment.periodCheckedByEmail || viewingPayment.signature2UserSignatureUrl),
                      },
                      {
                        slot: "Signature3",
                        title: "APPROVE BY",
                        position: "Project Manager",
                        date: viewingPayment.periodApprovedAt,
                        filled: !!(viewingPayment.periodApprovedBy || viewingPayment.periodApprovedByUid || viewingPayment.periodApprovedByEmail || viewingPayment.signature3UserSignatureUrl),
                      },
                    ].map((sig) => {
                      const hasResolvedSignature = Object.prototype.hasOwnProperty.call(paymentSignatureImages, sig.slot);
                      const signatureImageUrl = paymentSignatureImages[sig.slot];
                      return (
                        <div key={sig.title} className={`border rounded-lg p-3 text-center space-y-3 ${sig.filled ? "border-green-300 bg-green-50/40" : "border-slate-200 bg-slate-50/50"}`}>
                          <p className="font-bold text-slate-700 text-[11px]">{sig.title}</p>
                          <div className={`h-12 flex items-center justify-center px-2 py-1 ${sig.filled ? "border-b-2 border-green-500" : ""}`}>
                            {sig.filled ? (
                              signatureImageUrl ? (
                                <img
                                  src={signatureImageUrl}
                                  alt={`ลายเซ็น ${sig.title}`}
                                  className="max-h-full max-w-full object-contain"
                                />
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">
                                  {hasResolvedSignature ? "— ไม่มีรูปลายเซ็น —" : "กำลังโหลดลายเซ็น..."}
                                </span>
                              )
                            ) : (
                              <span className="text-[10px] text-slate-300 italic">— ยังไม่ได้ลงนาม —</span>
                            )}
                          </div>
                          <div className="border-t border-slate-300 pt-2 space-y-1">
                            <p className="text-[10px] text-slate-500">POSITION : <span className="font-semibold text-slate-700">{sig.position}</span></p>
                            <p className="text-[10px] text-slate-500">
                              DATE : {sig.date ? new Date(sig.date).toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" }) : "_______________"}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Note */}
                  {viewingPayment.note && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800">
                      <span className="font-bold">หมายเหตุ:</span> {viewingPayment.note}
                    </div>
                  )}

                </div>
              </div>

              {/* ─ Footer ─ */}
              <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end shrink-0 rounded-b-2xl">
                <button
                  onClick={() => setViewingPayment(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50"
                >
                  ปิด
                </button>
              </div>

            </div>
          </div>
          , document.body);
      })()}

    </div>
  );
});

export default PaymentTableView;
