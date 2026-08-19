// @ts-nocheck
import React, { useMemo } from "react";
import { useAppData } from "../contexts/AppDataContext";
import { COST_CATEGORIES } from "../lib/constants";
import { getPoAmountExVat } from "../lib/poDiscount";
import {
  getInvoiceAmount,
  getInvoiceAmountForPo,
  getProjectPayHistoryTotal,
  isSpentInvoiceRecord,
} from "../lib/billingPayUtils";

const fmt = (v: number) =>
  v === 0 ? "" : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CODES = Object.keys(COST_CATEGORIES).sort();

const ROW_LABELS = [
  { key: "budgetTotal",    label: "Budget Total",      bold: true },
  { key: "budgetBalance",  label: "Budget Balance",    bold: false },
  { key: "balancePct",     label: "% Balance",         bold: false, pct: true },
  { key: "prTotal",        label: "PR Total",          bold: false },
  { key: "poTotal",        label: "PO Total (Ex VAT)", bold: false },
  { key: "spentInvTotal",  label: "Spent (Inv)Total",  bold: false },
];

const ProjectSpendingView = React.memo(() => {
  const { projects, budgets, prs, pos, invoices = [], payments = [] } = useAppData();

  const invoiceSpentByProjectCode = useMemo(() => {
    const result = new Map<string, Map<string, number>>();
    const poById = new Map((pos || []).map((po) => [String(po.id), po]));
    const poByNo = new Map((pos || []).filter((po) => po.poNo).map((po) => [String(po.poNo), po]));
    const paymentById = new Map((payments || []).map((payment) => [String(payment.id), payment]));

    (invoices || []).forEach((invoice) => {
      if (!isSpentInvoiceRecord(invoice)) return;

      const payment = paymentById.get(String(invoice.paymentId || invoice.poId || ""));
      const sourceRefs = [
        invoice.sourcePoId,
        invoice.sourcePoNo,
        invoice.poId,
        invoice.poRef,
        invoice.poNo,
        ...(Array.isArray(payment?.selectedPrIds) ? payment.selectedPrIds : []),
        payment?.poRef,
      ].filter(Boolean).map(String);
      const sourcePos = Array.from(new Set(sourceRefs.map((ref) => poById.get(ref) || poByNo.get(ref)).filter(Boolean)));
      if (sourcePos.length === 0) return;

      const amountPerPo = getInvoiceAmount(invoice) / sourcePos.length;
      sourcePos.forEach((po) => {
        const code = po.costCode || po.items?.find((item) => item.costCode)?.costCode;
        if (!code) return;
        const projectMap = result.get(String(po.projectId)) || new Map<string, number>();
        projectMap.set(
          String(code),
          (projectMap.get(String(code)) || 0) + getInvoiceAmountForPo({ amount: amountPerPo }, po)
        );
        result.set(String(po.projectId), projectMap);
      });
    });

    return result;
  }, [invoices, payments, pos]);

  const projectRows = useMemo(() => {
    return projects
      .filter((p) => p.status !== "Cancelled")
      .map((proj) => {
        const codeData: Record<string, {
          budgetTotal: number;
          budgetBalance: number;
          balancePct: number;
          prTotal: number;
          poTotal: number;
          spentInvTotal: number;
        }> = {};

        CODES.forEach((code) => {
          const projBudgets = budgets.filter(
            (b) => b.projectId === proj.id && b.costCode === code && b.status === "Approved"
          );
          const budgetTotal = projBudgets.reduce((s, b) => s + (Number(b.amount) || 0), 0);

          const projPrs = prs.filter((r) => r.projectId === proj.id && r.costCode === code);
          const projPos = pos.filter((o) => o.projectId === proj.id && o.costCode === code);

          const prTotal = projPrs.reduce((s, r) => s + (Number(r.total) || 0), 0);
          const poTotal = projPos.reduce((sum, po) => sum + getPoAmountExVat(po), 0);
          const spentInvTotal = invoiceSpentByProjectCode.get(String(proj.id))?.get(String(code)) || 0;

          const budgetBalance = budgetTotal - spentInvTotal;
          const balancePct = budgetTotal > 0 ? (budgetBalance / budgetTotal) * 100 : 0;

          codeData[code] = { budgetTotal, budgetBalance, balancePct, prTotal, poTotal, spentInvTotal };
        });

        const allBudgets = budgets.filter((b) => b.projectId === proj.id && b.status === "Approved");
        const allPrs = prs.filter((r) => r.projectId === proj.id);
        const allPos = pos.filter((o) => o.projectId === proj.id);

        const totalBudgetTotal = allBudgets.reduce((s, b) => s + (Number(b.amount) || 0), 0);
        const totalPrTotal = allPrs.reduce((s, r) => s + (Number(r.total) || 0), 0);
        const totalPoTotal = allPos.reduce((sum, po) => sum + getPoAmountExVat(po), 0);
        const totalSpentInvTotal = getProjectPayHistoryTotal(proj.id, invoices, payments, pos);
        const totalBudgetBalance = totalBudgetTotal - totalSpentInvTotal;
        const totalBalancePct = totalBudgetTotal > 0 ? (totalBudgetBalance / totalBudgetTotal) * 100 : 0;

        return {
          id: proj.id,
          jobNo: proj.jobNo || "",
          projectName: proj.name || "",
          codeData,
          total: {
            budgetTotal: totalBudgetTotal,
            budgetBalance: totalBudgetBalance,
            balancePct: totalBalancePct,
            prTotal: totalPrTotal,
            poTotal: totalPoTotal,
            spentInvTotal: totalSpentInvTotal,
          },
        };
      });
  }, [projects, budgets, prs, pos, invoices, payments, invoiceSpentByProjectCode]);

  const grandTotal = useMemo(() => {
    const codeData: Record<string, any> = {};
    CODES.forEach((code) => {
      codeData[code] = {
        budgetTotal: projectRows.reduce((s, r) => s + (r.codeData[code]?.budgetTotal || 0), 0),
        budgetBalance: projectRows.reduce((s, r) => s + (r.codeData[code]?.budgetBalance || 0), 0),
        prTotal: projectRows.reduce((s, r) => s + (r.codeData[code]?.prTotal || 0), 0),
        poTotal: projectRows.reduce((s, r) => s + (r.codeData[code]?.poTotal || 0), 0),
        spentInvTotal: projectRows.reduce((s, r) => s + (r.codeData[code]?.spentInvTotal || 0), 0),
      };
      const bt = codeData[code].budgetTotal;
      const si = codeData[code].spentInvTotal;
      const bb = bt - si;
      codeData[code].budgetBalance = bb;
      codeData[code].balancePct = bt > 0 ? (bb / bt) * 100 : 0;
    });
    const totalBudgetTotal = projectRows.reduce((s, r) => s + r.total.budgetTotal, 0);
    const totalSpent = projectRows.reduce((s, r) => s + r.total.spentInvTotal, 0);
    const totalBb = totalBudgetTotal - totalSpent;
    return {
      codeData,
      total: {
        budgetTotal: totalBudgetTotal,
        budgetBalance: totalBb,
        balancePct: totalBudgetTotal > 0 ? (totalBb / totalBudgetTotal) * 100 : 0,
        prTotal: projectRows.reduce((s, r) => s + r.total.prTotal, 0),
        poTotal: projectRows.reduce((s, r) => s + r.total.poTotal, 0),
        spentInvTotal: totalSpent,
      },
    };
  }, [projectRows]);

  const thBase = "border border-gray-300 px-2 py-1 text-center text-xs font-semibold bg-[#c6efce] whitespace-nowrap";
  const tdLabel = "border border-gray-200 bg-[#dbeafe] px-2 py-0.5 text-xs whitespace-nowrap";
  const tdNum = "border border-gray-200 bg-[#fffacd] px-2 py-0.5 text-right text-xs";
  const tdTotalLabel = "border border-gray-300 bg-[#ffe4b5] px-2 py-0.5 text-xs font-semibold whitespace-nowrap";
  const tdTotalNum = "border border-gray-300 bg-[#ffe4b5] px-2 py-0.5 text-right text-xs font-semibold";

  const renderDataRow = (rowDef, codeData, totalData, rowBg = "") => {
    const val = (d) => {
      if (!d) return "";
      const v = d[rowDef.key] ?? 0;
      if (v === 0) return "";
      if (rowDef.pct) return v.toFixed(2) + "%";
      return fmt(v);
    };
    return (
      <tr key={rowDef.key} className={rowBg}>
        <td className="border border-gray-200 px-2 py-0.5 text-xs" />
        <td className="border border-gray-200 px-2 py-0.5 text-xs" />
        <td className={`${tdLabel} ${rowDef.bold ? "font-semibold text-blue-700" : ""}`}>{rowDef.label}</td>
        {CODES.map((code) => (
          <td key={code} className={tdNum}>{val(codeData[code])}</td>
        ))}
        <td className={tdNum}>{val(totalData)}</td>
      </tr>
    );
  };

  const renderGrandTotalRow = (rowDef) => {
    const val = (d) => {
      if (!d) return "";
      const v = d[rowDef.key] ?? 0;
      if (v === 0) return "";
      if (rowDef.pct) return v.toFixed(2) + "%";
      return fmt(v);
    };
    return (
      <tr key={rowDef.key}>
        <td className="border border-gray-300 bg-[#ffe4b5] px-2 py-0.5 text-xs" />
        <td className="border border-gray-300 bg-[#ffe4b5] px-2 py-0.5 text-xs" />
        <td className={`${tdTotalLabel} ${rowDef.bold ? "text-blue-800" : ""}`}>{rowDef.label}</td>
        {CODES.map((code) => (
          <td key={code} className={tdTotalNum}>{val(grandTotal.codeData[code])}</td>
        ))}
        <td className={tdTotalNum}>{val(grandTotal.total)}</td>
      </tr>
    );
  };

  return (
    <div className="p-4 md:p-6 bg-white min-h-screen">
      <h2 className="text-base font-bold text-slate-800 mb-4">Project Spending Separate Code</h2>

      <div className="overflow-x-auto rounded-lg border border-gray-300 shadow-sm">
        <table className="border-collapse text-xs" style={{ minWidth: 1100 }}>
          <thead>
            <tr>
              <th className={thBase} style={{ width: 110 }}>Job No.</th>
              <th className={thBase} style={{ width: 170 }}>Project Name</th>
              <th className={thBase} style={{ width: 110 }}>Code</th>
              {CODES.map((code) => (
                <th key={code} className={thBase} style={{ width: 90 }}>{code}</th>
              ))}
              <th className={thBase} style={{ width: 100 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {projectRows.length === 0 ? (
              <tr>
                <td colSpan={CODES.length + 4} className="text-center py-8 text-slate-400 border border-gray-200">
                  ไม่มีข้อมูล
                </td>
              </tr>
            ) : (
              projectRows.map((proj, pi) => (
                <React.Fragment key={proj.id}>
                  {ROW_LABELS.map((rowDef, ri) => (
                    <tr key={rowDef.key} className={ri % 2 === 0 ? "" : ""}>
                      {ri === 0 ? (
                        <>
                          <td
                            rowSpan={ROW_LABELS.length}
                            className="border border-gray-200 bg-white px-2 py-0.5 text-xs font-semibold align-top"
                          >
                            {proj.jobNo}
                          </td>
                          <td
                            rowSpan={ROW_LABELS.length}
                            className="border border-gray-200 bg-white px-2 py-0.5 text-xs align-top"
                          >
                            {proj.projectName}
                          </td>
                        </>
                      ) : null}
                      <td className={`${tdLabel} ${rowDef.bold ? "font-semibold text-blue-700" : ""}`}>
                        {rowDef.label}
                      </td>
                      {CODES.map((code) => {
                        const d = proj.codeData[code];
                        const v = d?.[rowDef.key] ?? 0;
                        const display = v === 0 ? "" : rowDef.pct ? v.toFixed(2) + "%" : fmt(v);
                        return <td key={code} className={tdNum}>{display}</td>;
                      })}
                      {/* row total */}
                      <td className={tdNum}>
                        {(() => {
                          const v = proj.total[rowDef.key] ?? 0;
                          if (v === 0) return "";
                          if (rowDef.pct) return v.toFixed(2) + "%";
                          return fmt(v);
                        })()}
                      </td>
                    </tr>
                  ))}
                  {/* separator row */}
                  <tr>
                    <td
                      colSpan={CODES.length + 3}
                      className="border border-yellow-200 bg-yellow-50 py-0.5"
                    />
                  </tr>
                </React.Fragment>
              ))
            )}

            {/* Grand Total */}
            <tr>
              <td className={tdTotalLabel} colSpan={2}>Total</td>
              <td className="border border-gray-300 bg-[#ffe4b5] px-2 py-0.5 text-xs" />
              {CODES.map((code) => (
                <td key={code} className="border border-gray-300 bg-[#ffe4b5] px-2 py-0.5" />
              ))}
              <td className="border border-gray-300 bg-[#ffe4b5] px-2 py-0.5" />
            </tr>
            {ROW_LABELS.map((rowDef) => renderGrandTotalRow(rowDef))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default ProjectSpendingView;
