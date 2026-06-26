// @ts-nocheck
import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import { appId, db } from "./firebase";
import { stampSignatureToField } from "./pdfForms";

type PoSignatureSlot = "Signature1" | "Signature2" | "Signature3";

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
  },
  Signature3: {
    prefix: "signature3",
    legacyDataUrlFields: ["gmSignatureDataUrl"],
    legacyUrlFields: ["gmSignatureUrl"],
    fallbackUidFields: ["gmApprovedByUid"],
    fallbackEmailFields: ["gmApprovedByEmail", "gmApprovedBy"],
    fallbackNameFields: ["gmApprovedByName"],
  },
};

function firstValue(record: any, fields: string[]) {
  for (const field of fields) {
    const value = record?.[field];
    if (value != null && String(value).trim() !== "") return value;
  }
  return null;
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

export async function resolvePoSignatureImage(
  po: any,
  slot: PoSignatureSlot,
  opts: { currentUserData?: any; currentAuthUser?: any } = {}
) {
  const cfg = SLOT_CONFIG[slot];
  const identity = getSlotIdentity(po, slot);
  const currentIdentity = getUserIdentity(opts.currentUserData, opts.currentAuthUser);

  const isCurrentUser =
    (identity.uid && currentIdentity.uid && String(identity.uid) === String(currentIdentity.uid)) ||
    (identity.email && currentIdentity.email && String(identity.email).toLowerCase() === String(currentIdentity.email).toLowerCase());

  if (isCurrentUser) {
    const currentSig = getUserSignatureImage(opts.currentUserData);
    if (currentSig) return currentSig;
  }

  const userDoc = await findUserByIdentity(identity);
  const userSig = userDoc?.signatureDataUrl || userDoc?.signatureUrl || null;
  if (userSig) return userSig;

  return firstValue(po, cfg.legacyDataUrlFields) || firstValue(po, cfg.legacyUrlFields);
}

export async function stampPoSignaturesToPdf(
  pdfBytes: Uint8Array,
  po: any,
  opts: {
    slots?: PoSignatureSlot[];
    currentUserData?: any;
    currentAuthUser?: any;
    logPrefix?: string;
  } = {}
) {
  const slots = opts.slots || ["Signature1", "Signature2", "Signature3"];
  let bytes = pdfBytes;

  for (const slot of slots) {
    try {
      const signatureImage = await resolvePoSignatureImage(po, slot, opts);
      if (!signatureImage) continue;
      bytes = await stampSignatureToField(bytes, signatureImage, slot);
    } catch (err) {
      console.warn(`${opts.logPrefix || "[PO Signature]"} Stamp ${slot} failed:`, err);
    }
  }

  return bytes;
}
