// @ts-nocheck
import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import { getBytes, ref } from "firebase/storage";
import { appId, db, storage } from "./firebase";
import { stampSignatureToField } from "./pdfForms";

type PoSignatureSlot = "Signature1" | "Signature2" | "Signature3";

const SLOT_LABELS: Record<PoSignatureSlot, string> = {
  Signature1: "ผู้สั่งสินค้า / Purchase by",
  Signature2: "ผู้จัดการฝ่ายจัดซื้อ / Procurement Manager",
  Signature3: "ผู้จัดการทั่วไป / General Manager",
};

const SIGNATURE_STORAGE_TIMEOUT_MS = 2500;
const signatureStorageDataUrlCache = new Map<string, Promise<string | null>>();
let lastSignatureStorageError = "";

const SLOT_CONFIG: Record<PoSignatureSlot, any> = {
  Signature1: {
    prefix: "signature1",
    legacyDataUrlFields: ["creatorSignatureDataUrl"],
    legacyUrlFields: ["creatorSignatureUrl"],
    fallbackUidFields: ["createdByUid"],
    fallbackEmailFields: ["createdByEmail", "creatorEmail"],
    fallbackNameFields: ["createdByName"],
  },
  Signature2: {
    prefix: "signature2",
    legacyDataUrlFields: ["pcmSignatureDataUrl"],
    legacyUrlFields: ["pcmSignatureUrl"],
    fallbackUidFields: ["pcmApprovedByUid"],
    fallbackEmailFields: ["pcmApprovedByEmail", "pcmApprovedBy"],
    fallbackNameFields: ["pcmApprovedByName"],
    fallbackRoles: ["PCM"],
  },
  Signature3: {
    prefix: "signature3",
    legacyDataUrlFields: ["gmSignatureDataUrl"],
    legacyUrlFields: ["gmSignatureUrl"],
    fallbackUidFields: ["gmApprovedByUid"],
    fallbackEmailFields: ["gmApprovedByEmail", "gmApprovedBy"],
    fallbackNameFields: ["gmApprovedByName"],
    fallbackRoles: ["GM"],
  },
};

function firstValue(record: any, fields: string[]) {
  for (const field of fields) {
    const value = record?.[field];
    if (value != null && String(value).trim() !== "") return value;
  }
  return null;
}

function pushUnique(values: any[], value: any) {
  if (value == null || String(value).trim() === "") return;
  if (!values.includes(value)) values.push(value);
}

export function getUserIdentity(userData: any, authUser: any = null) {
  const firstName = userData?.firstName || "";
  const lastName = userData?.lastName || "";
  const name = [firstName, lastName].filter(Boolean).join(" ").trim()
    || userData?.displayName
    || userData?.name
    || authUser?.displayName
    || authUser?.email
    || userData?.email
    || "";

  return {
    uid: userData?.uid || authUser?.uid || null,
    email: userData?.email || authUser?.email || null,
    name: name || null,
    firstName: firstName || null,
    lastName: lastName || null,
  };
}

export function getUserSignatureImage(userData: any) {
  return userData?.signatureDataUrl || userData?.signatureUrl || null;
}

export async function resolveCurrentUserSignatureImage(userData: any, authUser: any = null) {
  const identity = getUserIdentity(userData, authUser);
  const uid = identity.uid || userData?.id;
  const storageSig = await getUserStorageSignatureDataUrl({ id: uid, uid });
  return userData?.signatureDataUrl || storageSig || userData?.signatureUrl || null;
}

export function buildPoSignatureUserFields(slot: PoSignatureSlot, userData: any, authUser: any = null) {
  const cfg = SLOT_CONFIG[slot];
  const identity = getUserIdentity(userData, authUser);
  return {
    [`${cfg.prefix}UserUid`]: identity.uid || null,
    [`${cfg.prefix}UserEmail`]: identity.email || null,
    [`${cfg.prefix}UserName`]: identity.name || null,
  };
}

export function buildPoCreatorIdentityFields(existingPo: any, userData: any, authUser: any = null) {
  const current = getUserIdentity(userData, authUser);
  const createdByUid = existingPo?.createdByUid || existingPo?.signature1UserUid || current.uid || null;
  const createdByEmail = existingPo?.createdByEmail || existingPo?.signature1UserEmail || current.email || null;
  const createdByFirstName = existingPo?.createdByFirstName || current.firstName || null;
  const createdByLastName = existingPo?.createdByLastName || current.lastName || null;
  const createdByName = existingPo?.createdByName
    || existingPo?.signature1UserName
    || [createdByFirstName, createdByLastName].filter(Boolean).join(" ").trim()
    || current.name
    || createdByEmail
    || null;

  return {
    createdByUid,
    createdByEmail,
    createdByFirstName,
    createdByLastName,
    ...(createdByName ? { createdByName } : {}),
    signature1UserUid: existingPo?.signature1UserUid || createdByUid || null,
    signature1UserEmail: existingPo?.signature1UserEmail || createdByEmail || null,
    signature1UserName: existingPo?.signature1UserName || createdByName || null,
  };
}

export function buildPoApprovalIdentityFields(slot: "Signature2" | "Signature3", userData: any, authUser: any = null) {
  const identity = getUserIdentity(userData, authUser);
  const fields = buildPoSignatureUserFields(slot, userData, authUser);
  const prefix = slot === "Signature2" ? "pcm" : "gm";
  return {
    ...fields,
    [`${prefix}ApprovedByUid`]: identity.uid || null,
    [`${prefix}ApprovedByEmail`]: identity.email || null,
    [`${prefix}ApprovedByName`]: identity.name || null,
    [`${prefix}ApprovedBy`]: identity.email || identity.name || null,
  };
}

function getSlotIdentity(po: any, slot: PoSignatureSlot) {
  const cfg = SLOT_CONFIG[slot];
  return {
    uid: po?.[`${cfg.prefix}UserUid`] || firstValue(po, cfg.fallbackUidFields),
    email: po?.[`${cfg.prefix}UserEmail`] || firstValue(po, cfg.fallbackEmailFields),
    name: po?.[`${cfg.prefix}UserName`] || firstValue(po, cfg.fallbackNameFields),
  };
}

async function findUserByIdentity(identity: any) {
  const usersPath = ["artifacts", appId, "public", "data", "users"];
  const uid = identity?.uid ? String(identity.uid) : "";
  const email = identity?.email ? String(identity.email).trim() : "";

  if (uid) {
    try {
      const snap = await getDoc(doc(db, ...usersPath, uid));
      if (snap.exists()) return { id: snap.id, ...snap.data() };
    } catch (_) {}

    try {
      const snap = await getDocs(query(collection(db, ...usersPath), where("uid", "==", uid), limit(1)));
      if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
    } catch (_) {}
  }

  if (email) {
    try {
      const snap = await getDocs(query(collection(db, ...usersPath), where("email", "==", email), limit(1)));
      if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
    } catch (_) {}
  }

  return null;
}

async function findUserByRoles(roles: string[] = []) {
  const usersPath = ["artifacts", appId, "public", "data", "users"];
  for (const role of roles) {
    try {
      const snap = await getDocs(query(collection(db, ...usersPath), where("role", "==", role), limit(1)));
      if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
    } catch (_) {}

    try {
      const snap = await getDocs(query(collection(db, ...usersPath), where("roles", "array-contains", role), limit(1)));
      if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
    } catch (_) {}
  }

  return null;
}

async function blobToDataUrl(blob: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Read signature failed"));
    reader.readAsDataURL(blob);
  });
}

function getStorageCorsHint(error: any) {
  const origin = typeof window !== "undefined" ? window.location.origin : "current origin";
  const raw = error?.message || error?.code || String(error || "");
  if (/cors|failed to fetch|err_failed|timeout/i.test(raw)) {
    return `อ่านไฟล์ลายเซ็นจาก Firebase Storage ไม่ได้ เพราะ Storage CORS/permission บล็อก origin ${origin}`;
  }
  return raw || "อ่านไฟล์ลายเซ็นจาก Firebase Storage ไม่ได้";
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: any;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function getUserStorageSignatureDataUrl(userDoc: any) {
  const uid = userDoc?.uid || userDoc?.id;
  if (!uid) return null;

  const cacheKey = String(uid);
  if (!signatureStorageDataUrlCache.has(cacheKey)) {
    signatureStorageDataUrlCache.set(cacheKey, (async () => {
      try {
        const bytes = await withTimeout(
          getBytes(ref(storage, `signatures/${uid}/signature.png`)),
          SIGNATURE_STORAGE_TIMEOUT_MS,
          `signature storage timeout (${SIGNATURE_STORAGE_TIMEOUT_MS}ms)`
        );
        return await blobToDataUrl(new Blob([bytes], { type: "image/png" }));
      } catch (e) {
        lastSignatureStorageError = getStorageCorsHint(e);
        console.warn(`[PO Signature] Cannot read storage signature for ${uid}:`, e);
        return null;
      }
    })());
  }
  return await signatureStorageDataUrlCache.get(cacheKey);
}

function formatSignatureCandidateError(error: any) {
  const raw = error?.message || error?.code || String(error || "");
  if (/cors|failed to fetch|err_failed|access-control-allow-origin/i.test(raw)) {
    return getStorageCorsHint(error);
  }
  return raw || lastSignatureStorageError || "ปั๊มลายเซ็นไม่สำเร็จ";
}

function hasSlotApproval(po: any, slot: PoSignatureSlot) {
  if (slot === "Signature1") return true;
  if (slot === "Signature2") {
    return Boolean(
      po?.pcmApprovedAt ||
      po?.pcmdate ||
      ["Pending GM", "Approved", "Received", "Wait Invoice", "Paid", "Closed PO"].includes(String(po?.status || ""))
    );
  }
  return Boolean(
    po?.gmApprovedAt ||
    po?.gmdate ||
    ["Approved", "Received", "Wait Invoice", "Paid", "Closed PO"].includes(String(po?.status || ""))
  );
}

export async function resolvePoSignatureImage(
  po: any,
  slot: PoSignatureSlot,
  opts: { currentUserData?: any; currentAuthUser?: any } = {}
) {
  const candidates = await resolvePoSignatureImages(po, slot, opts);
  return candidates[0] || null;
}

async function resolvePoSignatureImages(
  po: any,
  slot: PoSignatureSlot,
  opts: { currentUserData?: any; currentAuthUser?: any } = {}
) {
  const cfg = SLOT_CONFIG[slot];
  const identity = getSlotIdentity(po, slot);
  const currentIdentity = getUserIdentity(opts.currentUserData, opts.currentAuthUser);
  const candidates: any[] = [];

  const isCurrentUser =
    (identity.uid && currentIdentity.uid && String(identity.uid) === String(currentIdentity.uid)) ||
    (identity.email && currentIdentity.email && String(identity.email).toLowerCase() === String(currentIdentity.email).toLowerCase());

  if (isCurrentUser) {
    const currentSig = getUserSignatureImage(opts.currentUserData);
    pushUnique(candidates, currentSig);
    pushUnique(candidates, await getUserStorageSignatureDataUrl({ id: currentIdentity.uid, uid: currentIdentity.uid }));
  }

  const userDoc = await findUserByIdentity(identity);
  pushUnique(candidates, await getUserStorageSignatureDataUrl({ id: identity.uid, uid: identity.uid }));
  pushUnique(candidates, userDoc?.signatureDataUrl);
  pushUnique(candidates, await getUserStorageSignatureDataUrl(userDoc));
  pushUnique(candidates, userDoc?.signatureUrl);

  pushUnique(candidates, firstValue(po, cfg.legacyDataUrlFields));

  if (hasSlotApproval(po, slot)) {
    const roleUser = await findUserByRoles(cfg.fallbackRoles);
    pushUnique(candidates, roleUser?.signatureDataUrl);
    pushUnique(candidates, await getUserStorageSignatureDataUrl(roleUser));
    pushUnique(candidates, roleUser?.signatureUrl);
  }

  pushUnique(candidates, firstValue(po, cfg.legacyUrlFields));

  return candidates;
}

export async function stampPoSignaturesToPdf(
  pdfBytes: Uint8Array,
  po: any,
  opts: {
    slots?: PoSignatureSlot[];
    currentUserData?: any;
    currentAuthUser?: any;
    logPrefix?: string;
    requireApprovedSignatures?: boolean;
    onProgress?: (progress: { slot: PoSignatureSlot; slotLabel: string; done: number; total: number; stamped: boolean }) => void;
  } = {}
) {
  const slots = opts.slots || ["Signature1", "Signature2", "Signature3"];
  let bytes = pdfBytes;

  for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
    const slot = slots[slotIndex];
    const slotLabel = SLOT_LABELS[slot] || slot;
    try {
      const signatureImages = await resolvePoSignatureImages(po, slot, opts);
      if (!signatureImages.length) {
        const detail = lastSignatureStorageError ? `: ${lastSignatureStorageError}` : "";
        const msg = `ไม่พบลายเซ็น ${slotLabel}${detail}`;
        if (opts.requireApprovedSignatures && hasSlotApproval(po, slot)) {
          throw new Error(msg);
        }
        console.warn(`${opts.logPrefix || "[PO Signature]"} ${msg}`);
        opts.onProgress?.({ slot, slotLabel, done: slotIndex + 1, total: slots.length, stamped: false });
        continue;
      }

      let stamped = false;
      let lastError: any = null;
      for (const signatureImage of signatureImages) {
        try {
          bytes = await stampSignatureToField(bytes, signatureImage, slot);
          stamped = true;
          break;
        } catch (candidateErr) {
          lastError = candidateErr;
          console.warn(`${opts.logPrefix || "[PO Signature]"} Stamp ${slot} candidate failed:`, candidateErr);
        }
      }
      if (!stamped) {
        const detail = formatSignatureCandidateError(lastError);
        const msg = `ปั๊มลายเซ็น ${slotLabel} ไม่สำเร็จ: ${detail}`;
        if (opts.requireApprovedSignatures && hasSlotApproval(po, slot)) {
          throw new Error(msg);
        }
        console.warn(`${opts.logPrefix || "[PO Signature]"} ${msg}`);
      }
      opts.onProgress?.({ slot, slotLabel, done: slotIndex + 1, total: slots.length, stamped });
    } catch (err) {
      console.warn(`${opts.logPrefix || "[PO Signature]"} Stamp ${slot} failed:`, err);
      if (opts.requireApprovedSignatures && hasSlotApproval(po, slot)) {
        throw err;
      }
      opts.onProgress?.({ slot, slotLabel, done: slotIndex + 1, total: slots.length, stamped: false });
    }
  }

  return bytes;
}
