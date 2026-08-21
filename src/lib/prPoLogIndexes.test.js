import { buildPrPoIndexes } from "./prPoLogIndexes";
import { getPrBudgetReturnInfo, isPoLinkedToPr } from "./prBudgetReturn";

const prs = [
  { id: "pr-1", prNo: "PR-001", costCode: "CC-1" },
  { id: "pr-direct", prNo: "PR-DIRECT", costCode: "CC-DIRECT" },
  { id: "pr-2", prNo: "PR-002", costCode: "CC-2" },
  { id: "pr-3", prNo: "PR-002", costCode: "CC-2" },
  { id: "pr-selected", prNo: "PR-SELECTED", costCode: "CC-SELECTED" },
  { id: "pr-ref", prNo: "PR-REF", costCode: "CC-REF" },
];

const pos = [
  {
    id: "po-1",
    poNo: "PO-SP-001_R.2",
    originalPoNo: "PO-SP-001",
    status: "Approved",
    selectedPrIds: ["pr-1"],
    items: [{ prId: "pr-1", prNo: "PR-001" }],
  },
  {
    id: "po-2",
    poNo: "PO-ML-002",
    status: "Approved",
    prRefId: "pr-ref",
    selectedPrIds: ["pr-selected"],
    costCode: "CC-PO-FALLBACK",
    items: [
      {
        prId: "pr-direct",
        prNo: "PR-ITEM-FALLBACK",
        disPrAllocations: [{ prId: "pr-2" }, { prId: "pr-3" }],
      },
      { prNo: "PR-ITEM-FALLBACK" },
    ],
  },
  {
    id: "po-rejected",
    poNo: "PO-SP-001_R.2",
    status: "Rejected",
    items: [{ prId: "pr-1" }],
  },
  { id: "po-nested", poNo: "PO-NEST", status: "Approved", items: [] },
  { id: "po-nested-period", poNo: "PO-NEST-001", status: "Approved", items: [] },
];

const oldDisplayRefs = (prId) => pos
  .filter((po) => (
    (po.selectedPrIds || []).includes(prId) ||
    (po.items || []).some((item) => item.prId === prId) ||
    po.prRefId === prId
  ))
  .map((po) => po.poNo || po.id)
  .filter(Boolean);

const oldPoMeta = (po, prById) => {
  const itemPrIds = Array.isArray(po.items)
    ? po.items.flatMap((item) => {
      const directPrId = item?.prId ? [item.prId] : [];
      const allocationPrIds = Array.isArray(item?.disPrAllocations)
        ? item.disPrAllocations.map((allocation) => allocation?.prId).filter(Boolean)
        : [];
      return [...directPrId, ...allocationPrIds];
    })
    : [];
  const selectedPrIds = Array.isArray(po.selectedPrIds) ? po.selectedPrIds.filter(Boolean) : [];
  const prRefIds = po.prRefId ? [po.prRefId] : [];
  const linkedPrs = [...new Set([...itemPrIds, ...selectedPrIds, ...prRefIds])]
    .map((prId) => prById.get(prId))
    .filter(Boolean);
  const itemPrNos = Array.isArray(po.items) ? po.items.map((item) => item?.prNo).filter(Boolean) : [];

  return {
    prNos: [...new Set([...linkedPrs.map((pr) => pr.prNo).filter(Boolean), ...itemPrNos])],
    costCodes: [...new Set([
      ...linkedPrs.map((pr) => pr.costCode).filter(Boolean),
      ...(po.costCode ? [po.costCode] : []),
    ])],
  };
};

test("display PO refs preserve the Log PR loop, including Rejected rows, input order, and duplicate numbers", () => {
  const { displayPoRefsByPrId } = buildPrPoIndexes(pos, prs);

  prs.forEach((pr) => {
    expect((displayPoRefsByPrId.get(pr.id) || []).map((ref) => ref.poNo)).toEqual(oldDisplayRefs(pr.id));
  });
  expect((displayPoRefsByPrId.get("pr-1") || []).map((ref) => ref.poNo)).toEqual([
    "PO-SP-001_R.2",
    "PO-SP-001_R.2",
  ]);
  expect(displayPoRefsByPrId.get("pr-2")).toBeUndefined();
});

test("financial PO links are differential-equal to isPoLinkedToPr and keep allocation precedence", () => {
  const { financialPosByPrId } = buildPrPoIndexes(pos, prs);

  prs.forEach((pr) => {
    const oldMatches = pos.filter((po) => po.status !== "Rejected" && isPoLinkedToPr(po, pr.id));
    expect(financialPosByPrId.get(pr.id) || []).toEqual(oldMatches);
  });
  expect(financialPosByPrId.get("pr-direct")).toBeUndefined();
  expect(financialPosByPrId.get("pr-2")).toEqual([pos[1]]);
  expect(financialPosByPrId.get("pr-1")).toEqual([pos[0]]);
});

test("PO metadata preserves union order, de-duplicates PR metadata, and keeps item.prNo fallback", () => {
  const prById = new Map(prs.map((pr) => [pr.id, pr]));
  const { poMetaById } = buildPrPoIndexes(pos, prById);

  pos.forEach((po) => {
    const indexed = poMetaById.get(po.id);
    expect({ prNos: indexed.prNos, costCodes: indexed.costCodes }).toEqual(oldPoMeta(po, prById));
  });
  expect(poMetaById.get("po-2").linkedPrIds).toEqual([
    "pr-direct",
    "pr-2",
    "pr-3",
    "pr-selected",
    "pr-ref",
  ]);
  expect(poMetaById.get("po-2").prNos).toEqual([
    "PR-DIRECT",
    "PR-002",
    "PR-SELECTED",
    "PR-REF",
    "PR-ITEM-FALLBACK",
  ]);
});

test("PR financial helper returns the same result with indexed PO subsets", () => {
  const financialPr = { id: "pr-finance", totalAmount: 150000 };
  const financialPos = [
    {
      id: "po-finance-sp",
      poNo: "PO-FINANCE-SP",
      poType: "SP",
      status: "Approved",
      selectedPrIds: [financialPr.id],
      items: [{ prId: financialPr.id, amount: 100000, quantity: 1, price: 100000 }],
    },
    {
      id: "po-finance-ml",
      poNo: "PO-FINANCE-ML",
      poType: "ML",
      status: "Approved",
      items: [{ prId: financialPr.id, amount: 25000, quantity: 25, price: 1000 }],
    },
    {
      id: "po-unrelated",
      poNo: "PO-UNRELATED",
      poType: "SP",
      status: "Approved",
      items: [{ amount: 999999 }],
    },
  ];
  const prIndexes = buildPrPoIndexes(financialPos, [financialPr]);
  expect(getPrBudgetReturnInfo(
    financialPr,
    prIndexes.financialPosByPrId.get(financialPr.id) || [],
  )).toEqual(getPrBudgetReturnInfo(financialPr, financialPos));
});
