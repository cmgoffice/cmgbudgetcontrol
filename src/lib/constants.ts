// --- Constants & Config ---
export const COST_CATEGORIES: Record<string, string> = {
  "001": "ค่าจัดเตรียมงาน (Preparation Cost)",
  "002": "รายจ่ายประจำ ในหน่วยงาน (Site Overhead)",
  "003": "ค่าวัสดุจัดหาโดย บริษัท (Material by CMG)",
  "004": "ค่าแรง (Labour Cost)",
  "005": "ค่าเครื่องจักร (Machine Cost)",
  "006": "ผู้รับเหมาย่อย รายพิเศษ (Sub Contractor)",
  "007": "ค่าใช้จ่ายบริหาร (Management Salary)",
  "008": "ความปลอดภัย (Safety Cost)",
  "009": "งานสำรวจ (Survey Cost)",
};

/** ขอแก้ไข PO — รอ PCM / GM อนุญาต (เก็บ poEditRevisionResumeStatus = สถานะก่อนขอ) */
export const PO_REVISION_PENDING_PCM = "PO Edit Pending PCM";
export const PO_REVISION_PENDING_GM = "PO Edit Pending GM";

/** PR ขอ Active คืน — รอ PCM อนุมัติ */
export const PR_PENDING_ACTIVE = "Pending Active PR";

/** สถานะที่ขอแก้ไข PO ได้ → ผู้อนุมัติ (PCM หรือ GM) */
export function getPORevisionFlow(status: string): { pendingStatus: string; approverRoles: string[] } | null {
  if (status === "Pending PCM") return { pendingStatus: PO_REVISION_PENDING_PCM, approverRoles: ["PCM", "Administrator"] };
  if (status === "Pending GM") return { pendingStatus: PO_REVISION_PENDING_GM, approverRoles: ["GM", "Administrator"] };
  if (status === "Approved" || status === "Closed PO" || status === "Received") return { pendingStatus: PO_REVISION_PENDING_GM, approverRoles: ["GM", "Administrator"] };
  return null;
}

/** ฟังก์ชันที่สามารถกำหนดสิทธิ์แยกได้ในแต่ละเมนู */
export const MODULE_FUNCTIONS: Record<string, { key: string; label: string }[]> = {
  dashboard: [],
  projects: [
    { key: "add",    label: "เพิ่มโครงการ" },
    { key: "edit",   label: "แก้ไขโครงการ" },
    { key: "delete", label: "ลบโครงการ" },
  ],
  budget: [
    { key: "add",    label: "ตั้งงบประมาณ" },
    { key: "edit",   label: "แก้ไขงบประมาณ" },
    { key: "delete", label: "ลบงบประมาณ" },
    { key: "import", label: "Import CSV" },
    { key: "submit", label: "ส่งขออนุมัติ" },
    { key: "requestRevision", label: "ขอแก้ไข (Revise)" },
    { key: "approve",label: "อนุมัติ / ปฏิเสธ" },
  ],
  pr: [
    { key: "create",     label: "สร้าง PR" },
    { key: "edit",       label: "แก้ไข PR" },
    { key: "delete",     label: "ลบ PR" },
    { key: "approve",    label: "อนุมัติ / ปฏิเสธ PR" },
    { key: "editBudget", label: "Edit Budget PR" },
  ],
  "pr-table": [
    { key: "export",  label: "Export CSV" },
    { key: "email",   label: "ส่ง Email PDF" },
    { key: "download",label: "Download PDF" },
    { key: "closePR", label: "ขอปิด / ยืนยันปิด PR" },
  ],
  po: [
    { key: "create",  label: "สร้าง PO" },
    { key: "edit",    label: "แก้ไข PO" },
    { key: "delete",  label: "ลบ PO" },
    { key: "requestRevision", label: "ขอแก้ไข PO (รออนุญาต)" },
    { key: "approve", label: "อนุมัติ / ปฏิเสธ PO" },
  ],
  "po-table": [
    { key: "export",  label: "Export CSV" },
    { key: "email",   label: "ส่ง Email PDF" },
    { key: "download",label: "Download PDF" },
    { key: "delete",  label: "ลบ PO" },
    { key: "closePO", label: "ขอปิด / ยืนยันปิด PO" },
  ],
  vendor: [
    { key: "add",    label: "เพิ่ม Vendor" },
    { key: "edit",   label: "แก้ไข Vendor" },
    { key: "delete", label: "ลบ Vendor" },
    { key: "import", label: "Import CSV" },
  ],
  material: [
    { key: "add",    label: "เพิ่ม Material" },
    { key: "edit",   label: "แก้ไข Material" },
    { key: "delete", label: "ลบ Material" },
    { key: "import", label: "Import CSV" },
  ],
  invoice: [
    { key: "add",     label: "รับ Invoice" },
    { key: "approve", label: "อนุมัติ Invoice" },
    { key: "delete",  label: "ลบ Invoice" },
  ],
  receive: [
    { key: "receive",     label: "ทำรับของ" },
    { key: "viewHistory", label: "ดูประวัติรับของ" },
    { key: "delete",      label: "ลบ Receive" },
  ],
  "payment-subcontract": [
    { key: "create",          label: "สร้าง Payment" },
    { key: "edit",            label: "แก้ไข Payment" },
    { key: "delete",          label: "ลบ Payment" },
    { key: "submit",          label: "ส่งให้ CM ตรวจสอบ" },
    { key: "approveFlow",     label: "อนุมัติ / ปฏิเสธ (CM/PM)" },
    { key: "pay",             label: "จ่ายเงิน (Pay / Hold)" },
    { key: "requestRevision", label: "ขอแก้ไข (ส่งกลับ)" },
  ],
  profile: [],
};

export const USER_ROLES = [
  "Administrator",
  "MD",
  "GM",
  "PM",
  "PCM",
  "PD",
  "CM",
  "Procurement",
  "Staff",
  "Admin Site",
];

/** สิทธิ์เข้าเมนูตาม role — ถ้ามีหลาย role ได้สิทธิ์รวมทุก role */
export const MODULE_ACCESS: Record<string, string[]> = {
  dashboard: ["Administrator", "MD", "GM", "PM", "PCM", "PD", "CM", "Procurement", "Staff", "Admin Site"],
  projects: ["Administrator", "MD", "GM", "PM", "PCM", "PD", "CM", "Admin Site"],
  budget: ["Administrator", "MD", "GM", "PM", "PCM", "PD", "CM", "Procurement", "Staff", "Admin Site"],
  pr: ["Administrator", "MD", "GM", "PM", "PCM", "PD", "CM", "Procurement", "Staff"],
  "pr-table": ["Administrator", "MD", "GM", "PM", "PCM", "PD", "CM", "Procurement", "Staff"],
  po: ["Administrator", "MD", "GM", "PM", "PCM", "PD", "CM", "Procurement", "Staff"],
  "po-table": ["Administrator", "MD", "GM", "PM", "PCM", "PD", "CM", "Procurement", "Staff"],
  vendor: ["Administrator", "MD", "GM", "PM", "PCM", "Procurement", "Staff"],
  material: ["Administrator", "MD", "GM", "PM", "PCM", "Procurement", "Staff"],
  invoice: ["Administrator", "MD", "GM", "PM", "PCM", "Staff"],
  receive: ["Administrator", "MD", "GM", "PM", "PCM", "Staff"],
  "payment-subcontract": ["Administrator", "MD", "GM", "PM", "PCM", "PD", "CM", "Procurement", "Staff"],
  profile: ["Administrator", "MD", "GM", "PM", "PCM", "PD", "CM", "Procurement", "Staff", "Admin Site"],
  admin: ["Administrator"],
};

/**
 * รวมข้อมูล functionPermissions จาก Firestore กับกฎสิทธิ์เขียน
 * - เมนูที่ยังไม่มีใน Firestore → ทุกฟังก์ชันได้สิทธิ์เท่า Role ที่มีสิทธิ์อ่าน (MODULE_ACCESS) เหมือนระบบเก่า
 * - เมนูที่บันทึกใน Firestore แล้ว → ฟังก์ชันที่มี key ใช้ค่าจริง; ฟังก์ชันที่ไม่มี key = [] (ไม่เห็นปุ่ม)
 */
export function mergeFunctionPermissionsWithDefaults(
  raw: Record<string, Record<string, string[] | undefined> | undefined>
): Record<string, Record<string, string[]>> {
  const out: Record<string, Record<string, string[]>> = {};
  Object.keys(MODULE_FUNCTIONS).forEach((moduleKey) => {
    const funcList = MODULE_FUNCTIONS[moduleKey];
    if (!funcList?.length) return;
    const readRoles = [...(MODULE_ACCESS[moduleKey] || [])];
    const rawMod = raw[moduleKey];
    out[moduleKey] = {};
    if (rawMod == null || typeof rawMod !== "object") {
      funcList.forEach(({ key }) => {
        out[moduleKey][key] = [...readRoles];
      });
      return;
    }
    funcList.forEach(({ key }) => {
      if (Object.prototype.hasOwnProperty.call(rawMod, key)) {
        const v = rawMod[key];
        out[moduleKey][key] = Array.isArray(v) ? [...v] : [];
      } else {
        out[moduleKey][key] = [];
      }
    });
  });
  return out;
}

export const PURCHASE_TYPES = [
  "จัดซื้อ > WA, ST, ML, CS, SA",
  "อุปกรณ์ใหม่ > EQM",
  "ขอเช่า > RE",
  "จ้างเหมา > DL",
  "เงินสดย่อย > PT",
  "คอนกรีต > CC",
  "น้ำมัน > OL",
  "ค่าแรง > DC",
  "เงินเดือน > SM",
];

export const PURCHASE_TYPE_CODES: Record<string, string[]> = {
  "จัดซื้อ > WA, ST, ML, CS, SA": ["WA", "ST", "ML", "CS", "SA"],
  "อุปกรณ์ใหม่ > EQM": ["WA", "ST", "ML", "CS", "SA"],
  "ขอเช่า > RE": ["RT", "RI"],
  "จ้างเหมา > DL": ["DL"],
  "เงินสดย่อย > PT": ["PT"],
  "คอนกรีต > CC": ["CC"],
  "น้ำมัน > OL": ["OL"],
  "ค่าแรง > DC": ["DC"],
  "เงินเดือน > SM": ["SM"],
  // backward compat: existing PRs saved with old keys
  "จัดซื้อจัดจ้าง > WA, ST, ML, CS, SA": ["WA", "ST", "ML", "CS", "SA"],
  "ขอซื้อเช่า > RE": ["RT", "RI"],
  "ค่าแรง/เงินเดือน > SM, DC": ["SM", "DC"],
};

// แสดงเฉพาะชื่อประเภท (ไม่แสดง Sub-Code) ใน dropdown
export const getPurchaseTypeDisplayLabel = (key: string) =>
  key && key.includes(" > ") ? key.split(" > ")[0].trim() : key || "";

export const PURCHASE_TYPE_RENTAL_LABEL = "ขอเช่า > RE";
export const PURCHASE_TYPE_EQUIPMENT = "อุปกรณ์ใหม่ > EQM";

export const DELIVERY_LOCATIONS = [
  "Headoffice",
  "Workshop สโตร์กลางฝากรับของ",
  "Workshop สั่งให้ทำงาน",
  "จัดส่งเข้าโครงการทันที",
];
