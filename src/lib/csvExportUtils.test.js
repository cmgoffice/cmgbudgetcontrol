import {
  escapeCsvValue,
  generateCsvString,
  downloadCsv,
  buildExportFileName,
} from "./csvExportUtils";

describe("csvExportUtils", () => {
  describe("escapeCsvValue", () => {
    it("escapes null or undefined as empty quotes", () => {
      expect(escapeCsvValue(null)).toBe('""');
      expect(escapeCsvValue(undefined)).toBe('""');
    });

    it("returns regular string wrapped in quotes", () => {
      expect(escapeCsvValue("PO-2026-001")).toBe('"PO-2026-001"');
      expect(escapeCsvValue(1234.5)).toBe('"1234.5"');
    });

    it("escapes strings with commas, quotes, and newlines properly", () => {
      expect(escapeCsvValue("Item 1, Item 2")).toBe('"Item 1, Item 2"');
      expect(escapeCsvValue('Test "Quote"')).toBe('"Test ""Quote"""');
      expect(escapeCsvValue("Line 1\nLine 2")).toBe('"Line 1\nLine 2"');
    });

    it("handles Thai characters correctly", () => {
      expect(escapeCsvValue("อนุมัติแล้ว")).toBe('"อนุมัติแล้ว"');
    });
  });

  describe("generateCsvString", () => {
    it("returns empty string if columns are empty", () => {
      expect(generateCsvString([], [{ id: 1 }])).toBe("");
    });

    it("prepends UTF-8 BOM \\uFEFF and formats header and rows with \\r\\n", () => {
      const columns = [
        { key: "no", label: "เลขที่ PO" },
        { key: "vendor", label: "ผู้ขาย" },
        { key: "amount", label: "ยอดเงิน", getValue: (r) => Number(r.amount).toFixed(2) },
      ];
      const rows = [
        { no: "PO-001", vendor: "บจก. สยามพาณิชย์", amount: 1500 },
        { no: "PO-002", vendor: 'บจก. "ทู" เทรดดิ้ง, กรุงเทพ', amount: 2300.5 },
      ];

      const csv = generateCsvString(columns, rows);

      expect(csv.startsWith("\uFEFF")).toBe(true);
      const lines = csv.slice(1).split("\r\n");
      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe('"เลขที่ PO","ผู้ขาย","ยอดเงิน"');
      expect(lines[1]).toBe('"PO-001","บจก. สยามพาณิชย์","1500.00"');
      expect(lines[2]).toBe('"PO-002","บจก. ""ทู"" เทรดดิ้ง, กรุงเทพ","2300.50"');
    });

    it("supports reordering and filtering of columns", () => {
      const fullColumns = [
        { key: "no", label: "PO No." },
        { key: "status", label: "Status" },
        { key: "project", label: "Project" },
      ];
      const reorderedColumns = [
        fullColumns[2], // Project first
        fullColumns[0], // PO No. second
      ];
      const rows = [{ no: "PO-100", status: "Approved", project: "Project Alpha" }];

      const csv = generateCsvString(reorderedColumns, rows);
      const lines = csv.slice(1).split("\r\n");
      expect(lines[0]).toBe('"Project","PO No."');
      expect(lines[1]).toBe('"Project Alpha","PO-100"');
    });
  });

  describe("downloadCsv", () => {
    let originalCreateObjectURL;
    let originalRevokeObjectURL;

    beforeEach(() => {
      originalCreateObjectURL = URL.createObjectURL;
      originalRevokeObjectURL = URL.revokeObjectURL;
      URL.createObjectURL = jest.fn(() => "blob:mock-url");
      URL.revokeObjectURL = jest.fn();
    });

    afterEach(() => {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    });

    it("creates blob url, triggers download link click, and revokes url", () => {
      const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      const appendChildSpy = jest.spyOn(document.body, "appendChild");
      const removeChildSpy = jest.spyOn(document.body, "removeChild");

      downloadCsv("test.csv", "\uFEFFheader1,header2\r\nval1,val2");

      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(appendChildSpy).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");

      clickSpy.mockRestore();
      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
    });
  });

  describe("buildExportFileName", () => {
    it("formats filename with prefix, tab label, and YYYY-MM-DD", () => {
      const date = new Date(2026, 8, 16); // month is 0-indexed: 8 = Sep
      const filename = buildExportFileName("Log_PO", "CR", date);
      expect(filename).toBe("Log_PO_CR_2026-09-16.csv");
    });

    it("sanitizes spaces and special characters in prefix and tab", () => {
      const date = new Date(2026, 8, 16);
      const filename = buildExportFileName("Log PO", "All Types / CR", date);
      expect(filename).toBe("Log_PO_All_Types___CR_2026-09-16.csv");
    });
  });
});
