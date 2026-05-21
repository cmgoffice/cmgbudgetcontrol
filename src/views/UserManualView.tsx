// @ts-nocheck
import React, { useState } from "react";
import {
  FileText, ShoppingCart, CreditCard, PackageCheck, FileInput,
  ChevronDown, ChevronRight, CheckCircle, XCircle, ArrowRight,
  User, Users, Shield, Info, BookOpen, AlertCircle
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Step {
  actor: string;
  actorColor: string;
  action: string;
  result: string;
  note?: string;
}

interface WorkflowSection {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
  steps: Step[];
  roles: { role: string; duty: string; color: string }[];
  notes?: string[];
}

// ─── Role Badge ───────────────────────────────────────────────────────────────
const RoleBadge = ({ role, color }: { role: string; color: string }) => (
  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${color}`}>
    <User size={10} />
    {role}
  </span>
);

// ─── Status Badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ label, type }: { label: string; type: "pending" | "approved" | "rejected" | "info" | "done" }) => {
  const colors = {
    pending: "bg-yellow-50 text-yellow-800 border-yellow-300",
    approved: "bg-green-50 text-green-800 border-green-300",
    rejected: "bg-red-50 text-red-800 border-red-300",
    info: "bg-blue-50 text-blue-800 border-blue-300",
    done: "bg-emerald-50 text-emerald-800 border-emerald-300",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${colors[type]}`}>
      {label}
    </span>
  );
};

// ─── Workflow Step Row ────────────────────────────────────────────────────────
const StepRow = ({ step, index, total }: { step: Step; index: number; total: number }) => (
  <div className="flex gap-3">
    {/* Timeline */}
    <div className="flex flex-col items-center">
      <div className="w-8 h-8 rounded-full bg-slate-700 border-2 border-slate-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
        {index + 1}
      </div>
      {index < total - 1 && <div className="w-0.5 h-full bg-slate-600 mt-1 min-h-[24px]" />}
    </div>
    {/* Content */}
    <div className="pb-5 flex-1 min-w-0">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <RoleBadge role={step.actor} color={step.actorColor} />
        <span className="text-slate-300 text-xs">→</span>
        <span className="text-white text-sm font-medium">{step.action}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-slate-400 text-xs">ผลลัพธ์:</span>
        <StatusBadge
          label={step.result}
          type={
            step.result.toLowerCase().includes("approved") || step.result.includes("อนุมัติ") ? "approved"
            : step.result.toLowerCase().includes("reject") || step.result.includes("ปฏิเสธ") ? "rejected"
            : step.result.includes("✅") ? "done"
            : "info"
          }
        />
        {step.note && (
          <span className="text-slate-400 text-[11px] italic">({step.note})</span>
        )}
      </div>
    </div>
  </div>
);

// ─── Section Card ─────────────────────────────────────────────────────────────
const SectionCard = ({ section }: { section: WorkflowSection }) => {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<"flow" | "roles">("flow");

  return (
    <div className={`rounded-2xl border-2 ${section.borderColor} overflow-hidden shadow-lg`}>
      {/* Header */}
      <button
        className={`w-full flex items-center justify-between px-5 py-4 ${section.bgColor} hover:brightness-110 transition-all`}
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            {section.icon}
          </div>
          <div className="text-left">
            <div className="text-white font-bold text-base">{section.title}</div>
            <div className="text-white/70 text-xs">{section.subtitle}</div>
          </div>
        </div>
        {open ? <ChevronDown size={18} className="text-white/80" /> : <ChevronRight size={18} className="text-white/80" />}
      </button>

      {open && (
        <div className="bg-slate-800 p-5">
          {/* Tabs */}
          <div className="flex gap-1 mb-5 bg-slate-700/50 rounded-lg p-1 w-fit">
            {(["flow", "roles"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  tab === t ? "bg-slate-600 text-white shadow" : "text-slate-400 hover:text-white"
                }`}
              >
                {t === "flow" ? "🔄 ขั้นตอน Workflow" : "👥 Roles & หน้าที่"}
              </button>
            ))}
          </div>

          {tab === "flow" && (
            <div className="space-y-0">
              {section.steps.map((step, i) => (
                <StepRow key={i} step={step} index={i} total={section.steps.length} />
              ))}
              {section.notes && section.notes.length > 0 && (
                <div className="mt-4 p-3 bg-slate-700/50 rounded-xl border border-slate-600">
                  <div className="flex items-center gap-2 mb-2">
                    <Info size={14} className="text-yellow-400" />
                    <span className="text-yellow-300 text-xs font-semibold">หมายเหตุ</span>
                  </div>
                  <ul className="space-y-1">
                    {section.notes.map((n, i) => (
                      <li key={i} className="text-slate-300 text-xs flex items-start gap-1.5">
                        <span className="text-yellow-400 mt-0.5">•</span>{n}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {tab === "roles" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {section.roles.map((r, i) => (
                <div key={i} className="flex gap-3 bg-slate-700/50 rounded-xl p-3 border border-slate-600">
                  <div className="mt-0.5">
                    <RoleBadge role={r.role} color={r.color} />
                  </div>
                  <p className="text-slate-300 text-xs leading-relaxed">{r.duty}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Data ─────────────────────────────────────────────────────────────────────
const WORKFLOWS: WorkflowSection[] = [
  {
    id: "pr",
    title: "PR — Purchase Request (ใบขอซื้อ)",
    subtitle: "กระบวนการขออนุมัติจัดซื้อ/จัดจ้าง",
    icon: <FileText size={20} className="text-white" />,
    color: "text-sky-400",
    bgColor: "bg-gradient-to-r from-sky-700 to-sky-600",
    borderColor: "border-sky-600",
    steps: [
      {
        actor: "Staff / Procurement / PM / PCM",
        actorColor: "bg-slate-700 text-slate-200 border-slate-500",
        action: "สร้าง PR และกรอกรายละเอียด (Cost Code, รายการ, ราคา, ผู้ขอซื้อ)",
        result: "Draft → บันทึกในระบบ",
      },
      {
        actor: "CM / PM / Administrator",
        actorColor: "bg-yellow-900 text-yellow-200 border-yellow-600",
        action: "ตรวจสอบและอนุมัติ PR ขั้นที่ 1",
        result: "Pending CM → Pending PM",
        note: "CM หรือ PM สามารถอนุมัติขั้นนี้ได้",
      },
      {
        actor: "PM / Administrator",
        actorColor: "bg-amber-900 text-amber-200 border-amber-600",
        action: "ตรวจสอบและอนุมัติ PR ขั้นที่ 2",
        result: "Pending PM → Approved ✅",
        note: "PR ทั่วไปจบที่นี่ — Contract PR ไปต่อขั้น MD",
      },
      {
        actor: "MD / Administrator",
        actorColor: "bg-red-900 text-red-200 border-red-600",
        action: "[เฉพาะ Contract PR] อนุมัติขั้นสุดท้าย",
        result: "Pending MD → Approved ✅",
        note: "เฉพาะ PR ประเภท 'จ้างเหมา > DL' เท่านั้น",
      },
    ],
    roles: [
      { role: "Staff", duty: "สร้าง PR, กรอกรายละเอียดรายการจัดซื้อ", color: "bg-slate-700 text-slate-200 border-slate-500" },
      { role: "Procurement", duty: "สร้าง PR, แก้ไข PR ที่ถูก Reject หรือ Edit Budget", color: "bg-slate-700 text-slate-200 border-slate-500" },
      { role: "CM", duty: "อนุมัติ/ปฏิเสธ PR ขั้น Pending CM", color: "bg-yellow-900 text-yellow-200 border-yellow-600" },
      { role: "PM", duty: "อนุมัติ/ปฏิเสธ PR ขั้น Pending CM และ Pending PM", color: "bg-amber-900 text-amber-200 border-amber-600" },
      { role: "PCM", duty: "ส่งคืน PR เพื่อแก้ไข Budget (Edit Budget), อนุมัติ Active PR คืน", color: "bg-indigo-900 text-indigo-200 border-indigo-600" },
      { role: "MD", duty: "อนุมัติ Contract PR ขั้นสุดท้าย (Pending MD)", color: "bg-red-900 text-red-200 border-red-600" },
      { role: "Administrator", duty: "ทำได้ทุกขั้นตอน — อนุมัติ/ปฏิเสธแทนทุก Role", color: "bg-purple-900 text-purple-200 border-purple-600" },
    ],
    notes: [
      "PR ที่ถูก Reject สามารถแก้ไขและส่งใหม่ได้โดย Staff / Procurement",
      "PR ที่ Closed แล้ว สามารถขอ 'Active PR' คืนได้ โดย Procurement ส่งคำขอ → PCM อนุมัติ",
      "PR ที่ Approved แล้ว จะถูกนำไปใช้สร้าง PO ต่อได้",
    ],
  },
  {
    id: "po",
    title: "PO — Purchase Order (ใบสั่งซื้อ)",
    subtitle: "กระบวนการออกใบสั่งซื้อและอนุมัติ",
    icon: <ShoppingCart size={20} className="text-white" />,
    color: "text-rose-400",
    bgColor: "bg-gradient-to-r from-rose-700 to-rose-600",
    borderColor: "border-rose-600",
    steps: [
      {
        actor: "Procurement / PCM / Administrator",
        actorColor: "bg-slate-700 text-slate-200 border-slate-500",
        action: "สร้าง PO โดยอ้างอิง PR ที่ Approved แล้ว (เลือก Items จาก PR)",
        result: "Draft PO",
      },
      {
        actor: "PCM / Administrator",
        actorColor: "bg-indigo-900 text-indigo-200 border-indigo-600",
        action: "ตรวจสอบและอนุมัติ PO ขั้นที่ 1",
        result: "Pending PCM → Pending GM",
      },
      {
        actor: "GM / Administrator",
        actorColor: "bg-green-900 text-green-200 border-green-600",
        action: "ตรวจสอบและอนุมัติ PO ขั้นสุดท้าย",
        result: "Pending GM → Approved ✅ / Received / Wait Pay",
        note: "ขึ้นอยู่กับ Receive Type ที่ตั้งไว้",
      },
      {
        actor: "PM / PCM / Staff",
        actorColor: "bg-teal-900 text-teal-200 border-teal-600",
        action: "รับของเข้าระบบ (Receive)",
        result: "Approved → Received ✅",
        note: "เฉพาะ PO ปกติ (ไม่ใช่ Receive Auto)",
      },
      {
        actor: "ระบบ Auto / Procurement",
        actorColor: "bg-slate-700 text-slate-200 border-slate-500",
        action: "ปิด PO เมื่อ Invoice ครบทุกรายการ",
        result: "Closed PO",
      },
    ],
    roles: [
      { role: "Procurement", duty: "สร้าง PO, เลือก Items จาก PR ที่ Approved", color: "bg-slate-700 text-slate-200 border-slate-500" },
      { role: "PCM", duty: "อนุมัติ PO ขั้น Pending PCM, อนุญาตแก้ไข PO หลัง Approve", color: "bg-indigo-900 text-indigo-200 border-indigo-600" },
      { role: "GM", duty: "อนุมัติ PO ขั้นสุดท้าย (Pending GM), อนุญาตแก้ไข PO ที่ Active", color: "bg-green-900 text-green-200 border-green-600" },
      { role: "PM / PCM / Staff", duty: "รับของเข้าระบบ — บันทึกการรับสินค้า/วัสดุ", color: "bg-teal-900 text-teal-200 border-teal-600" },
      { role: "Administrator", duty: "ทำได้ทุกขั้นตอน", color: "bg-purple-900 text-purple-200 border-purple-600" },
    ],
    notes: [
      "Receive Auto: ระบบจะสร้างรายการ Receive ให้อัตโนมัติ รับครบ 100% ทุกบรรทัด และเปลี่ยน PO เป็น Received ทันทีหลัง GM Approve",
      "Pay Before Receive: PO จะเป็น Wait Pay ก่อน รอจ่ายเงินแล้วค่อย Receive",
      "การขอแก้ไข PO ที่ Approved/Received/Closed PO แล้ว ต้องผ่านการอนุญาตจาก PCM หรือ GM",
    ],
  },
  {
    id: "payment",
    title: "Payment Subcontractor (จ่ายเงินผู้รับเหมา)",
    subtitle: "กระบวนการทำสัญญาและเบิกงวดงาน",
    icon: <CreditCard size={20} className="text-white" />,
    color: "text-orange-400",
    bgColor: "bg-gradient-to-r from-orange-700 to-orange-600",
    borderColor: "border-orange-600",
    steps: [
      {
        actor: "Procurement / Administrator",
        actorColor: "bg-slate-700 text-slate-200 border-slate-500",
        action: "สร้าง Payment Contract จาก PO ที่ Approved แล้ว กรอกรายละเอียดสัญญา",
        result: "Draft",
      },
      {
        actor: "Procurement / CM / Administrator",
        actorColor: "bg-slate-700 text-slate-200 border-slate-500",
        action: "Submit Payment เพื่อเริ่ม Approval Flow",
        result: "Pending CM (หรือขั้นที่เหมาะกับ Role ผู้ Submit)",
      },
      {
        actor: "CM / Administrator",
        actorColor: "bg-yellow-900 text-yellow-200 border-yellow-600",
        action: "อนุมัติสัญญา ขั้น CM",
        result: "Pending CM → Pending PM",
      },
      {
        actor: "PM / PCM / Administrator",
        actorColor: "bg-amber-900 text-amber-200 border-amber-600",
        action: "อนุมัติสัญญา ขั้น PM",
        result: "Pending PM → Pending MD",
      },
      {
        actor: "MD / GM / Administrator",
        actorColor: "bg-red-900 text-red-200 border-red-600",
        action: "อนุมัติสัญญา ขั้น MD",
        result: "Pending MD → Pending Procurement",
      },
      {
        actor: "Procurement / Administrator",
        actorColor: "bg-blue-900 text-blue-200 border-blue-600",
        action: "รับทราบและเปิดใช้งานสัญญา",
        result: "Pending Procurement → Active ✅",
      },
      {
        actor: "Procurement / Staff",
        actorColor: "bg-slate-700 text-slate-200 border-slate-500",
        action: "กรอกปริมาณงานงวดใหม่ + เลือกรอบวางบิล → Submit งวดงาน",
        result: "งวดงาน Pending CM",
      },
      {
        actor: "CM / Administrator",
        actorColor: "bg-yellow-900 text-yellow-200 border-yellow-600",
        action: "อนุมัติงวดงาน ขั้น CM",
        result: "งวดงาน Pending CM → งวดงาน Pending PM",
      },
      {
        actor: "PM / PCM / Administrator",
        actorColor: "bg-amber-900 text-amber-200 border-amber-600",
        action: "อนุมัติงวดงาน ขั้น PM",
        result: "งวดงาน Pending PM → Wait Pay",
      },
      {
        actor: "Procurement / Administrator",
        actorColor: "bg-blue-900 text-blue-200 border-blue-600",
        action: "บันทึกการจ่ายเงิน",
        result: "Wait Pay → Paid ✅",
      },
    ],
    roles: [
      { role: "CM", duty: "อนุมัติสัญญา + อนุมัติงวดงาน ขั้น CM", color: "bg-yellow-900 text-yellow-200 border-yellow-600" },
      { role: "PM / PCM", duty: "อนุมัติสัญญา + อนุมัติงวดงาน ขั้น PM", color: "bg-amber-900 text-amber-200 border-amber-600" },
      { role: "MD / GM", duty: "อนุมัติสัญญา ขั้น MD", color: "bg-red-900 text-red-200 border-red-600" },
      { role: "Procurement", duty: "สร้างสัญญา, Submit, เปิดใช้งาน, กรอกงวดงาน, จ่ายเงิน", color: "bg-blue-900 text-blue-200 border-blue-600" },
      { role: "Administrator", duty: "ทำได้ทุกขั้นตอน", color: "bg-purple-900 text-purple-200 border-purple-600" },
    ],
    notes: [
      "Role ที่สูงกว่า (GM/MD) เมื่อ Submit จะข้ามขั้นต้นๆ ไปยัง Pending Procurement โดยอัตโนมัติ",
      "งวดงานแต่ละงวดต้องเลือก 'รอบวางบิล' ก่อน Submit",
      "สามารถขอ Revision ได้ในทุกขั้นตอน — Payment จะกลับไปสถานะ Draft เพื่อแก้ไข",
    ],
  },
  {
    id: "receive",
    title: "Receive (รับสินค้า/วัสดุ)",
    subtitle: "บันทึกการรับสินค้าตาม PO",
    icon: <PackageCheck size={20} className="text-white" />,
    color: "text-teal-400",
    bgColor: "bg-gradient-to-r from-teal-700 to-teal-600",
    borderColor: "border-teal-600",
    steps: [
      {
        actor: "ระบบ",
        actorColor: "bg-slate-700 text-slate-200 border-slate-500",
        action: "PO ถูก GM Approve แล้ว → สถานะเป็น 'Approved' (พร้อมรับของ)",
        result: "PO สถานะ Approved",
      },
      {
        actor: "PM / PCM / Staff / Administrator",
        actorColor: "bg-teal-900 text-teal-200 border-teal-600",
        action: "เข้าเมนู Receive → เลือก PO → กรอกจำนวนที่รับจริง วันที่รับ และหมายเหตุ",
        result: "บันทึก Receive Record",
      },
      {
        actor: "ระบบ",
        actorColor: "bg-slate-700 text-slate-200 border-slate-500",
        action: "อัปเดตสถานะ PO เป็น Received",
        result: "PO สถานะ Received ✅",
      },
    ],
    roles: [
      { role: "Staff", duty: "กรอกข้อมูลการรับสินค้า — จำนวน, วันที่, หมายเหตุ", color: "bg-slate-700 text-slate-200 border-slate-500" },
      { role: "PM / PCM", duty: "รับของและตรวจสอบความถูกต้อง", color: "bg-teal-900 text-teal-200 border-teal-600" },
      { role: "Administrator", duty: "ทำได้ทุกขั้นตอน", color: "bg-purple-900 text-purple-200 border-purple-600" },
    ],
    notes: [
      "PO ประเภท Receive Auto จะถูก Receive อัตโนมัติเมื่อ GM Approve ไม่ต้องทำในเมนู Receive",
      "PO ประเภท Pay Before Receive ต้องจ่ายเงินก่อน แล้วจึง Receive ได้",
      "สามารถรับของบางส่วนได้ (Partial Receive)",
    ],
  },
  {
    id: "invoice",
    title: "Invoice (วางบิล/ใบแจ้งหนี้)",
    subtitle: "บันทึกใบแจ้งหนี้จากผู้ขาย",
    icon: <FileInput size={20} className="text-white" />,
    color: "text-violet-400",
    bgColor: "bg-gradient-to-r from-violet-700 to-violet-600",
    borderColor: "border-violet-600",
    steps: [
      {
        actor: "ระบบ",
        actorColor: "bg-slate-700 text-slate-200 border-slate-500",
        action: "PO สถานะ Received หรือ Approved (พร้อมวางบิล)",
        result: "PO พร้อมรับ Invoice",
      },
      {
        actor: "Procurement / Staff / Administrator",
        actorColor: "bg-violet-900 text-violet-200 border-violet-600",
        action: "เข้าเมนู Invoice → เลือก PO → กรอกข้อมูลใบแจ้งหนี้ (เลขที่, วันที่, ยอดเงิน)",
        result: "Invoice บันทึกเข้าระบบ — ผูกกับ PO",
      },
      {
        actor: "PM / PCM / Administrator",
        actorColor: "bg-amber-900 text-amber-200 border-amber-600",
        action: "ตรวจสอบและยืนยัน Invoice",
        result: "Invoice Approved ✅",
      },
      {
        actor: "ระบบ",
        actorColor: "bg-slate-700 text-slate-200 border-slate-500",
        action: "เมื่อ Invoice ครบทุกรายการของ PO — ปิด PO อัตโนมัติ",
        result: "PO สถานะ Closed PO",
      },
    ],
    roles: [
      { role: "Procurement / Staff", duty: "บันทึก Invoice เข้าระบบ ผูกกับ PO ที่ Received", color: "bg-violet-900 text-violet-200 border-violet-600" },
      { role: "PM / PCM", duty: "ตรวจสอบและอนุมัติ Invoice", color: "bg-amber-900 text-amber-200 border-amber-600" },
      { role: "GM / MD", duty: "ดูรายงาน Invoice สรุปยอด", color: "bg-green-900 text-green-200 border-green-600" },
      { role: "Administrator", duty: "ทำได้ทุกขั้นตอน", color: "bg-purple-900 text-purple-200 border-purple-600" },
    ],
    notes: [
      "1 PO สามารถมีได้หลาย Invoice (แยกวางบิลหลายครั้ง)",
      "Invoice จะถูกนำไปคำนวณเป็น Spent (Inv)Total ในรายงาน Budget Summary",
      "เมื่อ Invoice รวมครบยอด PO — ระบบจะปิด PO เป็น Closed PO อัตโนมัติ",
    ],
  },
];

// ─── Role Summary Table ───────────────────────────────────────────────────────
const ROLE_MATRIX = [
  { role: "Staff",         pr: "สร้าง",           po: "-",               payment: "กรอกงวดงาน",   receive: "รับของ",     invoice: "บันทึก" },
  { role: "CM",            pr: "Approve ขั้น 1",   po: "-",               payment: "Approve ขั้น 1+งวดงาน", receive: "รับของ", invoice: "ดู" },
  { role: "PM",            pr: "Approve ขั้น 1,2", po: "-",               payment: "Approve ขั้น 2+งวดงาน", receive: "รับของ", invoice: "อนุมัติ" },
  { role: "PCM",           pr: "Edit Budget / Active PR", po: "Approve ขั้น 1", payment: "Approve ขั้น 2+งวดงาน", receive: "รับของ", invoice: "อนุมัติ" },
  { role: "GM",            pr: "-",                po: "Approve ขั้น 2",  payment: "Approve ขั้น 3", receive: "-",         invoice: "ดู" },
  { role: "MD",            pr: "Approve Contract", po: "-",               payment: "Approve ขั้น 3", receive: "-",         invoice: "ดู" },
  { role: "Procurement",   pr: "สร้าง/แก้ไข",     po: "สร้าง",           payment: "สร้าง/จ่ายเงิน", receive: "-",         invoice: "บันทึก" },
  { role: "Administrator", pr: "ทั้งหมด",          po: "ทั้งหมด",         payment: "ทั้งหมด",        receive: "ทั้งหมด",   invoice: "ทั้งหมด" },
];

const cellClass = (val: string) =>
  val === "-" ? "text-slate-500 text-center" :
  val === "ทั้งหมด" ? "text-purple-300 font-bold text-center" :
  "text-slate-200 text-center text-xs";

// ─── Main Component ───────────────────────────────────────────────────────────
const UserManualView = React.memo(() => {
  const [activeSection, setActiveSection] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-slate-900 text-white px-4 py-6 md:px-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
            <BookOpen size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">User Manual</h1>
            <p className="text-slate-400 text-sm">คู่มือการใช้งานระบบ CMG Budget Control</p>
          </div>
        </div>

        {/* Quick nav */}
        <div className="flex flex-wrap gap-2 mt-5">
          {WORKFLOWS.map((w) => (
            <button
              key={w.id}
              onClick={() => {
                const el = document.getElementById(`section-${w.id}`);
                el?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all hover:scale-105 ${w.bgColor} ${w.borderColor} text-white/90`}
            >
              {w.icon && React.cloneElement(w.icon as React.ReactElement, { size: 12 })}
              {w.title.split("—")[0].trim()}
            </button>
          ))}
          <button
            onClick={() => {
              const el = document.getElementById("role-matrix");
              el?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border bg-purple-700 border-purple-500 text-white/90 hover:scale-105 transition-all"
          >
            <Users size={12} /> Role Matrix
          </button>
        </div>
      </div>

      {/* Workflow Sections */}
      <div className="space-y-5 mb-10">
        {WORKFLOWS.map((section) => (
          <div key={section.id} id={`section-${section.id}`}>
            <SectionCard section={section} />
          </div>
        ))}
      </div>

      {/* Role Matrix Table */}
      <div id="role-matrix" className="rounded-2xl border-2 border-purple-600 overflow-hidden shadow-lg mb-8">
        <div className="bg-gradient-to-r from-purple-700 to-purple-600 px-5 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <Users size={20} className="text-white" />
          </div>
          <div>
            <div className="text-white font-bold text-base">Role Matrix — สรุปสิทธิ์ทุก Role</div>
            <div className="text-white/70 text-xs">ภาพรวมสิทธิ์การดำเนินการในแต่ละ Module</div>
          </div>
        </div>
        <div className="bg-slate-800 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-700 text-slate-300 uppercase text-[10px] tracking-wider">
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-3 py-3">PR</th>
                <th className="px-3 py-3">PO</th>
                <th className="px-3 py-3">Payment Sub</th>
                <th className="px-3 py-3">Receive</th>
                <th className="px-3 py-3">Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {ROLE_MATRIX.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-slate-800" : "bg-slate-750"}>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                      row.role === "Administrator" ? "bg-purple-900 text-purple-200 border-purple-600" :
                      row.role === "GM" ? "bg-green-900 text-green-200 border-green-600" :
                      row.role === "MD" ? "bg-red-900 text-red-200 border-red-600" :
                      row.role === "PCM" ? "bg-indigo-900 text-indigo-200 border-indigo-600" :
                      row.role === "CM" ? "bg-yellow-900 text-yellow-200 border-yellow-600" :
                      row.role === "PM" ? "bg-amber-900 text-amber-200 border-amber-600" :
                      row.role === "Procurement" ? "bg-blue-900 text-blue-200 border-blue-600" :
                      "bg-slate-700 text-slate-200 border-slate-500"
                    }`}>
                      <User size={9} /> {row.role}
                    </span>
                  </td>
                  <td className={`px-3 py-2.5 ${cellClass(row.pr)}`}>{row.pr}</td>
                  <td className={`px-3 py-2.5 ${cellClass(row.po)}`}>{row.po}</td>
                  <td className={`px-3 py-2.5 ${cellClass(row.payment)}`}>{row.payment}</td>
                  <td className={`px-3 py-2.5 ${cellClass(row.receive)}`}>{row.receive}</td>
                  <td className={`px-3 py-2.5 ${cellClass(row.invoice)}`}>{row.invoice}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer note */}
      <div className="flex items-start gap-3 p-4 bg-slate-800 border border-slate-600 rounded-xl text-slate-400 text-xs">
        <AlertCircle size={16} className="text-yellow-400 flex-shrink-0 mt-0.5" />
        <p>
          <span className="text-yellow-300 font-semibold">หมายเหตุ:</span>{" "}
          Role <span className="text-purple-300 font-semibold">Administrator</span> มีสิทธิ์ดำเนินการแทนทุก Role ในทุกขั้นตอน —
          สิทธิ์บางส่วนสามารถกำหนดเพิ่มเติมได้โดย Administrator ในเมนู{" "}
          <span className="text-white font-semibold">ผู้ดูแลระบบ (Admin)</span>
        </p>
      </div>
    </div>
  );
});

export default UserManualView;
