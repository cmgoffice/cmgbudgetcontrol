// @ts-nocheck
import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import { appId, db } from "./firebase";
import { stampSignatureToField } from "./pdfForms";
import { getUserIdentity, getUserSignatureImage } from "./poSignatureStamps";

type PaymentSignatureSlot = "Signature1" | "Signature2" | "Signature3";

const SLOT_CONFIG: Record<PaymentSignatureSlot, any> = {
  Signature1: {
    prefix: "signature1",
    fallbackUidFields: ["periodPreparedByUid", "preparedByUid", "createdByUid"],
    fallbackEmailFields: ["periodPreparedByEmail", "preparedByEmail", "createdByEmail"],
    fallbackNameFields: ["periodPreparedBy", "preparedByName", "createdByName", "createdBy"],
  },
  Signature2: {
    prefix: "signature2",
    fallbackUidFields: ["periodCheckedByUid", "cmApprovedByUid"],
    fallbackEmailFields: ["periodCheckedByEmail", "cmApprovedByEmail"],
    fallbackNameFields: ["periodCheckedBy", "cmApprovedByName"],
  },
  Signature3: {
    prefix: "signature3",
    fallbackUidFields: ["periodApprovedByUid", "pmApprovedByUid"],
    fallbackEmailFields: ["periodApprovedByEmail", "pmApprovedByEmail"],
    fallbackNameFields: ["periodApprovedBy", "pmApprovedByName"],
  },
};

function firstValue(record: any, fields: string[]) {
  for (const field of fields) {
    const value = record?.[field];
    if (value != null && String(value).trim() !== "") return value;
  }
  return null;
}

function getSlotIdentity(payment: any, slot: PaymentSignatureSlot) {
  const cfg = SLOT_CONFIG[slot];
  return {
    uid: payment?.[`${cfg.prefix}UserUid`] || firstValue(payment, cfg.fallbackUidFields),
    email: payment?.[`${cfg.prefix}UserEmail`] || firstValue(payment, cfg.fallbackEmailFields),
    name: payment?.[`${cfg.prefix}UserName`] || firstValue(payment, cfg.fallbackNameFields),
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

export function buildPaymentSignatureUserFields(slot: PaymentSignatureSlot, userData: any, authUser: any = null) {
  const cfg = SLOT_CONFIG[slot];
  const identity = getUserIdentity(userData, authUser);
  return {
    [`${cfg.prefix}UserUid`]: identity.uid || null,
    [`${cfg.prefix}UserEmail`]: identity.email || null,
    [`${cfg.prefix}UserName`]: identity.name || null,
  };
}

export function clearPaymentSignatureUserFields(slots: PaymentSignatureSlot[]) {
  const patch: Record<string, any> = {};
  slots.forEach((slot) => {
    const cfg = SLOT_CONFIG[slot];
    patch[`${cfg.prefix}UserUid`] = null;
    patch[`${cfg.prefix}UserEmail`] = null;
    patch[`${cfg.prefix}UserName`] = null;
  });
  return patch;
}

async function resolvePaymentSignatureImage(
  payment: any,
  slot: PaymentSignatureSlot,
  opts: { currentUserData?: any; currentAuthUser?: any } = {}
) {
  const identity = getSlotIdentity(payment, slot);
  const currentIdentity = getUserIdentity(opts.currentUserData, opts.currentAuthUser);
  const isCurrentUser =
    (identity.uid && currentIdentity.uid && String(identity.uid) === String(currentIdentity.uid)) ||
    (identity.email && currentIdentity.email && String(identity.email).toLowerCase() === String(currentIdentity.email).toLowerCase()) ||
    (identity.name && currentIdentity.name && String(identity.name).trim().toLowerCase() === String(currentIdentity.name).trim().toLowerCase());

  if (isCurrentUser) {
    const currentSig = getUserSignatureImage(opts.currentUserData);
    if (currentSig) return currentSig;
  }

  const userDoc = await findUserByIdentity(identity);
  return userDoc?.signatureDataUrl || userDoc?.signatureUrl || null;
}

export async function stampPaymentSignaturesToPdf(
  pdfBytes: Uint8Array,
  payment: any,
  opts: {
    slots?: PaymentSignatureSlot[];
    currentUserData?: any;
    currentAuthUser?: any;
    logPrefix?: string;
  } = {}
) {
  const slots = opts.slots || ["Signature1", "Signature2", "Signature3"];
  let bytes = pdfBytes;

  for (const slot of slots) {
    try {
      const signatureImage = await resolvePaymentSignatureImage(payment, slot, opts);
      if (!signatureImage) continue;
      bytes = await stampSignatureToField(bytes, signatureImage, slot);
    } catch (err) {
      console.warn(`${opts.logPrefix || "[Payment Signature]"} Stamp ${slot} failed:`, err);
    }
  }

  return bytes;
}
