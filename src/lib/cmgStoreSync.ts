// @ts-nocheck
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";

const CMG_STORE_APP_NAME = "cmg-store-management";
const DEFAULT_RECEIVING_REQUESTS_PATH = "CMG-Store-Management/root/receivingRequests";
const DEFAULT_CMG_STORE_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCPD2n5iX3_IteaDtVWj45VSUip1In2x0s",
  authDomain: "gantt-chart-d0b5b.firebaseapp.com",
  projectId: "gantt-chart-d0b5b",
  storageBucket: "gantt-chart-d0b5b.firebasestorage.app",
  messagingSenderId: "57497478675",
  appId: "1:57497478675:web:0a12a9737e2a207fb501e6",
  measurementId: "G-C90P6GYNP0",
};

const normalizeText = (value: any) => String(value || "").trim();
const normalizeKey = (value: any) => normalizeText(value).toLowerCase();

export function isCmgStoreEligibleReceiveType(receiveType: any) {
  const normalized = normalizeKey(receiveType);
  return normalized === "material" || normalized === "eqm";
}

export function isCmgStoreEligibleInventoryStatus(inventoryType: any) {
  return normalizeKey(inventoryType) === "inventory";
}

function normalizeCmgProjectCode(value: any) {
  const raw = normalizeText(value);
  if (!raw) return "";
  const upper = raw.toUpperCase().replace(/\s+/g, "");
  const match = upper.match(/^J-?(\d{1,3}[A-Z]?)$/);
  if (!match) return upper;
  return `J-${match[1]}`;
}

function extractProjectCodeFromDocNo(value: any) {
  const raw = normalizeText(value);
  if (!raw) return "";
  const first = raw.split(",")[0].trim();
  const match = first.match(/J-?\d{1,3}[A-Z]?/i);
  return match ? normalizeCmgProjectCode(match[0]) : "";
}

export function getCmgStoreTargetProjectCode({ receive, po }: { receive?: any; po?: any }) {
  const location = normalizeKey(po?.location || receive?.location || receive?.deliveryLocation);

  if (location.includes("headoffice") || location.includes("head office")) {
    return "J-01";
  }
  if (location.includes("workshop")) {
    return "J-02B";
  }

  const fromDocNo =
    extractProjectCodeFromDocNo(receive?.prNo || po?.prNo) ||
    extractProjectCodeFromDocNo(receive?.poNo || po?.poNo);
  if (fromDocNo) return fromDocNo;

  return normalizeCmgProjectCode(receive?.projectItemCode || po?.projectItemCode);
}

function getEnvValue(key: string, fallbackKey?: string) {
  return process.env[key] || (fallbackKey ? process.env[fallbackKey] : undefined) || "";
}

function getCmgStoreFirebaseConfig() {
  const apiKey = getEnvValue("REACT_APP_CMG_STORE_FIREBASE_API_KEY", "VITE_FIREBASE_API_KEY") || DEFAULT_CMG_STORE_FIREBASE_CONFIG.apiKey;
  const authDomain = getEnvValue("REACT_APP_CMG_STORE_FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_AUTH_DOMAIN") || DEFAULT_CMG_STORE_FIREBASE_CONFIG.authDomain;
  const projectId = getEnvValue("REACT_APP_CMG_STORE_FIREBASE_PROJECT_ID", "VITE_FIREBASE_PROJECT_ID") || DEFAULT_CMG_STORE_FIREBASE_CONFIG.projectId;
  const storageBucket = getEnvValue("REACT_APP_CMG_STORE_FIREBASE_STORAGE_BUCKET", "VITE_FIREBASE_STORAGE_BUCKET") || DEFAULT_CMG_STORE_FIREBASE_CONFIG.storageBucket;
  const messagingSenderId = getEnvValue("REACT_APP_CMG_STORE_FIREBASE_MESSAGING_SENDER_ID", "VITE_FIREBASE_MESSAGING_SENDER_ID") || DEFAULT_CMG_STORE_FIREBASE_CONFIG.messagingSenderId;
  const appId = getEnvValue("REACT_APP_CMG_STORE_FIREBASE_APP_ID", "VITE_FIREBASE_APP_ID") || DEFAULT_CMG_STORE_FIREBASE_CONFIG.appId;
  const measurementId = getEnvValue("REACT_APP_CMG_STORE_FIREBASE_MEASUREMENT_ID", "VITE_FIREBASE_MEASUREMENT_ID") || DEFAULT_CMG_STORE_FIREBASE_CONFIG.measurementId;

  if (!apiKey || !authDomain || !projectId || !storageBucket || !messagingSenderId || !appId) {
    return null;
  }

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
    ...(measurementId ? { measurementId } : {}),
  };
}

function getCmgStoreDb() {
  const config = getCmgStoreFirebaseConfig();
  if (!config) {
    throw new Error("ตั้งค่า Firebase ของ CMG Store Management ไม่ครบ");
  }

  const existingApp = getApps().find((app) => app.name === CMG_STORE_APP_NAME);
  const app = existingApp || initializeApp(config, CMG_STORE_APP_NAME);
  return getFirestore(app);
}

function getReceivingRequestsPathSegments() {
  const rawPath =
    getEnvValue("REACT_APP_CMG_STORE_RECEIVING_REQUESTS_PATH") ||
    DEFAULT_RECEIVING_REQUESTS_PATH;
  const segments = rawPath.split("/").map((part) => part.trim()).filter(Boolean);
  if (segments.length === 0 || segments.length % 2 === 0) {
    throw new Error(`CMG Store receivingRequests path ไม่ถูกต้อง: ${rawPath}`);
  }
  return segments;
}

function safeDocId(value: any) {
  const source = normalizeText(value) || `receive-${Date.now()}`;
  return source.replace(/[/?#[\].]/g, "_").replace(/\s+/g, "_");
}

function extractRunningNoFromReceiveNo(value: any) {
  const raw = normalizeText(value);
  if (!raw) return "";
  const match = raw.match(/(\d+)$/);
  return match ? match[1] : "";
}

function buildReceivingRequestDocId(cmgProjectCode: string, receiveNo: string) {
  const runningNo = extractRunningNoFromReceiveNo(receiveNo);
  const source = runningNo ? `${cmgProjectCode}-${runningNo}` : `${cmgProjectCode}-${receiveNo}`;
  return safeDocId(source);
}

function getItemIdentity(item: any) {
  return (
    normalizeText(item?.iditem) ||
    normalizeText(item?.idItem) ||
    normalizeText(item?.itemId) ||
    normalizeText(item?.materialId) ||
    normalizeText(item?.materialNo) ||
    normalizeText(item?.description || item?.itemName)
  );
}

function buildItemIdempotencyKey(receiveNo: string, item: any) {
  const poItemIndex = item?.poItemIndex;
  const lineKey =
    poItemIndex !== undefined && poItemIndex !== null && poItemIndex !== ""
      ? `idx-${poItemIndex}`
      : getItemIdentity(item);
  return `${receiveNo}:${lineKey || "item"}`;
}

export function buildCmgStoreReceiveRequest({ receive, po }: { receive: any; po: any }) {
  const receiveNo = normalizeText(receive?.receiveNo || receive?.rpNo);
  const inventoryType = normalizeText(po?.inventoryType || receive?.inventoryType);
  const targetProjectCode = getCmgStoreTargetProjectCode({ receive, po });

  if (!receiveNo) {
    throw new Error("ไม่พบ receiveNo/rpNo สำหรับส่งไป CMG Store Management");
  }
  if (!isCmgStoreEligibleInventoryStatus(inventoryType)) {
    return null;
  }
  if (!targetProjectCode) {
    throw new Error("ส่งไม่ได้: ไม่พบรหัสโครงการสำหรับส่งไป CMG Store Management");
  }

  const header = {
    sourceApp: "PR_PO_SYSTEM",
    receiveNo,
    rpNo: normalizeText(receive?.rpNo || receiveNo),
    poId: normalizeText(receive?.poId || po?.id),
    poNo: normalizeText(receive?.poNo || po?.poNo),
    prNo: normalizeText(receive?.prNo || po?.prNo),
    projectId: targetProjectCode,
    projectItemCode: targetProjectCode,
    cmgProjectCode: targetProjectCode,
    sourceProjectId: normalizeText(receive?.projectId || po?.projectId),
    deliveryLocation: normalizeText(po?.location || receive?.location || receive?.deliveryLocation),
    vendorId: normalizeText(po?.vendorId || receive?.vendorId),
    vendorName: normalizeText(receive?.vendorName || po?.vendorName),
    documentNo: normalizeText(receive?.documentNo),
    receivedDate: normalizeText(receive?.receivedDate),
    receivedByUid: normalizeText(receive?.receivedByUid),
    receivedByName: normalizeText(receive?.receivedByName),
    note: normalizeText(receive?.note),
    createdAt: normalizeText(receive?.createdAt) || new Date().toISOString(),
    receiveType: normalizeText(po?.receiveType || receive?.receiveType),
    inventoryType,
  };

  const rawItems = receive?.items || [];
  const preparedItems = rawItems.map((item: any, idx: number) => {
      const receivedQty = Number(item?.receivedQty ?? item?.qtyReceive ?? 0) || 0;
      const price = Number(item?.price ?? item?.unitPrice ?? 0) || 0;
      const iditem =
        normalizeText(item?.iditem) ||
        normalizeText(item?.idItem) ||
        normalizeText(item?.itemId) ||
        normalizeText(item?.materialId);
      const materialNo = normalizeText(item?.materialNo);
      const description = normalizeText(item?.description || item?.itemName);
      const itemName = normalizeText(item?.itemName || item?.description);
      const matchKey = iditem || materialNo || description;
      const matchKeyType = iditem ? "iditem" : materialNo ? "materialNo" : "description";
      const idempotencyKey = buildItemIdempotencyKey(receiveNo, item);

      return {
        iditem,
        materialNo,
        description,
        itemName,
        unit: normalizeText(item?.unit),
        poItemIndex: Number(item?.poItemIndex ?? 0),
        orderedQty: Number(item?.orderedQty ?? item?.quantity ?? 0) || 0,
        receivedQty,
        qtyReceive: receivedQty,
        price,
        unitPrice: price,
        amount: Number(item?.amount ?? receivedQty * price) || 0,
        idempotencyKey,
        itemKey: matchKey,
        matchKey,
        matchKeyType,
        descriptionKey: description,
        sourceLineNo: idx + 1,
      };
    });

  const itemsWithQty = preparedItems.filter((item: any) => item.receivedQty > 0);
  const missingKeyItems = itemsWithQty.filter((item: any) => !item.matchKey);
  if (missingKeyItems.length > 0) {
    const labels = missingKeyItems
      .slice(0, 5)
      .map((item: any) => `#${item.sourceLineNo} ${item.description || item.itemName || "-"}`)
      .join(", ");
    throw new Error(
      `ส่งไม่ได้: รายการที่รับต้องมี iditem, materialNo หรือรายละเอียดก่อนส่งไป CMG Store Management (${labels}${missingKeyItems.length > 5 ? ", ..." : ""})`
    );
  }

  const items = itemsWithQty.filter((item: any) => item.matchKey);

  if (items.length === 0) {
    throw new Error("ส่งไม่ได้: ไม่มีรายการ receive ที่มีจำนวนรับสำหรับส่งไป CMG Store Management");
  }

  const requestId = buildReceivingRequestDocId(targetProjectCode, receiveNo);
  const sentAt = new Date().toISOString();

  return {
    requestId,
    idempotencyKey: receiveNo,
    sourceApp: "PR_PO_SYSTEM",
    sourcePayloadVersion: 1,
    status: "pending",
    header,
    projectId: targetProjectCode,
    projectItemCode: targetProjectCode,
    cmgProjectCode: targetProjectCode,
    items,
    itemCount: items.length,
    sentAt,
    updatedAt: sentAt,
  };
}

export async function sendReceiveToCmgStore({ receive, po }: { receive: any; po: any }) {
  const payload = buildCmgStoreReceiveRequest({ receive, po });
  if (!payload) {
    return {
      skipped: true,
      status: "skipped",
      reason: `CMG Store Management Status ${po?.inventoryType || receive?.inventoryType || "-"} ไม่ใช่ Inventory`,
    };
  }

  const storeDb = getCmgStoreDb();
  const segments = getReceivingRequestsPathSegments();
  const ref = doc(storeDb, ...segments, payload.requestId);
  await setDoc(ref, payload, { merge: true });

  return {
    skipped: false,
    status: "success",
    requestId: payload.requestId,
    itemCount: payload.itemCount,
    path: `${segments.join("/")}/${payload.requestId}`,
    sentAt: payload.sentAt,
  };
}
