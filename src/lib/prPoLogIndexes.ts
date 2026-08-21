import { isPoLinkedToPr } from "./prBudgetReturn";

/**
 * Indexes used by the PR/PO log.  This module deliberately contains no
 * financial formula: every financial relationship is confirmed with the
 * existing predicates before it is added to an index.
 */

export type DisplayPoRef = {
  poId: string;
  poNo: any;
};

export type PoLogMeta = {
  linkedPrIds: string[];
  prNos: any[];
  costCodes: any[];
};

export type PrPoIndexes = {
  displayPoRefsByPrId: Map<string, DisplayPoRef[]>;
  financialPosByPrId: Map<string, any[]>;
  poMetaById: Map<string, PoLogMeta>;
};

const asArray = (value: any): any[] => Array.isArray(value) ? value : [];

const appendMapValue = <T>(map: Map<string, T[]>, key: string, value: T) => {
  const current = map.get(key);
  if (current) {
    current.push(value);
  } else {
    map.set(key, [value]);
  }
};

const makePrLookup = (prsOrMap: any[] | ReadonlyMap<any, any>): ReadonlyMap<any, any> => {
  if (prsOrMap instanceof Map) return prsOrMap;
  return new Map(asArray(prsOrMap).map((pr: any) => [pr?.id, pr]));
};

const collectDisplayPrIds = (po: any): Set<any> => {
  const ids = new Set<any>();
  asArray(po?.selectedPrIds).forEach((id) => ids.add(id));
  asArray(po?.items).forEach((item) => ids.add(item?.prId));
  ids.add(po?.prRefId);
  return ids;
};

/**
 * Candidate IDs follow isPoLinkedToPr's allocation precedence.  The imported
 * predicate still confirms every candidate; this function does not replace
 * the business rule.
 */
const collectFinancialPrIds = (po: any): Set<any> => {
  const ids = new Set<any>();
  ids.add(po?.prRefId);
  asArray(po?.selectedPrIds).forEach((id) => ids.add(id));
  asArray(po?.items).forEach((item) => {
    const allocations = asArray(item?.disPrAllocations);
    if (allocations.length > 0) {
      allocations.forEach((allocation) => ids.add(allocation?.prId));
    } else {
      ids.add(item?.prId);
    }
  });
  return ids;
};

const collectPoMetaPrIds = (po: any): any[] => {
  const ids = new Set<any>();
  asArray(po?.items).forEach((item) => {
    if (item?.prId) ids.add(item.prId);
    asArray(item?.disPrAllocations).forEach((allocation) => {
      if (allocation?.prId) ids.add(allocation.prId);
    });
  });
  asArray(po?.selectedPrIds).forEach((id) => {
    if (id) ids.add(id);
  });
  if (po?.prRefId) ids.add(po.prRefId);
  return Array.from(ids);
};

/**
 * Builds the three PR/PO relationship indexes in one pass over PO records.
 *
 * displayPoRefsByPrId intentionally:
 * - does not use disPrAllocations;
 * - includes Rejected POs;
 * - preserves PO input order; and
 * - permits the same displayed PO number from different PO documents.
 */
export const buildPrPoIndexes = (
  pos: any[],
  prsOrMap: any[] | ReadonlyMap<any, any> = [],
): PrPoIndexes => {
  const displayPoRefsByPrId = new Map<string, DisplayPoRef[]>();
  const financialPosByPrId = new Map<string, any[]>();
  const poMetaById = new Map<string, PoLogMeta>();
  const prById = makePrLookup(prsOrMap);

  asArray(pos).forEach((po) => {
    if (!po) return;

    const displayedPoNo = po.poNo || po.id;
    if (displayedPoNo) {
      collectDisplayPrIds(po).forEach((prId) => {
        if (prId == null) return;
        appendMapValue(displayPoRefsByPrId, String(prId), {
          poId: po.id == null ? "" : String(po.id),
          poNo: displayedPoNo,
        });
      });
    }

    if (po.status !== "Rejected") {
      collectFinancialPrIds(po).forEach((prId) => {
        if (!prId || !isPoLinkedToPr(po, prId)) return;
        appendMapValue(financialPosByPrId, String(prId), po);
      });
    }

    if (po.id == null) return;
    const linkedPrIds = collectPoMetaPrIds(po);
    const linkedPrs = linkedPrIds.map((prId) => prById.get(prId)).filter(Boolean);
    const itemPrNos = asArray(po.items).map((item) => item?.prNo).filter(Boolean);
    const prNos = Array.from(new Set([
      ...linkedPrs.map((pr: any) => pr?.prNo).filter(Boolean),
      ...itemPrNos,
    ]));
    const costCodes = Array.from(new Set([
      ...linkedPrs.map((pr: any) => pr?.costCode).filter(Boolean),
      ...(po.costCode ? [po.costCode] : []),
    ]));

    poMetaById.set(String(po.id), {
      linkedPrIds: linkedPrIds.map(String),
      prNos,
      costCodes,
    });
  });

  return { displayPoRefsByPrId, financialPosByPrId, poMetaById };
};
