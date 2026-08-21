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
    { key: "clearAll", label: "ล้างงบทั้งหมวด" },
    { key: "import", label: "Import CSV" },
    { key: "recalculate", label: "คำนวณยอดใหม่" },
    { key: "submit", label: "ส่งขออนุมัติ" },
    { key: "requestRevision", label: "ขอแก้ไข (Revise)" },
    { key: "approve",label: "อนุมัติงบประมาณ" },
    { key: "reject", label: "ปฏิเสธงบประมาณ" },
    { key: "allowEdit", label: "อนุญาตแก้ไขงบ" },
    { key: "rejectRevision", label: "ปฏิเสธคำขอแก้ไขงบ" },
    { key: "addSubItem", label: "เพิ่มรายการย่อย" },
    { key: "editSubItem", label: "แก้ไขรายการย่อย" },
    { key: "deleteSubItem", label: "ลบรายการย่อย" },
    { key: "submitSubItem", label: "ส่งอนุมัติรายการย่อย" },
    { key: "requestRevisionSubItem", label: "ขอแก้ไขรายการย่อย" },
    { key: "approveSubItem", label: "อนุมัติรายการย่อย" },
    { key: "rejectSubItem", label: "ปฏิเสธรายการย่อย" },
    { key: "allowEditSubItem", label: "อนุญาตแก้ไขรายการย่อย" },
    { key: "rejectRevisionSubItem", label: "ปฏิเสธคำขอแก้ไขรายการย่อย" },
  ],
  pr: [
    { key: "create",     label: "สร้าง PR" },
    { key: "edit",       label: "แก้ไข PR" },
    { key: "delete",     label: "ลบ PR" },
    { key: "approve",    label: "อนุมัติ PR" },
    { key: "reject",     label: "ปฏิเสธ PR" },
    { key: "editBudget", label: "Edit Budget PR" },
    { key: "viewBalance", label: "ดูคอลัมน์ Balance" },
    { key: "returnBalance", label: "คืนยอด Balance PR" },
    { key: "closePR",    label: "ยืนยัน Close PR" },
    { key: "viewPRType", label: "กำหนด PR Type ที่มองเห็น" },
  ],
  "pr-table": [
    { key: "export",  label: "Export CSV" },
    { key: "email",   label: "ส่ง Email PDF" },
    { key: "download",label: "Download PDF" },
    { key: "viewBalance", label: "ดูคอลัมน์ Balance" },
    { key: "returnBalance", label: "คืนยอด Balance PR" },
    { key: "requestClosePR", label: "ขอปิด PR" },
    { key: "requestActivePR", label: "ขอ Active PR" },
    { key: "approveActivePR", label: "อนุมัติ Active PR" },
  ],
  po: [
    { key: "create",  label: "สร้าง PO" },
    { key: "edit",    label: "แก้ไข PO" },
    { key: "delete",  label: "ลบ PO" },
    { key: "requestRevision", label: "ขอแก้ไข PO (รออนุญาต)" },
    { key: "approve", label: "อนุมัติ PO" },
    { key: "reject", label: "ปฏิเสธ PO" },
    { key: "allowRevision", label: "อนุญาตแก้ไข PO" },
    { key: "denyRevision", label: "ไม่อนุญาตแก้ไข PO" },
    { key: "manualPoOverride", label: "แก้ไขเลข PO ด้วยตนเอง" },
    { key: "closePO", label: "ยืนยัน Close PO" },
  ],
  "po-table": [
    { key: "export",  label: "Export CSV" },
    { key: "email",   label: "ส่ง Email PDF" },
    { key: "download",label: "Download PDF" },
    { key: "delete",  label: "ลบ PO" },
    { key: "returnBudget", label: "คืน Balance PO เข้า Budget" },
    { key: "requestClosePO", label: "ขอปิด PO" },
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
    { key: "edit",    label: "แก้ไข Invoice" },
    { key: "approve", label: "อนุมัติ Invoice" },
    { key: "delete",  label: "ลบ Invoice" },
  ],
  receive: [
    { key: "receive",     label: "ทำรับของ" },
    { key: "viewHistory", label: "ดูประวัติรับของ" },
    { key: "delete",      label: "ลบ Receive" },
  ],
  billing: [
    { key: "create", label: "สร้าง Billing" },
    { key: "edit",   label: "แก้ไข Billing" },
    { key: "delete", label: "ลบ Billing" },
  ],
  pay: [
    { key: "create", label: "สร้าง Pay" },
    { key: "edit",   label: "แก้ไข Pay" },
    { key: "delete", label: "ลบ Pay" },
  ],
  "payment-subcontract": [
    { key: "create",          label: "สร้าง Payment" },
    { key: "edit",            label: "แก้ไข Payment" },
    { key: "delete",          label: "ลบ Payment" },
    { key: "submit",          label: "ส่งให้ CM ตรวจสอบ" },
    { key: "approveFlow",     label: "อนุมัติ Payment" },
    { key: "rejectFlow",      label: "ปฏิเสธ Payment" },
    { key: "requestRevision", label: "ขอแก้ไข (ส่งกลับ)" },
    { key: "approveRevision", label: "อนุมัติคำขอแก้ไข" },
    { key: "rejectRevision",  label: "ปฏิเสธคำขอแก้ไข" },
    { key: "savePeriodDraft", label: "บันทึก Draft งวดงาน" },
    { key: "submitPeriod",    label: "บันทึกงวดงานส่งอนุมัติ" },
    { key: "approvePeriod",   label: "อนุมัติงวดงาน" },
    { key: "pay",             label: "จ่ายเงิน (Pay)" },
    { key: "hold",            label: "Hold Payment" },
    { key: "completeJob",     label: "จบงาน" },
    { key: "startNextPeriod", label: "เปิดงวดถัดไป" },
  ],
  "budget-summary": [
    { key: "export", label: "Export Budget Summary" },
  ],
  "project-spending": [],
  "user-manual": [],
  profile: [
    { key: "editProfile",     label: "แก้ไขข้อมูลโปรไฟล์" },
    { key: "resetPassword",   label: "รีเซ็ตรหัสผ่าน" },
    { key: "uploadSignature", label: "อัปโหลดลายเซ็น" },
    { key: "removeSignature", label: "ลบลายเซ็น" },
  ],
  admin: [
    { key: "userManagement",      label: "เปิดแท็บ User Management" },
    { key: "approveUser",         label: "อนุมัติผู้ใช้งาน" },
    { key: "manageUser",          label: "จัดการผู้ใช้งาน" },
    { key: "deleteUser",          label: "ลบผู้ใช้งาน" },
    { key: "viewLogs",            label: "เปิดแท็บ System Logs" },
    { key: "exportLogs",          label: "Export Logs" },
    { key: "setRole",             label: "เปิดแท็บ Set Role" },
    { key: "addRole",             label: "เพิ่ม Role" },
    { key: "saveRolePermissions", label: "บันทึกสิทธิ์ Role" },
  ],
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
  "Admin Center",
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
  billing: ["Administrator", "MD", "GM", "PM", "PCM", "PD", "CM", "Procurement", "Staff"],
  pay: ["Administrator", "MD", "GM", "PM", "PCM", "PD", "CM", "Procurement", "Staff"],
  "payment-subcontract": ["Administrator", "MD", "GM", "PM", "PCM", "PD", "CM", "Procurement", "Staff"],
  profile: ["Administrator", "MD", "GM", "PM", "PCM", "PD", "CM", "Procurement", "Staff", "Admin Site"],
  admin: ["Administrator"],
  "budget-summary": ["Administrator", "MD", "GM"],
  "project-spending": ["Administrator", "MD", "GM"],
  "user-manual": ["Administrator", "MD", "GM", "PM", "PCM", "PD", "CM", "Procurement", "Staff", "Admin Site"],
};

/**
 * รวมข้อมูล functionPermissions จาก Firestore กับกฎสิทธิ์เขียน
 * - เมนูที่ยังไม่มีใน Firestore → ใช้ default ตามฟังก์ชัน
 * - เมนูที่บันทึกใน Firestore แล้ว → ฟังก์ชันที่มี key ใช้ค่าจริง; ฟังก์ชันที่ไม่มี key = default/fallback
 * - รองรับ migration key เก่า closePR/closePO จาก pr-table/po-table → requestClosePR/requestClosePO
 */
export function mergeFunctionPermissionsWithDefaults(
  raw: Record<string, Record<string, string[] | undefined> | undefined>
): Record<string, Record<string, string[]>> {
  const out: Record<string, Record<string, string[]>> = {};
  const pickFallbackRoles = (
    moduleKey: string,
    candidates: string[] = []
  ): string[] | undefined => {
    const rawModule = raw[moduleKey];
    if (rawModule == null || typeof rawModule !== "object") return undefined;
    for (const candidate of candidates) {
      if (Object.prototype.hasOwnProperty.call(rawModule, candidate)) {
        const value = rawModule[candidate];
        return Array.isArray(value) ? [...value] : [];
      }
    }
    return undefined;
  };
  const defaultByModuleAndKey: Record<string, Record<string, string[]>> = {
    pr: {
      viewBalance: ["PCM", "GM", "MD"],
      returnBalance: ["PCM", "GM", "MD"],
      closePR: ["PCM"],
    },
    "pr-table": {
      viewBalance: ["PCM", "GM", "MD"],
      returnBalance: ["PCM", "GM", "MD"],
      requestClosePR: ["Procurement"],
      requestActivePR: ["Procurement", "PCM"],
      approveActivePR: ["PCM"],
    },
    po: {
      closePO: ["PCM"],
    },
    "po-table": {
      returnBudget: ["PCM", "GM", "MD"],
      requestClosePO: ["Procurement"],
    },
    "payment-subcontract": {
      completeJob: ["PM", "CM"],
    },
    invoice: {
      edit: ["Administrator"],
    },
  };
  const fallbackKeyByModuleAndKey: Record<string, Record<string, string[]>> = {
    budget: {
      clearAll: ["delete"],
      recalculate: ["edit"],
      reject: ["approve"],
      allowEdit: ["approve"],
      rejectRevision: ["approve"],
      addSubItem: ["add"],
      editSubItem: ["edit"],
      deleteSubItem: ["delete"],
      submitSubItem: ["submit"],
      requestRevisionSubItem: ["requestRevision"],
      approveSubItem: ["approve"],
      rejectSubItem: ["approve"],
      allowEditSubItem: ["approve"],
      rejectRevisionSubItem: ["approve"],
    },
    pr: {
      reject: ["approve"],
    },
    "pr-table": {
      requestClosePR: ["closePR"],
    },
    po: {
      reject: ["approve"],
      allowRevision: ["approve"],
      denyRevision: ["approve"],
    },
    "po-table": {
      requestClosePO: ["closePO"],
    },
    "payment-subcontract": {
      rejectFlow: ["approveFlow"],
      approveRevision: ["approveFlow", "requestRevision"],
      rejectRevision: ["approveFlow", "requestRevision"],
      savePeriodDraft: ["submit"],
      submitPeriod: ["submit"],
      approvePeriod: ["approveFlow"],
      hold: ["pay"],
      completeJob: ["approvePeriod"],
      startNextPeriod: ["submit"],
    },
  };
  Object.keys(MODULE_FUNCTIONS).forEach((moduleKey) => {
    const funcList = MODULE_FUNCTIONS[moduleKey];
    if (!funcList?.length) return;
    const rawMod = raw[moduleKey];
    out[moduleKey] = {};
    if (rawMod == null || typeof rawMod !== "object") {
      funcList.forEach(({ key }) => {
        const defaultRoles = defaultByModuleAndKey[moduleKey]?.[key] || MODULE_ACCESS[moduleKey] || [];
        out[moduleKey][key] = [...defaultRoles];
      });
      return;
    }
    funcList.forEach(({ key }) => {
      if (Object.prototype.hasOwnProperty.call(rawMod, key)) {
        const v = rawMod[key];
        out[moduleKey][key] = Array.isArray(v) ? [...v] : [];
      } else {
        const fallback = pickFallbackRoles(moduleKey, fallbackKeyByModuleAndKey[moduleKey]?.[key] || []);
        const defaultRoles = defaultByModuleAndKey[moduleKey]?.[key] || MODULE_ACCESS[moduleKey] || [];
        out[moduleKey][key] = Array.isArray(fallback) ? [...fallback] : [...defaultRoles];
      }
    });
  });

  // Preserve custom keys that are not in MODULE_FUNCTIONS (e.g., viewPRTypeByRole)
  Object.keys(raw).forEach((moduleKey) => {
    const rawMod = raw[moduleKey];
    if (rawMod == null || typeof rawMod !== "object") return;
    if (!out[moduleKey]) out[moduleKey] = {};
    Object.keys(rawMod).forEach((key) => {
      // Skip keys already processed above
      if (Object.prototype.hasOwnProperty.call(out[moduleKey], key)) return;
      const v = rawMod[key];
      out[moduleKey][key] = Array.isArray(v) ? [...v] : [];
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
  "รายจ่ายธนาคาร > INW",
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
  "รายจ่ายธนาคาร > INW": ["INW"],
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
