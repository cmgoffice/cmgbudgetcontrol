const asText = (value: any) => String(value ?? "").trim();

export const getCanonicalLineAmount = (item: any) => {
  const quantity = Number(item?.quantity);
  const price = Number(item?.price);
  if (Number.isFinite(quantity) && Number.isFinite(price)) {
    return quantity * price;
  }
  return Number(item?.amount) || 0;
};

export const findUniquePrByNo = (prs: any[], projectId: string, prNo: any) => {
  const normalizedPrNo = asText(prNo).toLowerCase();
  if (!normalizedPrNo) return null;
  const matches = (prs || []).filter((pr: any) =>
    pr?.projectId === projectId && asText(pr?.prNo).toLowerCase() === normalizedPrNo
  );
  return matches.length === 1 ? matches[0] : null;
};

/**
 * Validates the relationship stored in a PO before it is written.
 * A PO may contain many PRs and budgets, but every route must remain on one
 * project and one Cost Code. Budget ownership is read from the referenced PR
 * item; the PO is not allowed to override it.
 */
export const validatePoPrLinkage = ({
  projectId,
  selectedPrIds,
  items,
  prs,
  requireAllocations = false,
}: {
  projectId: string;
  selectedPrIds: any[];
  items: any[];
  prs: any[];
  requireAllocations?: boolean;
}) => {
  const prById = new Map((prs || []).map((pr: any) => [pr?.id, pr]));
  const selectedIds = new Set((selectedPrIds || []).filter(Boolean));
  const selectedPrs = Array.from(selectedIds).map((id) => prById.get(id)).filter(Boolean) as any[];
  const invalid: string[] = [];

  if (selectedPrs.some((pr) => pr.projectId !== projectId)) {
    invalid.push("PR ต้องอยู่ในโครงการเดียวกับ PO");
  }

  const costCodes = new Set(selectedPrs.map((pr) => asText(pr.costCode)).filter(Boolean));
  for (const item of items || []) {
    const pr = prById.get(item?.prId);
    const index = Number(item?.prItemIndex);
    const prItem = pr && Number.isInteger(index) && index >= 0 ? pr.items?.[index] : null;
    if (!pr || !prItem) {
      invalid.push(`รายการ ${item?.description || item?.materialNo || "PO"} ไม่มีเส้นทาง PR ที่ชัดเจน`);
      continue;
    }

    if (!selectedIds.has(pr.id)) {
      invalid.push(`PR ${pr.prNo || pr.id} ไม่อยู่ในรายการ PR ที่เลือกของ PO`);
    }
    if (pr.projectId !== projectId) {
      invalid.push(`PR ${pr.prNo || pr.id} อยู่คนละโครงการ`);
    }

    const routeCostCode = asText(prItem.costCode || pr.costCode);
    if (routeCostCode) costCodes.add(routeCostCode);
    if (asText(item.costCode) && asText(item.costCode) !== routeCostCode) {
      invalid.push(`รายการ ${item?.description || item?.materialNo || "PO"} มี Cost Code ไม่ตรงกับ PR`);
    }

    const allocations = Array.isArray(item?.disPrAllocations) ? item.disPrAllocations : [];
    if (requireAllocations && allocations.length === 0) {
      invalid.push(`รายการ ${item?.description || item?.materialNo || "PO"} ยังไม่มีการจัดสรร PR`);
    }

    const seenAllocationRoutes = new Set<string>();
    for (const allocation of allocations) {
      const allocationPr = prById.get(allocation?.prId);
      const allocationIndex = Number(allocation?.prItemIndex);
      const allocationItem = allocationPr && Number.isInteger(allocationIndex) && allocationIndex >= 0
        ? allocationPr.items?.[allocationIndex]
        : null;
      const routeKey = `${allocation?.prId || ""}:${allocationIndex}`;
      if (seenAllocationRoutes.has(routeKey)) {
        invalid.push(`รายการ ${item?.description || item?.materialNo || "PO"} จัดสรร PR ซ้ำรายการเดิม`);
      }
      seenAllocationRoutes.add(routeKey);

      if (!allocationPr || !allocationItem) {
        invalid.push(`รายการ ${item?.description || item?.materialNo || "PO"} มี Allocation ที่อ้าง PR ไม่ถูกต้อง`);
        continue;
      }
      if (!selectedIds.has(allocationPr.id)) {
        invalid.push(`Allocation ของ PR ${allocationPr.prNo || allocationPr.id} ไม่อยู่ใน PR ที่เลือก`);
      }
      const allocationCostCode = asText(allocationItem.costCode || allocationPr.costCode);
      if (allocationCostCode) costCodes.add(allocationCostCode);
      if (Number(allocation.amount) < -0.01 || !Number.isFinite(Number(allocation.amount))) {
        invalid.push(`รายการ ${item?.description || item?.materialNo || "PO"} มีจำนวนเงิน Allocation ไม่ถูกต้อง`);
      }
    }
  }

  if (costCodes.size > 1) {
    invalid.push("PO เดียวกันต้องใช้ Cost Code เดียวกัน");
  }

  return {
    valid: invalid.length === 0,
    errors: Array.from(new Set(invalid)),
    costCodes: Array.from(costCodes),
  };
};
