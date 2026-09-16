// @ts-nocheck
export interface ExportColumnDef {
  key: string;
  label: string;
  defaultSelected?: boolean;
  getValue?: (row: any, index: number, context?: any) => any;
}

/**
 * Escape ค่าสำหรับช่องใน CSV ตามมาตรฐาน RFC 4180
 * หากมีเครื่องหมายจุลภาค (,), เครื่องหมายคำพูด ("), หรือการขึ้นบรรทัดใหม่ (\n, \r)
 * จะครอบด้วยเครื่องหมายคำพูดคู่ และแทนที่ " ด้วย ""
 */
export function escapeCsvValue(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

/**
 * สร้างเนื้อหาไฟล์ CSV พร้อม UTF-8 BOM (\uFEFF)
 * เพื่อให้ Microsoft Excel และโปรแกรมบน Windows แสดงภาษาไทยได้อย่างถูกต้อง
 */
export function generateCsvString(
  columns: ExportColumnDef[],
  rows: any[],
  context?: any
): string {
  if (!columns || columns.length === 0) return "";
  const headerRow = columns.map((col) => escapeCsvValue(col.label)).join(",");
  const dataRows = rows.map((row, idx) =>
    columns
      .map((col) => {
        const val = typeof col.getValue === "function" ? col.getValue(row, idx, context) : row?.[col.key];
        return escapeCsvValue(val);
      })
      .join(",")
  );

  return "\uFEFF" + [headerRow, ...dataRows].join("\r\n");
}

/**
 * สั่งให้เบราว์เซอร์ดาวน์โหลดไฟล์ CSV
 */
export function downloadCsv(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * สร้างชื่อไฟล์ที่ปลอดภัยสำหรับ Export CSV
 */
export function buildExportFileName(prefix: string, tabLabel: string, date: Date = new Date()): string {
  const safePrefix = String(prefix || "export").trim().replace(/[^a-zA-Z0-9_\-\u0E00-\u0E7F]/g, "_");
  const safeTab = String(tabLabel || "all").trim().replace(/[^a-zA-Z0-9_\-\u0E00-\u0E7F]/g, "_");
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${safePrefix}_${safeTab}_${yyyy}-${mm}-${dd}.csv`;
}
