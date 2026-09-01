import { COST_CATEGORIES } from "./constants";

export const PROJECT_BUDGET_EXPORT_HEADERS = [
  "CostCode",
  "Budget total",
  "PO total",
  "Inv total",
] as const;

export type ProjectBudgetExportRow = {
  costCode: string;
  budgetTotal: number;
  poTotal: number;
  invTotal: number;
};

type BudgetExportStats = {
  poTotal?: number;
  invoiceTotal?: number;
};

const roundMoney = (value: number) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

/**
 * รวม Main Budget ที่มี CostCode เดียวกันเป็นหนึ่งแถว และแยกตามเลข 3 หลักแรก
 * ของ CostCode (001-009) เพื่อใช้สร้างแต่ละ Sheet ในไฟล์ Export
 */
export function buildProjectBudgetExportSheets(
  budgets: any[],
  statsByBudgetId: Map<string, BudgetExportStats>
): Record<string, ProjectBudgetExportRow[]> {
  const categoryCodes = Object.keys(COST_CATEGORIES);
  const groupedByCategory = Object.fromEntries(
    categoryCodes.map((category) => [category, new Map<string, ProjectBudgetExportRow>()])
  ) as Record<string, Map<string, ProjectBudgetExportRow>>;

  (budgets || []).forEach((budget) => {
    const costCode = String(budget?.code || "").trim();
    if (!costCode) return;

    const categoryFromCode = costCode.slice(0, 3);
    const fallbackCategory = String(budget?.category || "").trim();
    const category = categoryCodes.includes(categoryFromCode)
      ? categoryFromCode
      : fallbackCategory;
    const categoryRows = groupedByCategory[category];
    if (!categoryRows) return;

    const current = categoryRows.get(costCode) || {
      costCode,
      budgetTotal: 0,
      poTotal: 0,
      invTotal: 0,
    };
    const stats = statsByBudgetId.get(budget.id) || {};

    current.budgetTotal += Number(budget?.amount) || 0;
    current.poTotal += Number(stats.poTotal) || 0;
    current.invTotal += Number(stats.invoiceTotal) || 0;
    categoryRows.set(costCode, current);
  });

  return Object.fromEntries(
    categoryCodes.map((category) => [
      category,
      Array.from(groupedByCategory[category].values())
        .map((row) => ({
          ...row,
          budgetTotal: roundMoney(row.budgetTotal),
          poTotal: roundMoney(row.poTotal),
          invTotal: roundMoney(row.invTotal),
        }))
        .sort((a, b) => a.costCode.localeCompare(b.costCode, undefined, { numeric: true })),
    ])
  );
}
