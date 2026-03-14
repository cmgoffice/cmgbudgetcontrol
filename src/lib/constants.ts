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
  budget: ["Administrator", "MD", "GM", "PM", "PCM", "PD", "CM", "Procurement", "Staff"],
  pr: ["Administrator", "MD", "GM", "PM", "PCM", "PD", "CM", "Procurement", "Staff"],
  "pr-table": ["Administrator", "MD", "GM", "PM", "PCM", "PD", "CM", "Procurement", "Staff"],
  po: ["Administrator", "MD", "GM", "PM", "PCM", "PD", "CM", "Procurement", "Staff"],
  "po-table": ["Administrator", "MD", "GM", "PM", "PCM", "PD", "CM", "Procurement", "Staff"],
  vendor: ["Administrator", "MD", "GM", "PM", "PCM", "Procurement", "Staff"],
  material: ["Administrator", "MD", "GM", "PM", "PCM", "Procurement", "Staff"],
  invoice: ["Administrator", "MD", "GM", "PM", "PCM", "Staff"],
  profile: ["Administrator", "MD", "GM", "PM", "PCM", "PD", "CM", "Procurement", "Staff", "Admin Site"],
  admin: ["Administrator"],
};

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
