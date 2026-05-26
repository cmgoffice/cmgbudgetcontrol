// @ts-nocheck

export function normalizeReceiveType(receiveType) {
  return String(receiveType || "").trim().toLowerCase();
}

export function isReceiveAutoType(receiveType) {
  return normalizeReceiveType(receiveType) === "receive auto";
}

export function isPayBeforeReceiveType(receiveType) {
  return normalizeReceiveType(receiveType).includes("pay before");
}

export function getPrNoFromPo(po, prs = []) {
  if (!po) return "";
  if (po.prNo) return String(po.prNo);

  const fromItemsPrNo = [...new Set((po.items || []).map((item) => item?.prNo).filter(Boolean))];
  if (fromItemsPrNo.length > 0) return fromItemsPrNo.join(", ");

  const fromItemsPrId = [...new Set((po.items || []).map((item) => item?.prId).filter(Boolean))];
  if (fromItemsPrId.length > 0) {
    const nos = fromItemsPrId.map((id) => prs.find((pr) => pr.id === id)?.prNo).filter(Boolean);
    if (nos.length > 0) return nos.join(", ");
  }

  const linkedPrIds = Array.isArray(po.selectedPrIds) ? po.selectedPrIds : [];
  if (linkedPrIds.length === 0) return "";

  return linkedPrIds
    .map((prId) => prs.find((pr) => pr.id === prId)?.prNo)
    .filter(Boolean)
    .join(", ");
}

export function generateReceiveNo({ project, projectId, receives = [], now = new Date() }) {
  if (!project?.jobNo) return `RP-${now.getTime()}`;

  const yy = String(now.getFullYear()).slice(-2);
  const prefix = `RP${yy}${project.jobNo}`;
  const existing = receives.filter(
    (receive) =>
      receive.projectId === projectId &&
      (
        receive.rpNo?.startsWith(prefix) ||
        receive.receiveNo?.startsWith(prefix) ||
        receive.receiveNo?.startsWith(`RCV${yy}${project.jobNo}`)
      )
  );
  const seq = String(existing.length + 1).padStart(4, "0");
  return `${prefix}-${seq}`;
}

export function findAutoReceiveForPO(receives = [], poId) {
  return receives.find((receive) => receive.poId === poId && receive.autoCreatedFromPoApproval);
}

export function buildAutoReceiveData({
  po,
  prs = [],
  vendors = [],
  receives = [],
  project = null,
  user = null,
  userData = null,
  now = new Date(),
}) {
  if (!po) return null;

  const receiveNo = generateReceiveNo({
    project,
    projectId: po.projectId,
    receives,
    now,
  });
  const resolvedPrNo = getPrNoFromPo(po, prs);
  const resolvedProjectCode =
    po.projectItemCode || (resolvedPrNo ? resolvedPrNo.split(",")[0].trim().substring(0, 3) : "");
  const vendor = vendors.find((item) => item.id === po.vendorId);
  const vendorName = vendor?.name || po.vendorName || "";
  const poCreatorName = po?.createdByName || [po?.createdByFirstName, po?.createdByLastName].filter(Boolean).join(" ").trim() || po?.createdByUid || "System";
  const receivedByName = poCreatorName;
  const receivedDate = now.toISOString().split("T")[0];
  const items = (po.items || []).map((item, idx) => {
    const orderedQty = Number(item?.quantity || 0);
    const unitPrice = Number(item?.price || 0);
    return {
      poItemIndex: idx,
      materialNo: item?.materialNo || "",
      description: item?.description || "",
      unit: item?.unit || "",
      orderedQty,
      price: unitPrice,
      amount: Number(item?.amount) || (orderedQty * unitPrice),
      receivedQty: orderedQty,
      photos: [],
    };
  });

  return {
    receiveNo,
    receiveData: {
      receiveNo,
      rpNo: receiveNo,
      poId: po.id,
      poNo: po.poNo,
      prNo: resolvedPrNo,
      projectItemCode: resolvedProjectCode,
      vendorName,
      documentNo: po.poNo || "",
      projectId: po.projectId,
      items,
      receivedDate,
      receivedByUid: po?.createdByUid || user?.uid || null,
      receivedByName,
      note: `Auto receive from PO approval (${po.poNo || po.id})`,
      createdAt: now.toISOString(),
      autoCreatedFromPoApproval: true,
    },
  };
}
