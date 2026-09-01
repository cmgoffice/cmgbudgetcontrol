import { buildProjectBudgetExportSheets } from "./projectBudgetExport";
import {
  createProjectBudgetDetailWorkbook,
  createProjectBudgetWorkbook,
} from "./projectBudgetWorkbook";
import { strFromU8, unzipSync } from "fflate";

describe("buildProjectBudgetExportSheets", () => {
  it("รวม CostCode ซ้ำและแยกข้อมูลลง Sheet 001-009", () => {
    const budgets = [
      { id: "budget-a", projectId: "project-1", category: "001", code: "001001001", amount: 1000 },
      { id: "budget-b", projectId: "project-1", category: "001", code: "001001001", amount: 500 },
      { id: "budget-c", projectId: "project-1", category: "001", code: "001001002", amount: 250 },
      { id: "budget-d", projectId: "project-1", category: "002", code: "002001001", amount: 900 },
    ];
    const statsByBudgetId = new Map([
      ["budget-a", { poTotal: 400, invoiceTotal: 100 }],
      ["budget-b", { poTotal: 200, invoiceTotal: 50 }],
      ["budget-c", { poTotal: 25, invoiceTotal: 10 }],
      ["budget-d", { poTotal: 300, invoiceTotal: 120 }],
    ]);

    const result = buildProjectBudgetExportSheets(budgets, statsByBudgetId);

    expect(Object.keys(result)).toEqual([
      "001", "002", "003", "004", "005", "006", "007", "008", "009",
    ]);
    expect(result["001"]).toEqual([
      { costCode: "001001001", budgetTotal: 1500, poTotal: 600, invTotal: 150 },
      { costCode: "001001002", budgetTotal: 250, poTotal: 25, invTotal: 10 },
    ]);
    expect(result["002"]).toEqual([
      { costCode: "002001001", budgetTotal: 900, poTotal: 300, invTotal: 120 },
    ]);
    expect(result["009"]).toEqual([]);
  });

  it("ใช้เลข 3 หลักแรกของ CostCode เป็น Sheet หลัก", () => {
    const result = buildProjectBudgetExportSheets(
      [{ id: "budget-a", category: "002", code: "001009001", amount: 99.999 }],
      new Map([["budget-a", { poTotal: 20.555, invoiceTotal: 10.444 }]])
    );

    expect(result["001"][0]).toEqual({
      costCode: "001009001",
      budgetTotal: 100,
      poTotal: 20.56,
      invTotal: 10.44,
    });
    expect(result["002"]).toEqual([]);
  });

  it("สร้างไฟล์ xlsx ที่มี 9 Sheet และเก็บ CostCode เป็นข้อความ", () => {
    const rowsByCategory = buildProjectBudgetExportSheets(
      [{ id: "budget-a", category: "001", code: "001001001", amount: 1500 }],
      new Map([["budget-a", { poTotal: 600, invoiceTotal: 150 }]])
    );
    const workbookFiles = unzipSync(createProjectBudgetWorkbook(rowsByCategory, "โครงการทดสอบ"));
    const workbookXml = strFromU8(workbookFiles["xl/workbook.xml"]);
    const sheet001Xml = strFromU8(workbookFiles["xl/worksheets/sheet1.xml"]);

    expect(Object.keys(workbookFiles).filter((name) => name.startsWith("xl/worksheets/sheet"))).toHaveLength(9);
    ["001", "002", "003", "004", "005", "006", "007", "008", "009"].forEach((sheetName) => {
      expect(workbookXml).toContain(`name="${sheetName}"`);
    });
    expect(sheet001Xml).toContain('<c r="A1" t="inlineStr" s="3"><is><t xml:space="preserve">โครงการทดสอบ</t></is></c>');
    expect(sheet001Xml).toContain('<mergeCell ref="A1:D1"/>');
    expect(sheet001Xml.indexOf("<autoFilter")).toBeLessThan(sheet001Xml.indexOf("<mergeCells"));
    expect(sheet001Xml).toContain('<c r="A3" t="inlineStr"><is><t xml:space="preserve">001001001</t></is></c>');
    expect(sheet001Xml).toContain('<c r="B3" s="2"><v>1500</v></c>');
    expect(sheet001Xml).toContain('<c r="C3" s="2"><v>600</v></c>');
    expect(sheet001Xml).toContain('<c r="D3" s="2"><v>150</v></c>');
  });

  it("สร้างไฟล์รายละเอียดแบบ 3 คอลัมน์ CostCode, PO/INV และ Amount", () => {
    const workbookFiles = unzipSync(createProjectBudgetDetailWorkbook(
      [{ costCode: "001001001", documentNo: "PO-001", amount: 725.5 }],
      "โครงการทดสอบ",
      "001",
      "PO"
    ));
    const workbookXml = strFromU8(workbookFiles["xl/workbook.xml"]);
    const sheetXml = strFromU8(workbookFiles["xl/worksheets/sheet1.xml"]);

    expect(workbookXml).toContain('name="001-PO"');
    expect(sheetXml).toContain('<c r="A2" t="inlineStr" s="1"><is><t xml:space="preserve">CostCode</t></is></c>');
    expect(sheetXml).toContain('<c r="B2" t="inlineStr" s="1"><is><t xml:space="preserve">PO</t></is></c>');
    expect(sheetXml).toContain('<c r="C2" t="inlineStr" s="1"><is><t xml:space="preserve">Amount</t></is></c>');
    expect(sheetXml).toContain('<c r="A3" t="inlineStr"><is><t xml:space="preserve">001001001</t></is></c>');
    expect(sheetXml).toContain('<c r="B3" t="inlineStr"><is><t xml:space="preserve">PO-001</t></is></c>');
    expect(sheetXml).toContain('<c r="C3" s="2"><v>725.5</v></c>');
  });
});
