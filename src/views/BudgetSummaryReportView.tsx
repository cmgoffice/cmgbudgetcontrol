// @ts-nocheck
import React, { useMemo } from "react";
import { Download } from "lucide-react";
import { useAppData } from "../contexts/AppDataContext";
import { getProjectPayHistoryTotal } from "../lib/billingPayUtils";
import { getPoAmountExVat } from "../lib/poDiscount";

const fmt = (v: number) =>
  v === 0 ? "" : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const BudgetSummaryReportView = React.memo(() => {
  const { projects, budgets, prs, pos, invoices, payments, canUseFunction } = useAppData();
  const canExport = canUseFunction("budget-summary", "export");

  const rows = useMemo(() => {
    return projects
      .filter((p) => p.status !== "Cancelled")
      .map((proj) => {
        const projBudgets = budgets.filter(
          (b) => b.projectId === proj.id && b.status === "Approved"
        );
        const budgetTotal = projBudgets.reduce((s, b) => s + (Number(b.amount) || 0), 0);
        const budgetValue = Number(proj.budgetValue) || 0;
        const contractValue = Number(proj.contractValue) || 0;
        const expectedProfit = budgetValue - budgetTotal;
        const profitPct = budgetValue > 0 ? (expectedProfit / budgetValue) * 100 : 0;

        // PR Total = sum of totalAmount for all non-Rejected PRs in this project
        const projPrs = prs.filter((r) => r.projectId === proj.id && r.status !== "Rejected");
        const prTotal = projPrs.reduce((s, r) => s + (Number(r.totalAmount || r.amount) || 0), 0);

        // PO Total uses the PO subtotal after discount, before VAT.
        const projPos = pos.filter((o) => o.projectId === proj.id && o.status !== "Rejected");
        const poTotal = projPos.reduce((sum, po) => sum + getPoAmountExVat(po), 0);

        // Budget Balance = Budget Total - PO Total
        const budgetBalance = budgetTotal - poTotal;
        const balancePct = budgetTotal > 0 ? (budgetBalance / budgetTotal) * 100 : 0;

        // Spent (Inv)Total = sum of exact values from Pay History
        const spentInvTotal = getProjectPayHistoryTotal(proj.id, invoices, payments, pos);

        return {
          id: proj.id,
          jobNo: proj.jobNo || "",
          projectName: proj.name || "",
          contractValue,
          budgetValue,
          budgetTotal,
          expectedProfit,
          profitPct,
          budgetBalance,
          balancePct,
          prTotal,
          poTotal,
          spentInvTotal,
        };
      });
  }, [projects, budgets, prs, pos, invoices, payments]);

  const totals = useMemo(() => {
    const sum = (key: string) => rows.reduce((s, r) => s + (r[key] || 0), 0);
    const contractValue = sum("contractValue");
    const budgetValue = sum("budgetValue");
    const budgetTotal = sum("budgetTotal");
    const expectedProfit = sum("expectedProfit");
    const profitPct = budgetValue > 0 ? (expectedProfit / budgetValue) * 100 : 0;
    const poTotal = sum("poTotal");
    const budgetBalance = budgetTotal - poTotal;
    const balancePct = budgetTotal > 0 ? (budgetBalance / budgetTotal) * 100 : 0;
    return {
      contractValue,
      budgetValue,
      budgetTotal,
      expectedProfit,
      profitPct,
      budgetBalance,
      balancePct,
      prTotal: sum("prTotal"),
      poTotal,
      spentInvTotal: sum("spentInvTotal"),
    };
  }, [rows]);

  const handleExport = () => {
    const headers = [
      "Job No.", "Project Name", "Contract Value", "Budget Value", "Budget Total",
      "Expect Profit", "%Profit", "Budget Balance", "% Balance",
      "PR Total", "PO Total (Ex VAT)", "Spent (Inv)Total",
    ];
    const dataRows = rows.map((r) => [
      r.jobNo, r.projectName,
      r.contractValue, r.budgetValue, r.budgetTotal, r.expectedProfit,
      r.profitPct.toFixed(2),
      r.budgetBalance, r.balancePct.toFixed(2),
      r.prTotal, r.poTotal, r.spentInvTotal,
    ]);
    dataRows.push([
      "Total", "",
      totals.contractValue, totals.budgetValue, totals.budgetTotal, totals.expectedProfit,
      totals.profitPct.toFixed(2),
      totals.budgetBalance, totals.balancePct.toFixed(2),
      totals.prTotal, totals.poTotal, totals.spentInvTotal,
    ]);
    const csv = [headers, ...dataRows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "BudgetSummaryReport.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const thCell = "border border-gray-300 bg-[#c6efce] px-3 py-2 text-center text-xs font-semibold whitespace-nowrap";
  const tdText = "border border-gray-200 bg-[#fffde7] px-3 py-1.5 text-xs";
  const numCell = "border border-gray-200 bg-[#fffde7] px-3 py-1.5 text-right text-xs";
  const highlightCell = "border border-gray-200 bg-[#fffde7] px-3 py-1.5 text-right text-xs";
  const totalNumCell = "border border-gray-300 bg-[#ffe4b5] px-3 py-1.5 text-right text-xs font-semibold";
  const totalHighlightCell = "border border-gray-300 bg-[#ffe4b5] px-3 py-1.5 text-right text-xs font-semibold";

  return (
    <div className="p-4 md:p-6 bg-white min-h-screen">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-slate-800">Budget Summary Report</h2>
        {canExport && (
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg shadow transition-colors"
          >
            <Download size={14} /> Export to Excel
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-300 shadow-sm">
        <table className="w-full border-collapse text-xs" style={{ minWidth: 1000 }}>
          <thead>
            <tr>
              <th className={thCell} style={{ width: 110 }}>Job No.</th>
              <th className={thCell} style={{ width: 200 }}>Project Name</th>
              <th className={thCell} style={{ width: 120 }}>Contract Value</th>
              <th className={thCell} style={{ width: 120 }}>Budget Value</th>
              <th className={thCell} style={{ width: 110 }}>Budget Total</th>
              <th className={thCell} style={{ width: 110 }}>Expect Profit</th>
              <th className={thCell} style={{ width: 70 }}>%Profit</th>
              <th className={thCell} style={{ width: 110 }}>Budget Balance</th>
              <th className={thCell} style={{ width: 75 }}>% Balance</th>
              <th className={thCell} style={{ width: 100 }}>PR Total</th>
              <th className={thCell} style={{ width: 100 }}>PO Total (Ex VAT)</th>
              <th className={thCell} style={{ width: 120 }}>Spent (Inv)Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-center py-8 text-slate-400 border border-gray-200">
                  ไม่มีข้อมูล
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-yellow-50 transition-colors">
                  <td className={`${tdText} font-medium`}>{r.jobNo}</td>
                  <td className={tdText}>{r.projectName}</td>
                  <td className={numCell}>{fmt(r.contractValue)}</td>
                  <td className={numCell}>{fmt(r.budgetValue)}</td>
                  <td className={numCell}>{fmt(r.budgetTotal)}</td>
                  <td className={numCell}>{fmt(r.expectedProfit)}</td>
                  <td className={numCell}>{r.profitPct !== 0 ? r.profitPct.toFixed(2) + "%" : ""}</td>
                  <td className={highlightCell}>{fmt(r.budgetBalance)}</td>
                  <td className={highlightCell}>{r.balancePct !== 0 ? r.balancePct.toFixed(2) + "%" : ""}</td>
                  <td className={highlightCell}>{fmt(r.prTotal)}</td>
                  <td className={highlightCell}>{fmt(r.poTotal)}</td>
                  <td className={highlightCell}>{fmt(r.spentInvTotal)}</td>
                </tr>
              ))
            )}
            <tr>
              <td className="border border-gray-300 bg-[#ffe4b5] px-3 py-1.5 text-xs font-bold" colSpan={2}>Total</td>
              <td className={totalNumCell}>{fmt(totals.contractValue)}</td>
              <td className={totalNumCell}>{fmt(totals.budgetValue)}</td>
              <td className={totalNumCell}>{fmt(totals.budgetTotal)}</td>
              <td className={totalNumCell}>{fmt(totals.expectedProfit)}</td>
              <td className={totalNumCell}>{totals.profitPct !== 0 ? totals.profitPct.toFixed(2) + "%" : ""}</td>
              <td className={totalHighlightCell}>{fmt(totals.budgetBalance)}</td>
              <td className={totalHighlightCell}>{totals.balancePct !== 0 ? totals.balancePct.toFixed(2) + "%" : ""}</td>
              <td className={totalHighlightCell}>{fmt(totals.prTotal)}</td>
              <td className={totalHighlightCell}>{fmt(totals.poTotal)}</td>
              <td className={totalHighlightCell}>{fmt(totals.spentInvTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default BudgetSummaryReportView;
