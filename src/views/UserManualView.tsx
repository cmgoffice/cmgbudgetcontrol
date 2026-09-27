// @ts-nocheck
import React from "react";
import {
  FileText, ShoppingCart, CreditCard, PackageCheck, FileInput, Wallet,
  User, Users, BookOpen, AlertCircle, Workflow, Lightbulb, Tags
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Tone = "start" | "pending" | "approved" | "rejected" | "done" | "info" | "auto";
type Side = "l" | "r" | "t" | "b";

interface FlowNode {
  id: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  label: string;
  sub?: string;
  tone: Tone;
}

interface FlowEdge {
  from: string;
  to: string;
  label?: string;
  kind?: "normal" | "reject" | "auto";
  sides?: [Side, Side];
  offset?: number;
  labelAt?: [number, number];
}

interface FlowDiagramData {
  id: string;
  title: string;
  caption?: string;
  width: number;
  height: number;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

interface Step {
  actor: string;
  action: string;
  result: string;
  tone: Tone;
  note?: string;
}

interface ManualSection {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accent: string;
  diagrams: FlowDiagramData[];
  steps: Step[];
  roles: { role: string; duty: string }[];
  notes?: string[];
}

// ─── Palette ──────────────────────────────────────────────────────────────────
const NODE_W = 150;
const NODE_H = 54;

const TONES: Record<Tone, { fill: string; stroke: string; text: string; sub: string; pill: string; name: string }> = {
  start: { fill: "#f8fafc", stroke: "#64748b", text: "#0f172a", sub: "#475569", pill: "bg-slate-100 text-slate-700 border-slate-300", name: "เริ่มต้น / การกระทำ" },
  pending: { fill: "#fefce8", stroke: "#ca8a04", text: "#713f12", sub: "#a16207", pill: "bg-yellow-50 text-yellow-800 border-yellow-300", name: "รออนุมัติ / รอดำเนินการ" },
  approved: { fill: "#f0fdf4", stroke: "#16a34a", text: "#14532d", sub: "#15803d", pill: "bg-green-50 text-green-800 border-green-300", name: "อนุมัติแล้ว" },
  rejected: { fill: "#fef2f2", stroke: "#dc2626", text: "#7f1d1d", sub: "#b91c1c", pill: "bg-red-50 text-red-800 border-red-300", name: "ปฏิเสธ / ส่งกลับแก้ไข" },
  done: { fill: "#ecfdf5", stroke: "#059669", text: "#064e3b", sub: "#047857", pill: "bg-emerald-50 text-emerald-800 border-emerald-300", name: "เสร็จสิ้น" },
  info: { fill: "#f0f9ff", stroke: "#0284c7", text: "#0c4a6e", sub: "#0369a1", pill: "bg-sky-50 text-sky-800 border-sky-300", name: "ขั้นตอนทำงาน" },
  auto: { fill: "#f5f3ff", stroke: "#7c3aed", text: "#4c1d95", sub: "#6d28d9", pill: "bg-violet-50 text-violet-800 border-violet-300", name: "ระบบทำอัตโนมัติ" },
};

const EDGE_COLORS = {
  normal: "#64748b",
  reject: "#dc2626",
  auto: "#7c3aed",
};

const ROLE_COLORS: Record<string, string> = {
  Administrator: "bg-purple-50 text-purple-800 border-purple-300",
  MD: "bg-red-50 text-red-800 border-red-300",
  GM: "bg-green-50 text-green-800 border-green-300",
  PM: "bg-amber-50 text-amber-800 border-amber-300",
  PCM: "bg-indigo-50 text-indigo-800 border-indigo-300",
  CM: "bg-yellow-50 text-yellow-800 border-yellow-300",
  Procurement: "bg-blue-50 text-blue-800 border-blue-300",
  Staff: "bg-slate-100 text-slate-700 border-slate-300",
  "Admin Site": "bg-teal-50 text-teal-800 border-teal-300",
  ระบบ: "bg-violet-50 text-violet-800 border-violet-300",
};

const roleColor = (role: string) => {
  const first = role.split("/")[0].trim();
  return ROLE_COLORS[first] ?? ROLE_COLORS.Staff;
};

// ─── Flow diagram (SVG) ───────────────────────────────────────────────────────
const anchor = (n: FlowNode, side: Side): [number, number] => {
  const w = n.w ?? NODE_W;
  const h = n.h ?? NODE_H;
  if (side === "r") return [n.x + w, n.y + h / 2];
  if (side === "l") return [n.x, n.y + h / 2];
  if (side === "t") return [n.x + w / 2, n.y];
  return [n.x + w / 2, n.y + h];
};

const inferSides = (a: FlowNode, b: FlowNode): [Side, Side] => {
  const aw = a.w ?? NODE_W;
  const bw = b.w ?? NODE_W;
  if (b.x >= a.x + aw - 1) return ["r", "l"];
  if (b.x + bw <= a.x + 1) return ["l", "r"];
  if (b.y > a.y) return ["b", "t"];
  return ["t", "b"];
};

const isHorizontal = (s: Side) => s === "l" || s === "r";

const buildEdge = (e: FlowEdge, a: FlowNode, b: FlowNode) => {
  const [fs, ts] = e.sides ?? inferSides(a, b);
  const [x1, y1] = anchor(a, fs);
  const [x2, y2] = anchor(b, ts);
  let d: string;
  let mid: [number, number];
  let vertical = false;

  if (fs === ts && !isHorizontal(fs)) {
    const y = fs === "b" ? Math.max(y1, y2) + (e.offset ?? 24) : Math.min(y1, y2) - (e.offset ?? 24);
    d = `M${x1} ${y1} V${y} H${x2} V${y2}`;
    mid = [(x1 + x2) / 2, y];
  } else if (isHorizontal(fs) && isHorizontal(ts)) {
    if (y1 === y2) {
      d = `M${x1} ${y1} H${x2}`;
      mid = [(x1 + x2) / 2, y1];
    } else {
      const mx = (x1 + x2) / 2;
      d = `M${x1} ${y1} H${mx} V${y2} H${x2}`;
      mid = [(mx + x2) / 2, y2];
    }
  } else if (!isHorizontal(fs) && !isHorizontal(ts)) {
    if (x1 === x2) {
      d = `M${x1} ${y1} V${y2}`;
      mid = [x1, (y1 + y2) / 2];
      vertical = true;
    } else {
      const my = (y1 + y2) / 2;
      d = `M${x1} ${y1} V${my} H${x2} V${y2}`;
      mid = [(x1 + x2) / 2, my];
    }
  } else if (!isHorizontal(fs)) {
    d = `M${x1} ${y1} V${y2} H${x2}`;
    mid = [(x1 + x2) / 2, y2];
  } else {
    d = `M${x1} ${y1} H${x2} V${y2}`;
    mid = [x2, (y1 + y2) / 2];
    vertical = true;
  }

  if (e.labelAt) {
    return { d, labelX: e.labelAt[0], labelY: e.labelAt[1], anchorText: "middle" };
  }
  if (vertical) {
    return { d, labelX: mid[0] + 8, labelY: mid[1] + 4, anchorText: "start" };
  }
  return { d, labelX: mid[0], labelY: mid[1] - 7, anchorText: "middle" };
};

const FlowDiagram = ({ data }: { data: FlowDiagramData }) => {
  const byId = Object.fromEntries(data.nodes.map((n) => [n.id, n]));
  const markerId = (kind: string) => `${data.id}-arrow-${kind}`;

  return (
    <figure className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-3 pb-2 border-b border-slate-100">
        <span className="text-sm font-semibold text-slate-800">{data.title}</span>
        {data.caption && <span className="text-[11px] text-slate-500">{data.caption}</span>}
      </figcaption>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${data.width} ${data.height}`}
          width="100%"
          style={{ minWidth: Math.round(data.width * 0.72), display: "block", fontFamily: "inherit" }}
          role="img"
          aria-label={data.title}
        >
          <defs>
            <pattern id={`${data.id}-dots`} width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="#e2e8f0" />
            </pattern>
            {Object.entries(EDGE_COLORS).map(([kind, color]) => (
              <marker
                key={kind}
                id={markerId(kind)}
                viewBox="0 0 10 10"
                refX="10"
                refY="5"
                markerWidth="9"
                markerHeight="9"
                markerUnits="userSpaceOnUse"
                orient="auto"
              >
                <path d="M0,0 L10,5 L0,10 z" fill={color} />
              </marker>
            ))}
          </defs>
          <rect width={data.width} height={data.height} fill={`url(#${data.id}-dots)`} />

          {data.edges.map((e, i) => {
            const a = byId[e.from];
            const b = byId[e.to];
            if (!a || !b) return null;
            const kind = e.kind ?? "normal";
            const g = buildEdge(e, a, b);
            return (
              <g key={`edge-${i}`}>
                <path
                  d={g.d}
                  fill="none"
                  stroke={EDGE_COLORS[kind]}
                  strokeWidth={1.6}
                  strokeDasharray={kind === "normal" ? undefined : "5 4"}
                  markerEnd={`url(#${markerId(kind)})`}
                />
                {e.label && (
                  <text
                    x={g.labelX}
                    y={g.labelY}
                    textAnchor={g.anchorText}
                    fontSize="11"
                    fontWeight="600"
                    fill={kind === "reject" ? "#b91c1c" : kind === "auto" ? "#6d28d9" : "#334155"}
                    stroke="#ffffff"
                    strokeWidth="4"
                    strokeLinejoin="round"
                    style={{ paintOrder: "stroke" }}
                  >
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}

          {data.nodes.map((n) => {
            const w = n.w ?? NODE_W;
            const h = n.h ?? NODE_H;
            const t = TONES[n.tone];
            return (
              <g key={n.id}>
                <rect x={n.x} y={n.y} width={w} height={h} rx="10" fill={t.fill} stroke={t.stroke} strokeWidth="1.6" />
                <text
                  x={n.x + w / 2}
                  y={n.sub ? n.y + 23 : n.y + h / 2 + 5}
                  textAnchor="middle"
                  fontSize="13"
                  fontWeight="700"
                  fill={t.text}
                >
                  {n.label}
                </text>
                {n.sub && (
                  <text x={n.x + w / 2} y={n.y + 41} textAnchor="middle" fontSize="10.5" fill={t.sub}>
                    {n.sub}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </figure>
  );
};

// ─── Small UI pieces ──────────────────────────────────────────────────────────
const RoleBadge = ({ role }: { role: string }) => (
  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${roleColor(role)}`}>
    <User size={10} />
    {role}
  </span>
);

const StatusPill = ({ label, tone }: { label: string; tone: Tone }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${TONES[tone].pill}`}>
    {label}
  </span>
);

const StepList = ({ steps }: { steps: Step[] }) => (
  <ol className="space-y-0">
    {steps.map((step, i) => (
      <li key={i} className="flex gap-3">
        <div className="flex flex-col items-center">
          <div className="w-7 h-7 rounded-full bg-blue-600 border border-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {i + 1}
          </div>
          {i < steps.length - 1 && <div className="w-px flex-1 bg-slate-200 my-1 min-h-[16px]" />}
        </div>
        <div className="pb-4 flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <RoleBadge role={step.actor} />
          </div>
          <p className="text-sm text-slate-800 leading-relaxed">{step.action}</p>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <span className="text-slate-500 text-[11px]">ผลลัพธ์</span>
            <StatusPill label={step.result} tone={step.tone} />
            {step.note && <span className="text-slate-500 text-[11px]">{step.note}</span>}
          </div>
        </div>
      </li>
    ))}
  </ol>
);

const NoteBox = ({ notes }: { notes: string[] }) => (
  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
    <div className="flex items-center gap-2 mb-2">
      <Lightbulb size={14} className="text-amber-600" />
      <span className="text-amber-800 text-xs font-semibold">ข้อควรรู้</span>
    </div>
    <ul className="space-y-1.5">
      {notes.map((n, i) => (
        <li key={i} className="text-slate-700 text-xs leading-relaxed flex items-start gap-2">
          <span className="text-amber-500 mt-0.5">•</span>
          <span>{n}</span>
        </li>
      ))}
    </ul>
  </div>
);

// ─── Diagrams ─────────────────────────────────────────────────────────────────
const OVERVIEW_DIAGRAM: FlowDiagramData = {
  id: "overview",
  title: "ภาพรวมเส้นทางเอกสารทั้งระบบ",
  caption: "Invoice ที่จ่ายเงินสด/โอน/เช็คจะเป็น paid ทันที ไม่ต้องผ่าน Billing",
  width: 1090,
  height: 330,
  nodes: [
    { id: "project", x: 20, y: 30, label: "Project", sub: "สร้างโครงการ", tone: "start" },
    { id: "budget", x: 200, y: 30, label: "Budget", sub: "MD อนุมัติงบ", tone: "approved" },
    { id: "pr", x: 380, y: 30, label: "PR ใบขอซื้อ", sub: "CM → PM (→ MD)", tone: "pending" },
    { id: "po", x: 560, y: 30, label: "PO ใบสั่งซื้อ", sub: "PCM → GM", tone: "pending" },
    { id: "receive", x: 740, y: 30, label: "Receive", sub: "รับของเข้าระบบ", tone: "info" },
    { id: "invoice", x: 920, y: 30, label: "Invoice", sub: "ใบแจ้งหนี้", tone: "info" },
    { id: "paysub", x: 560, y: 150, label: "Payment Sub", sub: "PO ประเภท SP / DC", tone: "info" },
    { id: "pay", x: 740, y: 150, label: "Pay", sub: "จ่ายเงิน", tone: "info" },
    { id: "billing", x: 920, y: 150, label: "Billing", sub: "วางบิล (Inpay)", tone: "pending" },
    { id: "done", x: 740, y: 260, label: "จบงาน", sub: "paid / Paid / Closed PO", tone: "done" },
  ],
  edges: [
    { from: "project", to: "budget" },
    { from: "budget", to: "pr" },
    { from: "pr", to: "po" },
    { from: "po", to: "receive" },
    { from: "receive", to: "invoice" },
    { from: "invoice", to: "billing", label: "เครดิต", sides: ["b", "t"] },
    { from: "billing", to: "pay" },
    { from: "pay", to: "done", sides: ["b", "t"] },
    { from: "po", to: "paysub", label: "งานจ้าง", sides: ["b", "t"] },
    { from: "paysub", to: "done", label: "จ่ายครบ 100%", sides: ["b", "l"] },
  ],
};

const BUDGET_DIAGRAM: FlowDiagramData = {
  id: "budget",
  title: "สถานะ Budget หลัก และ Sub-item (ใช้กติกาเดียวกัน)",
  caption: "Sub-item ส่งอนุมัติได้หลัง Budget หลัก Approved แล้วเท่านั้น",
  width: 880,
  height: 260,
  nodes: [
    { id: "draft", x: 20, y: 60, label: "Draft", sub: "สร้าง / แก้ไขรายการ", tone: "start" },
    { id: "wait", x: 230, y: 60, w: 170, label: "Wait MD Approve", sub: "กด Submit", tone: "pending" },
    { id: "appr", x: 480, y: 60, label: "Approved", sub: "นำไปเปิด PR ได้", tone: "approved" },
    { id: "rej", x: 480, y: 170, label: "Rejected", sub: "MD ปฏิเสธ + เหตุผล", tone: "rejected" },
    { id: "rev", x: 700, y: 60, w: 160, label: "Revision Pending", sub: "ขอแก้ไขงบ", tone: "pending" },
  ],
  edges: [
    { from: "draft", to: "wait" },
    { from: "wait", to: "appr", label: "MD อนุมัติ" },
    { from: "wait", to: "rej", label: "MD ปฏิเสธ", kind: "reject", sides: ["b", "l"] },
    { from: "appr", to: "rev", label: "ขอแก้ไข", sides: ["t", "t"], offset: 26 },
    { from: "rev", to: "appr", label: "ไม่อนุญาต", kind: "reject" },
    { from: "rev", to: "draft", label: "MD อนุญาตแก้ไข → กลับเป็น Draft", sides: ["b", "b"], offset: 130, labelAt: [440, 237] },
  ],
};

const PR_DIAGRAM: FlowDiagramData = {
  id: "pr",
  title: "สายอนุมัติ PR",
  caption: "บันทึก PR แล้วเข้าสถานะ Pending CM ทันที (ไม่มี Draft)",
  width: 1090,
  height: 290,
  nodes: [
    { id: "create", x: 20, y: 40, label: "สร้าง / แก้ไข PR", sub: "ผู้มีสิทธิ์สร้าง PR", tone: "start" },
    { id: "pcm", x: 200, y: 40, label: "Pending CM", sub: "CM / PM อนุมัติ", tone: "pending" },
    { id: "ppm", x: 380, y: 40, label: "Pending PM", sub: "PM อนุมัติ", tone: "pending" },
    { id: "pmd", x: 560, y: 160, label: "Pending MD", sub: "เฉพาะ จ้างเหมา > DL", tone: "pending" },
    { id: "appr", x: 740, y: 40, label: "Approved", sub: "พร้อมเปิด PO", tone: "approved" },
    { id: "issued", x: 920, y: 40, label: "PO Issued", sub: "เปิด PO แล้ว", tone: "done" },
    { id: "rej", x: 200, y: 180, label: "Rejected", sub: "ระบุเหตุผล", tone: "rejected" },
  ],
  edges: [
    { from: "create", to: "pcm" },
    { from: "pcm", to: "ppm" },
    { from: "ppm", to: "appr", label: "PR ทั่วไป" },
    { from: "ppm", to: "pmd", label: "สัญญา DL", sides: ["r", "l"], labelAt: [635, 150] },
    { from: "pmd", to: "appr", label: "MD อนุมัติ", sides: ["r", "b"] },
    { from: "appr", to: "issued" },
    { from: "pcm", to: "rej", label: "Reject", kind: "reject", sides: ["b", "t"] },
    { from: "ppm", to: "rej", kind: "reject", sides: ["b", "r"] },
    { from: "pmd", to: "rej", kind: "reject", sides: ["b", "b"], offset: 30 },
    { from: "rej", to: "create", label: "แก้ไขแล้วส่งใหม่", kind: "reject", sides: ["l", "b"] },
  ],
};

const PR_LIFECYCLE_DIAGRAM: FlowDiagramData = {
  id: "pr-life",
  title: "PR หลังอนุมัติ: ปิด PR / เปิดกลับ / ขอแก้ไขงบ",
  width: 980,
  height: 210,
  nodes: [
    { id: "appr", x: 20, y: 30, w: 170, label: "Approved / PO Issued", sub: "PR ที่ใช้งานอยู่", tone: "approved" },
    { id: "pclose", x: 240, y: 30, label: "Pending Close", sub: "Procurement ขอปิด", tone: "pending" },
    { id: "closed", x: 420, y: 30, label: "Closed PR", sub: "PCM ยืนยันปิด", tone: "done" },
    { id: "pactive", x: 600, y: 30, w: 170, label: "Pending Active PR", sub: "Procurement/PCM ขอเปิด", tone: "pending" },
    { id: "resume", x: 810, y: 30, label: "กลับสถานะเดิม", sub: "PCM อนุมัติ", tone: "approved" },
    { id: "edit", x: 240, y: 130, label: "Edit Budget", sub: "ขอแก้ไข + เหตุผล", tone: "rejected" },
    { id: "back", x: 480, y: 130, label: "Pending CM", sub: "แก้แล้วส่งอนุมัติใหม่", tone: "pending" },
  ],
  edges: [
    { from: "appr", to: "pclose" },
    { from: "pclose", to: "closed" },
    { from: "closed", to: "pactive" },
    { from: "pactive", to: "resume" },
    { from: "appr", to: "edit", sides: ["b", "l"] },
    { from: "edit", to: "back", label: "ผู้สร้างแก้ไข" },
  ],
};

const PO_DIAGRAM: FlowDiagramData = {
  id: "po",
  title: "สายอนุมัติ PO และเส้นทางหลัง GM อนุมัติ",
  caption: "ระบบเลือกเส้นทางเองจาก Receive Type และการตั้งค่า Pay before Receive",
  width: 1040,
  height: 320,
  nodes: [
    { id: "draft", x: 20, y: 40, label: "Draft", sub: "บันทึกร่าง", tone: "start" },
    { id: "ppcm", x: 200, y: 40, label: "Pending PCM", sub: "PCM อนุมัติ", tone: "pending" },
    { id: "pgm", x: 380, y: 40, label: "Pending GM", sub: "GM อนุมัติ", tone: "pending" },
    { id: "gm", x: 560, y: 40, label: "GM อนุมัติ", sub: "ระบบเลือกเส้นทาง", tone: "auto" },
    { id: "rej", x: 290, y: 170, label: "Rejected", sub: "ส่งกลับแก้ไข", tone: "rejected" },
    { id: "b1", x: 800, y: 20, w: 220, label: "Approved", sub: "PO ปกติ → รอรับของ", tone: "approved" },
    { id: "b2", x: 800, y: 95, w: 220, label: "Received", sub: "Receive Auto → ไป Invoice", tone: "done" },
    { id: "b3", x: 800, y: 170, w: 220, label: "Wait Invoice", sub: "Pay before Receive → จ่ายก่อน", tone: "pending" },
    { id: "b4", x: 800, y: 245, w: 220, label: "Paid", sub: "Auto Invoice + Auto Receive", tone: "done" },
  ],
  edges: [
    { from: "draft", to: "ppcm" },
    { from: "ppcm", to: "pgm" },
    { from: "pgm", to: "gm" },
    { from: "gm", to: "b1", kind: "auto" },
    { from: "gm", to: "b2", kind: "auto" },
    { from: "gm", to: "b3", kind: "auto" },
    { from: "gm", to: "b4", kind: "auto" },
    { from: "ppcm", to: "rej", label: "Reject", kind: "reject", sides: ["b", "t"] },
    { from: "pgm", to: "rej", kind: "reject", sides: ["b", "t"] },
    { from: "rej", to: "draft", label: "แก้ไข", kind: "reject", sides: ["l", "b"] },
  ],
};

const DOWNSTREAM_DIAGRAM: FlowDiagramData = {
  id: "downstream",
  title: "PO ปกติ: รับของ → วางบิล → จ่ายเงิน",
  caption: "Invoice สร้างเองจากเมนู Invoice หลังรับของ ระบบไม่สร้างให้อัตโนมัติ",
  width: 910,
  height: 230,
  nodes: [
    { id: "po", x: 20, y: 40, label: "PO Approved", sub: "พร้อมรับของ", tone: "approved" },
    { id: "recv", x: 200, y: 40, label: "Receive", sub: "บันทึกจำนวนรับจริง", tone: "info" },
    { id: "partial", x: 200, y: 160, label: "Partial Receive", sub: "รับไม่ครบ รับเพิ่มได้", tone: "pending" },
    { id: "received", x: 380, y: 40, label: "Received", sub: "รับครบทุกรายการ", tone: "done" },
    { id: "inv", x: 560, y: 40, label: "Invoice", sub: "เลือก Receive มาวางบิล", tone: "info" },
    { id: "credit", x: 740, y: 40, label: "Invcredit", sub: "เครดิต", tone: "pending" },
    { id: "inpay", x: 740, y: 160, label: "Inpay", sub: "ทำ Billing แล้ว", tone: "pending" },
    { id: "paid", x: 560, y: 160, label: "paid", sub: "ทำ Pay แล้ว", tone: "done" },
  ],
  edges: [
    { from: "po", to: "recv" },
    { from: "recv", to: "received" },
    { from: "recv", to: "partial", label: "บางส่วน", sides: ["b", "t"] },
    { from: "partial", to: "received", label: "รับเพิ่มจนครบ", sides: ["r", "b"] },
    { from: "received", to: "inv" },
    { from: "inv", to: "credit" },
    { from: "credit", to: "inpay", label: "Billing", sides: ["b", "t"] },
    { from: "inpay", to: "paid" },
    { from: "inv", to: "paid", label: "เงินสด/โอน/เช็ค", sides: ["b", "t"] },
  ],
};

const PAY_BEFORE_DIAGRAM: FlowDiagramData = {
  id: "paybefore",
  title: "PO แบบ Pay before Receive: จ่ายเงินก่อน แล้วค่อยรับของ",
  width: 1090,
  height: 130,
  nodes: [
    { id: "wi", x: 20, y: 50, label: "Wait Invoice", sub: "หลัง GM อนุมัติ", tone: "pending" },
    { id: "inv", x: 200, y: 50, label: "Invoice", sub: "สร้างใบแจ้งหนี้", tone: "info" },
    { id: "bp", x: 380, y: 50, label: "Billing / Pay", sub: "Invcredit → Inpay", tone: "pending" },
    { id: "pd", x: 560, y: 50, label: "paid", sub: "จ่ายเงินครบ", tone: "done" },
    { id: "rc", x: 740, y: 50, label: "Receive", sub: "อัตโนมัติ หรือบันทึกเอง", tone: "auto" },
    { id: "PD", x: 920, y: 50, label: "Paid", sub: "จ่ายแล้ว + รับของครบ", tone: "done" },
  ],
  edges: [
    { from: "wi", to: "inv" },
    { from: "inv", to: "bp" },
    { from: "bp", to: "pd" },
    { from: "inv", to: "pd", label: "เงินสด/โอน/เช็ค", sides: ["t", "t"], offset: 26 },
    { from: "pd", to: "rc" },
    { from: "rc", to: "PD" },
  ],
};

const PAYMENT_DIAGRAM: FlowDiagramData = {
  id: "payment",
  title: "Payment Subcontractor: อนุมัติสัญญา แล้วเบิกงวดงาน",
  caption: "ผู้ส่งที่เป็น MD / GM / PM / PCM ข้ามไป Pending Procurement ได้เลย",
  width: 990,
  height: 350,
  nodes: [
    { id: "act", x: 20, y: 40, label: "สร้างสัญญา", sub: "Activate จาก PO SP/DC", tone: "start" },
    { id: "pcm", x: 200, y: 40, label: "Pending CM", sub: "CM อนุมัติ", tone: "pending" },
    { id: "ppm", x: 380, y: 40, label: "Pending PM", sub: "PM / PCM อนุมัติ", tone: "pending" },
    { id: "pproc", x: 560, y: 40, w: 170, label: "Pending Procurement", sub: "Procurement รับทราบ", tone: "pending" },
    { id: "active", x: 780, y: 40, label: "Active", sub: "สัญญาพร้อมเบิก", tone: "approved" },
    { id: "p1", x: 20, y: 180, label: "กรอกงวดงาน", sub: "เลือกรอบวางบิล", tone: "start" },
    { id: "p2", x: 200, y: 180, w: 160, label: "งวดงาน Pending CM", sub: "CM ตรวจ", tone: "pending" },
    { id: "p3", x: 390, y: 180, w: 160, label: "งวดงาน Pending PM", sub: "PM / PCM อนุมัติ", tone: "pending" },
    { id: "p4", x: 580, y: 180, w: 170, label: "Wait Pay", sub: "สร้าง Invoice Draft ให้", tone: "pending" },
    { id: "p5", x: 800, y: 180, w: 170, label: "In Process", sub: "จ่ายแล้ว ยังไม่ครบ 100%", tone: "info" },
    { id: "p6", x: 800, y: 275, w: 170, label: "Paid", sub: "ครบ 100% → Closed PO", tone: "done" },
  ],
  edges: [
    { from: "act", to: "pcm" },
    { from: "pcm", to: "ppm" },
    { from: "ppm", to: "pproc" },
    { from: "pproc", to: "active" },
    { from: "act", to: "pproc", label: "ข้ามขั้น (Role สูง)", kind: "auto", sides: ["t", "t"], offset: 22 },
    { from: "active", to: "p1", label: "เริ่มเบิกงวด", sides: ["b", "t"] },
    { from: "p1", to: "p2" },
    { from: "p2", to: "p3" },
    { from: "p3", to: "p4" },
    { from: "p4", to: "p5" },
    { from: "p4", to: "p6", label: "Pay ครบ", sides: ["b", "l"] },
  ],
};

// ─── Sections ─────────────────────────────────────────────────────────────────
const SECTIONS: ManualSection[] = [
  {
    id: "budget",
    title: "Budget งบประมาณ",
    subtitle: "ตั้งงบราย Cost Code และ Sub-item ให้ MD อนุมัติก่อนนำไปเปิด PR",
    icon: <Wallet size={20} />,
    accent: "from-emerald-600 to-teal-600",
    diagrams: [BUDGET_DIAGRAM],
    steps: [
      { actor: "PM / PCM / Staff", action: "เลือกโครงการที่อยู่สถานะ Prepare Budget แล้วเพิ่มรายการงบตาม Cost Code", result: "Draft", tone: "start" },
      { actor: "ผู้มีสิทธิ์ Submit", action: "ตรวจยอดแล้วกด Submit ส่งให้ MD พิจารณา", result: "Wait MD Approve", tone: "pending" },
      { actor: "MD / Administrator", action: "อนุมัติ หรือปฏิเสธพร้อมระบุเหตุผล", result: "Approved", tone: "approved", note: "ถ้าปฏิเสธจะเป็น Rejected" },
      { actor: "ผู้มีสิทธิ์ Submit", action: "เพิ่ม Sub-item ใต้ Budget ที่ Approved แล้ว และส่งอนุมัติแบบเดียวกัน", result: "Sub-item Approved", tone: "approved" },
    ],
    roles: [
      { role: "MD", duty: "อนุมัติ/ปฏิเสธ Budget และ Sub-item, อนุมัติคำขอแก้ไขงบและ Rev Budget ของโครงการ" },
      { role: "PM", duty: "ขอ Rev Budget ของโครงการ (สถานะคำขอ Pending MD)" },
      { role: "Administrator", duty: "ทำได้ทุกขั้นตอนแทนทุก Role" },
    ],
    notes: [
      "ตั้ง Budget รายการใหม่ได้เฉพาะตอนโครงการเป็น Prepare Budget เมื่อโครงการเป็น Active ระบบจะปิดการตั้งรายการใหม่",
      "ยอดรวม Sub-item ห้ามเกิน Budget หลัก และห้ามลดยอดให้ต่ำกว่ายอดที่ PR ใช้ไปแล้ว",
      "ขอ Rev Budget ของโครงการ: PM/MD ส่งคำขอ → MD อนุมัติ → โครงการกลับเป็น Prepare Budget → แก้ไขแล้ว MD Approve & Revision → กลับเป็น Active",
    ],
  },
  {
    id: "pr",
    title: "PR ใบขอซื้อ / ขอจ้าง",
    subtitle: "ขออนุมัติใช้งบ ก่อนนำไปออกใบสั่งซื้อ",
    icon: <FileText size={20} />,
    accent: "from-sky-600 to-blue-600",
    diagrams: [PR_DIAGRAM, PR_LIFECYCLE_DIAGRAM],
    steps: [
      { actor: "Staff / Procurement / PM / PCM", action: "สร้าง PR เลือก Budget / Cost Code กรอกรายการ จำนวน ราคา แล้วบันทึก", result: "Pending CM", tone: "pending", note: "ระบบสร้าง PDF ให้อัตโนมัติ" },
      { actor: "CM / PM", action: "ตรวจสอบและอนุมัติขั้นที่ 1", result: "Pending PM", tone: "pending" },
      { actor: "PM", action: "อนุมัติขั้นที่ 2", result: "Approved", tone: "approved", note: "PR ประเภท จ้างเหมา > DL จะไป Pending MD" },
      { actor: "MD", action: "อนุมัติ PR สัญญา จ้างเหมา > DL", result: "Approved", tone: "approved" },
      { actor: "Procurement", action: "นำ PR ที่ Approved ไปสร้าง PO", result: "PO Issued", tone: "done" },
    ],
    roles: [
      { role: "Staff / Procurement", duty: "สร้าง PR, แก้ไข PR ที่ถูก Reject หรือ Edit Budget แล้วส่งใหม่" },
      { role: "CM", duty: "อนุมัติ/ปฏิเสธ PR ขั้น Pending CM" },
      { role: "PM", duty: "อนุมัติ PR ขั้น Pending CM และ Pending PM" },
      { role: "MD", duty: "อนุมัติ PR สัญญา จ้างเหมา > DL (Pending MD)" },
      { role: "PCM", duty: "ขอ Edit Budget, ยืนยันปิด PR, อนุมัติเปิด PR กลับ, คืนยอดคงเหลือกลับ Budget" },
      { role: "Administrator", duty: "ทำได้ทุกขั้นตอน" },
    ],
    notes: [
      "ทุกขั้นอนุมัติกด Reject ได้ (ต้องระบุเหตุผล) PR จะเป็น Rejected ให้ผู้สร้างแก้ไขแล้วส่งใหม่เป็น Pending CM",
      "ปุ่มอนุมัติด่วนในรายการงานค้าง (Pending) ขั้น Pending CM ใช้ได้เฉพาะ CM หากเป็น PM ให้อนุมัติจากหน้า PR",
      "คืนยอดที่ไม่ได้ใช้กลับ Budget ได้ หากคืนจนยอด PR เป็นศูนย์ ระบบจะปิดเป็น Closed PR Auto",
      "ถ้าลบ PO ที่อ้างอิง PR อยู่ PR จะกลับเป็น Approved",
    ],
  },
  {
    id: "po",
    title: "PO ใบสั่งซื้อ / สั่งจ้าง",
    subtitle: "ออกใบสั่งซื้อจาก PR และอนุมัติ 2 ขั้น PCM → GM",
    icon: <ShoppingCart size={20} />,
    accent: "from-rose-600 to-pink-600",
    diagrams: [PO_DIAGRAM],
    steps: [
      { actor: "Procurement", action: "สร้าง PO เลือก PR ที่ Approved / PO Issued (Cost Code เดียวกัน) แล้วเลือกรายการ", result: "Draft", tone: "start", note: "กดบันทึกร่างได้" },
      { actor: "Procurement", action: "ตรวจยอด ผู้ขาย Receive Type แล้วกด Submit", result: "Pending PCM", tone: "pending" },
      { actor: "PCM", action: "อนุมัติขั้นที่ 1", result: "Pending GM", tone: "pending" },
      { actor: "GM", action: "อนุมัติขั้นสุดท้าย ระบบเลือกเส้นทางต่อตามการตั้งค่า", result: "Approved / Received / Wait Invoice / Paid", tone: "approved" },
      { actor: "Procurement → PCM", action: "เมื่องานจบ ขอปิด PO แล้วให้ PCM ยืนยัน", result: "Closed PO", tone: "done", note: "ผ่าน Pending Close PO" },
    ],
    roles: [
      { role: "Procurement", duty: "สร้าง/แก้ไข PO ที่เป็น Draft หรือ Rejected, ขอแก้ไข PO, ขอปิด PO" },
      { role: "PCM", duty: "อนุมัติขั้น Pending PCM, อนุญาตแก้ไข PO ที่ยังรอ PCM, ยืนยันปิด PO" },
      { role: "GM", duty: "อนุมัติขั้น Pending GM, อนุญาตแก้ไข PO ที่อนุมัติ/รับของ/ปิดแล้ว" },
      { role: "Administrator", duty: "ทำได้ทุกขั้นตอน รวมถึงเปิด Closed PO กลับมาใช้งาน" },
    ],
    notes: [
      "PR ประเภท จ้างเหมา > DL และ ค่าแรง > DC เลือกมาเปิด PO ได้ตั้งแต่สถานะ Pending PM",
      "PO item ใช้ยอดจาก PR item อื่นใน PR เดียวกันได้ แต่ยอดรวมต้องไม่เกินยอดคงเหลือของ PR",
      "ขอแก้ไข PO: ถ้ายังรอ PCM → PO Edit Pending PCM, ถ้าอนุมัติแล้ว/รับของแล้ว/ปิดแล้ว → PO Edit Pending GM เมื่ออนุญาต PO จะกลับเป็น Draft ให้แก้แล้วส่งใหม่",
      "PO ประเภท SP / DC (งานจ้าง) ไม่ผ่านเมนู Receive แต่ไปทำต่อที่ Payment Subcontractor",
    ],
  },
  {
    id: "receive",
    title: "Receive รับสินค้า / วัสดุ",
    subtitle: "บันทึกของที่รับจริงตาม PO รองรับการรับบางส่วน",
    icon: <PackageCheck size={20} />,
    accent: "from-teal-600 to-cyan-600",
    diagrams: [DOWNSTREAM_DIAGRAM],
    steps: [
      { actor: "PM / PCM / Staff", action: "เข้าเมนู Receive เลือก PO ที่ Approved หรือ Partial Receive", result: "เปิดฟอร์มรับของ", tone: "info" },
      { actor: "PM / PCM / Staff", action: "กรอกจำนวนที่รับจริง วันที่ หมายเหตุ และแนบรูปถ่าย แล้วบันทึก", result: "Partial Receive", tone: "pending", note: "ถ้ายังรับไม่ครบ" },
      { actor: "ระบบ", action: "เมื่อรับครบทุกรายการ อัปเดตสถานะ PO", result: "Received", tone: "done", note: "PO แบบจ่ายก่อนจะเป็น Paid" },
    ],
    roles: [
      { role: "PM / PCM / Staff", duty: "บันทึกการรับของ จำนวน วันที่ รูปถ่าย" },
      { role: "MD / GM", duty: "บันทึกรับของได้ตามสิทธิ์เริ่มต้น" },
      { role: "Admin Site", duty: "เข้าเมนูดูประวัติการรับของได้ แต่บันทึกรับของไม่ได้ (ถ้าไม่ได้เพิ่มสิทธิ์)" },
      { role: "Administrator", duty: "ทำได้ทุกขั้นตอน" },
    ],
    notes: [
      "Receive Type = Receive Auto ระบบสร้าง Receive ครบ 100% ให้ทันทีหลัง GM อนุมัติ ไม่ต้องบันทึกเอง",
      "PO ที่ตั้ง Inventory ระบบจะส่งข้อมูลรับของเข้า CMG Store ถ้าส่งไม่สำเร็จ Receive ยังถูกบันทึกและกดส่งใหม่ (Retry) ได้",
      "การบันทึก Receive ไม่สร้าง Invoice ให้อัตโนมัติ ต้องไปสร้างต่อที่เมนู Invoice",
    ],
  },
  {
    id: "invoice",
    title: "Invoice ใบแจ้งหนี้",
    subtitle: "บันทึกใบแจ้งหนี้จากผู้ขาย ผูกกับ PO และ Receive",
    icon: <FileInput size={20} />,
    accent: "from-violet-600 to-purple-600",
    diagrams: [PAY_BEFORE_DIAGRAM],
    steps: [
      { actor: "PM / PCM / Staff", action: "เข้าเมนู Invoice เลือก PO ที่ Received หรือ Wait Invoice แล้วเลือก Receive ที่จะวางบิล", result: "เลือกรายการ", tone: "info" },
      { actor: "PM / PCM / Staff", action: "กรอกเลขที่ วันที่ ยอดเงิน และประเภทการจ่าย แล้วบันทึก", result: "Invcredit / paid / Deposit", tone: "pending", note: "ยังไม่มีเลขที่ใบแจ้งหนี้ = Draft" },
    ],
    roles: [
      { role: "PM / PCM / Staff", duty: "สร้างและบันทึก Invoice" },
      { role: "MD / GM", duty: "สร้างและดู Invoice ตามสิทธิ์เริ่มต้น" },
      { role: "Administrator", duty: "ทำได้ทุกขั้นตอน รวมถึงแก้ไขประวัติ Invoice" },
    ],
    notes: [
      "ประเภทการจ่าย: เครดิต → Invcredit (ต้องทำ Billing/Pay ต่อ), เงินสด/โอน/เช็ค → paid ทันที, มัดจำ → Deposit",
      "1 PO มีได้หลาย Invoice และเลือก Receive บางส่วนมาวางบิลได้",
      "งวดงาน Payment Subcontractor ที่ถึง Wait Pay ระบบสร้าง Invoice Draft ให้อัตโนมัติ",
      "Invoice ไม่มีขั้นอนุมัติ บันทึกแล้วมีผลทันที",
    ],
  },
  {
    id: "billing",
    title: "Billing & Pay วางบิลและจ่ายเงิน",
    subtitle: "รวม Invoice เครดิตมาวางบิล แล้วบันทึกการจ่าย",
    icon: <CreditCard size={20} />,
    accent: "from-amber-600 to-orange-600",
    diagrams: [],
    steps: [
      { actor: "Procurement", action: "เมนู Billing เลือก Invoice ที่เป็น Invcredit หลายใบมารวมวางบิล", result: "Inpay", tone: "pending", note: "Invoice และ PO เปลี่ยนเป็น Inpay" },
      { actor: "Procurement", action: "เมนู Pay เลือก Billing / Invoice ที่จะจ่าย กรอกเลขที่และวันที่จ่าย", result: "paid", tone: "done" },
      { actor: "ระบบ", action: "PO แบบ Pay before Receive ที่ตั้ง Receive after Payment และจ่ายครบ ระบบสร้าง Receive ให้", result: "Paid", tone: "auto" },
    ],
    roles: [
      { role: "Procurement", duty: "ผู้รับผิดชอบหลักในการวางบิลและบันทึกการจ่าย" },
      { role: "Staff / CM / PM / PCM", duty: "สร้าง/แก้ไข Billing และ Pay ได้ตามสิทธิ์เริ่มต้นของเมนู (ปรับได้ที่ Set Role)" },
      { role: "Administrator", duty: "ทำได้ทุกขั้นตอน" },
    ],
    notes: [
      "ถอด Invoice ออกจาก Billing จะย้อนกลับเป็น Invcredit",
      "ลบหรือแก้ไข Pay ระบบจะย้อนสถานะ Billing, Invoice, Receive อัตโนมัติ และสถานะ PO ให้ครบ",
    ],
  },
  {
    id: "payment",
    title: "Payment Subcontractor จ่ายผู้รับเหมา",
    subtitle: "ทำสัญญาจาก PO งานจ้าง (SP / DC) แล้วเบิกจ่ายเป็นงวด",
    icon: <Users size={20} />,
    accent: "from-orange-600 to-red-600",
    diagrams: [PAYMENT_DIAGRAM],
    steps: [
      { actor: "PM / PCM", action: "Activate PO ประเภท SP/DC ที่ Approved และกรอกข้อมูลสัญญา", result: "Active", tone: "start", note: "PO เป็น PMT In Process" },
      { actor: "ผู้จัดทำ", action: "Submit สัญญาเข้าสายอนุมัติ", result: "Pending CM", tone: "pending", note: "CM ส่ง → Pending PM, Role สูงส่ง → Pending Procurement" },
      { actor: "CM → PM / PCM", action: "อนุมัติสัญญาตามลำดับ", result: "Pending Procurement", tone: "pending" },
      { actor: "Procurement", action: "รับทราบและเปิดใช้สัญญา", result: "Active", tone: "approved" },
      { actor: "Staff / Procurement", action: "กรอกปริมาณงานงวด เลือกรอบวางบิล แล้ว Submit", result: "งวดงาน Pending CM", tone: "pending" },
      { actor: "CM → PM / PCM", action: "CM ตรวจ แล้ว PM/PCM อนุมัติงวดงาน", result: "Wait Pay", tone: "pending", note: "ระบบสร้าง Invoice Draft" },
      { actor: "Procurement / PCM", action: "แนบสลิป Pay-in แล้วกดจ่าย", result: "In Process / Paid", tone: "done", note: "ครบ 100% ปิด PO เป็น Closed PO" },
    ],
    roles: [
      { role: "CM", duty: "อนุมัติสัญญาขั้น Pending CM และตรวจงวดงาน" },
      { role: "PM / PCM", duty: "Activate สัญญา, อนุมัติสัญญาและงวดงานขั้น PM, Complete Job" },
      { role: "Procurement", duty: "รับทราบเปิดใช้สัญญา, บันทึกการจ่าย, Hold" },
      { role: "Administrator", duty: "ทำได้ทุกขั้นตอน" },
    ],
    notes: [
      "ทุกขั้นกด Reject ได้ และขอ Revision ได้ เมื่ออนุมัติคำขอ สัญญาจะกลับเป็น Draft เพื่อแก้ไข",
      "Complete Job (สถานะ In Process): บันทึกประเมินผู้รับเหมา ตั้ง Payment เป็น Paid และปิด PO",
      "Start Next Period: เริ่มงวดถัดไปโดยสะสมยอดเดิม ใช้ได้เมื่อ Paid หรือ In Process",
    ],
  },
];

// ─── Role matrix ──────────────────────────────────────────────────────────────
const MATRIX_COLUMNS = [
  { key: "budget", label: "Budget" },
  { key: "pr", label: "PR" },
  { key: "po", label: "PO" },
  { key: "receive", label: "Receive" },
  { key: "invoice", label: "Invoice" },
  { key: "billing", label: "Billing/Pay" },
  { key: "payment", label: "Payment Sub" },
];

const ROLE_MATRIX = [
  { role: "Staff", budget: "ตั้งงบ", pr: "สร้าง", po: "ดู", receive: "รับของ", invoice: "บันทึก", billing: "บันทึก", payment: "กรอกงวด" },
  { role: "Procurement", budget: "ตั้งงบ", pr: "สร้าง/ขอปิด", po: "สร้าง/ขอปิด", receive: "-", invoice: "-", billing: "บันทึก", payment: "เปิดใช้/จ่าย" },
  { role: "CM", budget: "ตั้งงบ", pr: "อนุมัติขั้น 1", po: "ดู", receive: "-", invoice: "-", billing: "บันทึก", payment: "อนุมัติขั้น CM" },
  { role: "PM", budget: "ตั้งงบ/ขอ Rev", pr: "อนุมัติขั้น 1, 2", po: "ดู", receive: "รับของ", invoice: "บันทึก", billing: "บันทึก", payment: "อนุมัติขั้น PM" },
  { role: "PCM", budget: "ตั้งงบ", pr: "ปิด/เปิดกลับ", po: "อนุมัติขั้น 1", receive: "รับของ", invoice: "บันทึก", billing: "บันทึก", payment: "อนุมัติ/จ่าย" },
  { role: "GM", budget: "ตั้งงบ", pr: "คืนยอด", po: "อนุมัติขั้น 2", receive: "รับของ", invoice: "บันทึก", billing: "บันทึก", payment: "ดู" },
  { role: "MD", budget: "อนุมัติ", pr: "อนุมัติ DL", po: "ดู", receive: "รับของ", invoice: "บันทึก", billing: "บันทึก", payment: "ดู" },
  { role: "Admin Site", budget: "ดู", pr: "-", po: "-", receive: "ดูประวัติ", invoice: "-", billing: "-", payment: "-" },
  { role: "Administrator", budget: "ทั้งหมด", pr: "ทั้งหมด", po: "ทั้งหมด", receive: "ทั้งหมด", invoice: "ทั้งหมด", billing: "ทั้งหมด", payment: "ทั้งหมด" },
];

const cellClass = (val: string) => {
  if (val === "-") return "text-slate-300";
  if (val === "ทั้งหมด") return "text-purple-700 font-bold";
  if (val === "ดู") return "text-slate-500";
  if (val.includes("อนุมัติ")) return "text-green-700 font-semibold";
  return "text-slate-800";
};

// ─── Page parts ───────────────────────────────────────────────────────────────
const scrollToId = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
};

const SectionHeader = ({ icon, accent, title, subtitle }: { icon: React.ReactNode; accent: string; title: string; subtitle: string }) => (
  <div className="flex items-center gap-3 mb-4">
    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${accent} flex items-center justify-center text-white shadow-lg flex-shrink-0`}>
      {icon}
    </div>
    <div className="min-w-0">
      <h2 className="text-lg font-bold text-slate-900 leading-tight">{title}</h2>
      <p className="text-slate-500 text-xs mt-0.5">{subtitle}</p>
    </div>
  </div>
);

const Legend = () => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-center gap-2 mb-3">
      <Tags size={14} className="text-slate-500" />
      <span className="text-xs font-semibold text-slate-700">วิธีอ่านแผนภาพ</span>
    </div>
    <div className="flex flex-wrap gap-2 mb-3">
      {(Object.keys(TONES) as Tone[]).map((tone) => (
        <StatusPill key={tone} label={TONES[tone].name} tone={tone} />
      ))}
    </div>
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-slate-600">
      <span className="flex items-center gap-2">
        <svg width="34" height="8" aria-hidden="true"><line x1="0" y1="4" x2="34" y2="4" stroke={EDGE_COLORS.normal} strokeWidth="2" /></svg>
        ขั้นตอนปกติ
      </span>
      <span className="flex items-center gap-2">
        <svg width="34" height="8" aria-hidden="true"><line x1="0" y1="4" x2="34" y2="4" stroke={EDGE_COLORS.reject} strokeWidth="2" strokeDasharray="5 4" /></svg>
        ปฏิเสธ / ส่งกลับแก้ไข
      </span>
      <span className="flex items-center gap-2">
        <svg width="34" height="8" aria-hidden="true"><line x1="0" y1="4" x2="34" y2="4" stroke={EDGE_COLORS.auto} strokeWidth="2" strokeDasharray="5 4" /></svg>
        ระบบทำให้อัตโนมัติ
      </span>
    </div>
  </div>
);

const SectionBlock = ({ section, index }: { section: ManualSection; index: number }) => (
  <section id={`section-${section.id}`} className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <SectionHeader icon={section.icon} accent={section.accent} title={section.title} subtitle={section.subtitle} />
      <span className="text-[11px] font-bold text-slate-400 mt-1 flex-shrink-0">ขั้นที่ {index + 1}</span>
    </div>

    {section.diagrams.length > 0 && (
      <div className="space-y-4 mb-5">
        {section.diagrams.map((d) => (
          <FlowDiagram key={d.id} data={d} />
        ))}
      </div>
    )}

    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      <div className="lg:col-span-3">
        <div className="flex items-center gap-2 mb-3">
          <Workflow size={14} className="text-blue-600" />
          <h3 className="text-sm font-semibold text-slate-800">ขั้นตอนการใช้งาน</h3>
        </div>
        <StepList steps={section.steps} />
      </div>
      <div className="lg:col-span-2 space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Users size={14} className="text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-800">ใครทำอะไร</h3>
          </div>
          <div className="space-y-2">
            {section.roles.map((r, i) => (
              <div key={i} className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
                <RoleBadge role={r.role} />
                <p className="text-slate-600 text-xs leading-relaxed mt-1.5">{r.duty}</p>
              </div>
            ))}
          </div>
        </div>
        {section.notes && section.notes.length > 0 && <NoteBox notes={section.notes} />}
      </div>
    </div>
  </section>
);

const RoleMatrix = () => (
  <section id="role-matrix" className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <SectionHeader
      icon={<Users size={20} />}
      accent="from-purple-600 to-fuchsia-600"
      title="Role Matrix สรุปสิทธิ์ตาม Role"
      subtitle="สิทธิ์เริ่มต้นของระบบ Administrator ปรับเพิ่ม/ลดได้ที่เมนู Set Role"
    />
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-100 text-slate-600 text-[11px]">
            <th className="px-3 py-2.5 text-left font-semibold sticky left-0 bg-slate-100">Role</th>
            {MATRIX_COLUMNS.map((c) => (
              <th key={c.key} className="px-3 py-2.5 font-semibold whitespace-nowrap">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {ROLE_MATRIX.map((row) => (
            <tr key={row.role} className="bg-white hover:bg-slate-50">
              <td className="px-3 py-2 sticky left-0 bg-white">
                <RoleBadge role={row.role} />
              </td>
              {MATRIX_COLUMNS.map((c) => (
                <td key={c.key} className={`px-3 py-2 text-center whitespace-nowrap ${cellClass(row[c.key])}`}>
                  {row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
);

// ─── Main Component ───────────────────────────────────────────────────────────
const UserManualView = React.memo(() => (
  <div className="min-h-screen bg-slate-50 text-slate-800 px-4 py-6 md:px-8">
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg">
            <BookOpen size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">User Manual</h1>
            <p className="text-slate-500 text-sm">คู่มือการใช้งานระบบ CMG Budget Control ตั้งแต่ตั้งงบจนถึงจ่ายเงิน</p>
          </div>
        </div>

        <nav aria-label="สารบัญคู่มือ" className="flex flex-wrap gap-2 mt-5">
          <button
            onClick={() => scrollToId("overview")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <Workflow size={12} /> ภาพรวม
          </button>
          {SECTIONS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => scrollToId(`section-${s.id}`)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white bg-gradient-to-r ${s.accent} hover:brightness-110 transition`}
            >
              {React.cloneElement(s.icon as React.ReactElement, { size: 12 })}
              {i + 1}. {s.title.split(" ")[0]}
            </button>
          ))}
          <button
            onClick={() => scrollToId("role-matrix")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-purple-500 bg-purple-800 text-white hover:bg-purple-700 transition-colors"
          >
            <Users size={12} /> Role Matrix
          </button>
        </nav>
      </header>

      {/* Overview */}
      <section id="overview" className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <SectionHeader
          icon={<Workflow size={20} />}
          accent="from-blue-600 to-indigo-600"
          title="ภาพรวมการทำงาน"
          subtitle="เอกสารแต่ละใบต้องผ่านขั้นก่อนหน้าให้เรียบร้อยก่อน จึงไปขั้นถัดไปได้"
        />
        <FlowDiagram data={OVERVIEW_DIAGRAM} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <div className="text-xs font-semibold text-emerald-700 mb-1">สินค้า / วัสดุ</div>
            <p className="text-xs text-slate-600 leading-relaxed">PR → PO → Receive → Invoice → Billing → Pay</p>
          </div>
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <div className="text-xs font-semibold text-amber-700 mb-1">จ่ายก่อนรับของ</div>
            <p className="text-xs text-slate-600 leading-relaxed">PR → PO (Wait Invoice) → Invoice → Pay → Receive</p>
          </div>
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <div className="text-xs font-semibold text-orange-700 mb-1">งานจ้างผู้รับเหมา (SP / DC)</div>
            <p className="text-xs text-slate-600 leading-relaxed">PR → PO → Payment Subcontractor → เบิกงวด → จ่ายครบ ปิด PO</p>
          </div>
        </div>
      </section>

      <Legend />

      {SECTIONS.map((section, i) => (
        <SectionBlock key={section.id} section={section} index={i} />
      ))}

      <RoleMatrix />

      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-slate-700 text-xs">
        <AlertCircle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <span className="text-amber-700 font-semibold">หมายเหตุ:</span>{" "}
          <span className="text-purple-700 font-semibold">Administrator</span> ดำเนินการแทนได้ทุก Role ทุกขั้นตอน
          สิทธิ์ในคู่มือนี้คือค่าเริ่มต้นของระบบ ถ้าบริษัทปรับสิทธิ์ที่เมนู{" "}
          <span className="text-slate-900 font-semibold">ผู้ดูแลระบบ (Admin) → Set Role</span> แล้ว ให้ยึดตามที่ตั้งค่าไว้
        </p>
      </div>
    </div>
  </div>
));

export default UserManualView;
