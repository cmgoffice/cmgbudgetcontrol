import { strToU8, zipSync } from "fflate";
import { COST_CATEGORIES } from "./constants";
import {
  PROJECT_BUDGET_EXPORT_HEADERS,
  ProjectBudgetExportRow,
} from "./projectBudgetExport";

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const SPREADSHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const RELATIONSHIP_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_RELATIONSHIP_NS = "http://schemas.openxmlformats.org/package/2006/relationships";

const escapeXml = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

const textCell = (ref: string, value: unknown, style = 0) =>
  `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ""}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;

const numberCell = (ref: string, value: number) =>
  `<c r="${ref}" s="2"><v>${Number(value) || 0}</v></c>`;

const buildWorksheetXml = (rows: ProjectBudgetExportRow[], projectName: string) => {
  const lastRow = Math.max(rows.length + 2, 2);
  const headerCells = PROJECT_BUDGET_EXPORT_HEADERS
    .map((header, index) => textCell(`${String.fromCharCode(65 + index)}2`, header, 1))
    .join("");
  const dataRows = rows.map((row, index) => {
    const rowNumber = index + 3;
    return `<row r="${rowNumber}">${[
      textCell(`A${rowNumber}`, row.costCode),
      numberCell(`B${rowNumber}`, row.budgetTotal),
      numberCell(`C${rowNumber}`, row.poTotal),
      numberCell(`D${rowNumber}`, row.invTotal),
    ].join("")}</row>`;
  }).join("");

  return `${XML_HEADER}<worksheet xmlns="${SPREADSHEET_NS}">
    <dimension ref="A1:D${lastRow}"/>
    <sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A3" sqref="A3"/></sheetView></sheetViews>
    <sheetFormatPr defaultRowHeight="15"/>
    <cols><col min="1" max="1" width="18" customWidth="1"/><col min="2" max="4" width="18" customWidth="1"/></cols>
    <sheetData><row r="1" ht="26" customHeight="1">${textCell("A1", projectName, 3)}</row><row r="2" ht="22" customHeight="1">${headerCells}</row>${dataRows}</sheetData>
    <autoFilter ref="A2:D${lastRow}"/>
    <mergeCells count="1"><mergeCell ref="A1:D1"/></mergeCells>
    <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
  </worksheet>`;
};

const buildStylesXml = () => `${XML_HEADER}<styleSheet xmlns="${SPREADSHEET_NS}">
  <fonts count="3">
    <font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>
    <font><b/><sz val="14"/><color rgb="FF1E293B"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF047857"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

type WorkbookSheet = { name: string; xml: string };

const createWorkbookArchive = (worksheets: WorkbookSheet[]): Uint8Array => {
  const workbookSheets = worksheets.map((worksheet, index) =>
    `<sheet name="${escapeXml(worksheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
  ).join("");
  const worksheetRelationships = worksheets.map((_, index) =>
    `<Relationship Id="rId${index + 1}" Type="${RELATIONSHIP_NS}/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
  ).join("");
  const worksheetContentTypes = worksheets.map((_, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join("");

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
      <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
      ${worksheetContentTypes}
    </Types>`),
    "_rels/.rels": strToU8(`${XML_HEADER}<Relationships xmlns="${PACKAGE_RELATIONSHIP_NS}">
      <Relationship Id="rId1" Type="${RELATIONSHIP_NS}/officeDocument" Target="xl/workbook.xml"/>
    </Relationships>`),
    "xl/workbook.xml": strToU8(`${XML_HEADER}<workbook xmlns="${SPREADSHEET_NS}" xmlns:r="${RELATIONSHIP_NS}">
      <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="18000"/></bookViews>
      <sheets>${workbookSheets}</sheets>
    </workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`${XML_HEADER}<Relationships xmlns="${PACKAGE_RELATIONSHIP_NS}">
      ${worksheetRelationships}
      <Relationship Id="rId${worksheets.length + 1}" Type="${RELATIONSHIP_NS}/styles" Target="styles.xml"/>
    </Relationships>`),
    "xl/styles.xml": strToU8(buildStylesXml()),
  };

  worksheets.forEach((worksheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(worksheet.xml);
  });

  return zipSync(files, { level: 6 });
};

/** สร้างไฟล์ Open XML Workbook (.xlsx) ที่มี Sheet 001-009 */
export function createProjectBudgetWorkbook(
  rowsByCategory: Record<string, ProjectBudgetExportRow[]>,
  projectName: string
): Uint8Array {
  const worksheets = Object.keys(COST_CATEGORIES).map((category) => ({
    name: category,
    xml: buildWorksheetXml(rowsByCategory[category] || [], projectName),
  }));
  return createWorkbookArchive(worksheets);
}

export type ProjectBudgetDetailType = "PO" | "INV";
export type ProjectBudgetDetailRow = {
  costCode: string;
  documentNo: string;
  amount: number;
};

const buildDetailWorksheetXml = (
  rows: ProjectBudgetDetailRow[],
  projectName: string,
  detailType: ProjectBudgetDetailType
) => {
  const lastRow = Math.max(rows.length + 2, 2);
  const headers = ["CostCode", detailType, "Amount"];
  const headerCells = headers
    .map((header, index) => textCell(`${String.fromCharCode(65 + index)}2`, header, 1))
    .join("");
  const dataRows = rows.map((row, index) => {
    const rowNumber = index + 3;
    return `<row r="${rowNumber}">${[
      textCell(`A${rowNumber}`, row.costCode),
      textCell(`B${rowNumber}`, row.documentNo),
      numberCell(`C${rowNumber}`, row.amount),
    ].join("")}</row>`;
  }).join("");

  return `${XML_HEADER}<worksheet xmlns="${SPREADSHEET_NS}">
    <dimension ref="A1:C${lastRow}"/>
    <sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A3" sqref="A3"/></sheetView></sheetViews>
    <sheetFormatPr defaultRowHeight="15"/>
    <cols><col min="1" max="1" width="18" customWidth="1"/><col min="2" max="2" width="28" customWidth="1"/><col min="3" max="3" width="18" customWidth="1"/></cols>
    <sheetData><row r="1" ht="26" customHeight="1">${textCell("A1", projectName, 3)}</row><row r="2" ht="22" customHeight="1">${headerCells}</row>${dataRows}</sheetData>
    <autoFilter ref="A2:C${lastRow}"/>
    <mergeCells count="1"><mergeCell ref="A1:C1"/></mergeCells>
    <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
  </worksheet>`;
};

/** สร้างไฟล์รายละเอียด CostCode + PO หรือ CostCode + INV ของหมวดเดียว */
export function createProjectBudgetDetailWorkbook(
  rows: ProjectBudgetDetailRow[],
  projectName: string,
  category: string,
  detailType: ProjectBudgetDetailType
): Uint8Array {
  return createWorkbookArchive([{
    name: `${category}-${detailType}`,
    xml: buildDetailWorksheetXml(rows, projectName, detailType),
  }]);
}
