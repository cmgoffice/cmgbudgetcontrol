#!/usr/bin/env node
/**
 * Migration: remove base64 signature fields from existing PO documents.
 *
 * Fields removed:
 * - creatorSignatureDataUrl
 * - pcmSignatureDataUrl
 * - gmSignatureDataUrl
 */

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  query,
  where,
  limit,
  writeBatch,
  deleteField,
} from "firebase/firestore";
import { readFileSync } from "fs";
import { mkdirSync, createWriteStream, existsSync } from "fs";
import { join } from "path";

const envContent = readFileSync(".env", "utf-8");
const env = {};
envContent.split(/\r?\n/).forEach((line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return;
  const idx = trimmed.indexOf("=");
  if (idx === -1) return;
  env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
});

const config = {
  apiKey: env.REACT_APP_FIREBASE_API_KEY,
  authDomain: env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.REACT_APP_FIREBASE_APP_ID,
  measurementId: env.REACT_APP_FIREBASE_MEASUREMENT_ID,
};

const missing = Object.entries(config)
  .filter(([key, value]) => key !== "measurementId" && !value)
  .map(([key]) => key);

if (missing.length) {
  console.error(`Missing Firebase config: ${missing.join(", ")}`);
  process.exit(1);
}

const app = initializeApp(config);
const db = getFirestore(app);
const appId = "cmg-budget-control-default";
const args = new Set(process.argv.slice(2));
const dryRun = !args.has("--yes");
const batchSizeArg = process.argv.slice(2).find((arg) => arg.startsWith("--batch-size="));
const batchSize = Math.max(1, Math.min(25, Number(batchSizeArg?.split("=")[1] || 5) || 5));
const restoreArg = process.argv.slice(2).find((arg) => arg.startsWith("--restore="));
const restorePath = restoreArg ? restoreArg.slice("--restore=".length) : "";
const signatureFields = [
  "creatorSignatureDataUrl",
  "pcmSignatureDataUrl",
  "gmSignatureDataUrl",
];

function roughStringBytes(value) {
  return typeof value === "string" ? Buffer.byteLength(value, "utf8") : 0;
}

function createBackupWriter() {
  mkdirSync("migration-logs", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join("migration-logs", `po-signature-base64-backup-${stamp}.jsonl`);
  return {
    path,
    stream: createWriteStream(path, { flags: "wx", encoding: "utf8" }),
  };
}

function writeBackupLine(stream, entry) {
  stream.write(`${JSON.stringify(entry)}\n`);
}

async function restoreFromBackup(path) {
  if (!path || !existsSync(path)) {
    throw new Error(`Backup file not found: ${path}`);
  }

  console.log(`Restoring PO signature fields from: ${path}`);
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
  const byDoc = new Map();
  for (const line of lines) {
    const entry = JSON.parse(line);
    if (!entry?.id || !entry?.fields || typeof entry.fields !== "object") continue;
    const current = byDoc.get(entry.id) || {};
    byDoc.set(entry.id, { ...current, ...entry.fields });
  }

  let batch = writeBatch(db);
  let batchCount = 0;
  let restored = 0;

  for (const [id, fields] of byDoc.entries()) {
    batch.update(doc(db, "artifacts", appId, "public", "data", "pos", id), fields);
    batchCount++;
    if (batchCount >= 450) {
      await batch.commit();
      restored += batchCount;
      console.log(`Restored ${restored}/${byDoc.size}`);
      batch = writeBatch(db);
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
    restored += batchCount;
  }

  console.log(`Restore complete: ${restored} document(s)`);
}

async function processFieldInSmallBatches(field, backup) {
  const posRef = collection(db, "artifacts", appId, "public", "data", "pos");
  let updated = 0;
  let estimatedBytesRemoved = 0;
  let round = 0;

  while (true) {
    round++;
    const snap = await getDocs(query(posRef, where(field, "!=", null), limit(batchSize)));
    if (snap.empty) break;

    const batch = dryRun ? null : writeBatch(db);
    snap.docs.forEach((poDoc) => {
      const data = poDoc.data();
      estimatedBytesRemoved += roughStringBytes(data[field]);
      if (!dryRun && backup?.stream) {
        writeBackupLine(backup.stream, {
          id: poDoc.id,
          poNo: data.poNo || poDoc.id,
          field,
          fields: {
            [field]: data[field],
          },
          backedUpAt: new Date().toISOString(),
        });
      }
      if (!dryRun) {
        batch.update(doc(db, "artifacts", appId, "public", "data", "pos", poDoc.id), {
          [field]: deleteField(),
        });
      }
      if (dryRun) {
        console.log(`- ${field}: ${data.poNo || poDoc.id} (${(roughStringBytes(data[field]) / 1024).toFixed(1)} KB)`);
      }
    });

    if (dryRun) {
      updated += snap.size;
      console.log(`Dry run stopped after ${updated} sample doc(s) for ${field}. No data was changed.`);
      break;
    }

    await batch.commit();
    updated += snap.size;
    console.log(`Committed ${field}: ${updated} docs (${round} batch${round === 1 ? "" : "es"})`);

    // A tiny pause avoids hammering Firestore while its indexes catch up.
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return { updated, estimatedBytesRemoved };
}

async function main() {
  if (restorePath) {
    await restoreFromBackup(restorePath);
    return;
  }

  console.log("PO base64 signature field migration");
  console.log(`Mode: ${dryRun ? "DRY RUN (no writes)" : "LIVE WRITE"}`);
  console.log(`Batch size: ${batchSize}`);
  if (dryRun) {
    console.log("To run the real migration, execute: node migrate_remove_po_signature_base64.mjs --yes");
  }
  let totalUpdated = 0;
  let totalEstimatedBytesRemoved = 0;
  const backup = dryRun ? null : createBackupWriter();
  if (backup) {
    console.log(`Rollback backup log: ${backup.path}`);
  }

  try {
    for (const field of signatureFields) {
      console.log(`\nScanning field: ${field}`);
      try {
        const result = await processFieldInSmallBatches(field, backup);
        totalUpdated += result.updated;
        totalEstimatedBytesRemoved += result.estimatedBytesRemoved;
        console.log(`Done ${field}: ${result.updated} ${dryRun ? "sample document(s)" : "document update(s)"}`);
      } catch (err) {
        if (err?.code === "failed-precondition") {
          console.error(`Firestore needs an index for field ${field}. Open the Firebase error link above, create the index, then rerun this script.`);
        }
        throw err;
      }
    }
  } finally {
    if (backup?.stream) {
      await new Promise((resolve) => backup.stream.end(resolve));
    }
  }

  console.log(dryRun ? "Dry run complete. No data was changed." : "Migration complete.");
  console.log(`Total ${dryRun ? "sample docs found" : "field removals"}: ${totalUpdated}`);
  console.log(`Estimated string bytes ${dryRun ? "in sample" : "removed"}: ${(totalEstimatedBytesRemoved / 1024 / 1024).toFixed(2)} MB`);
  if (backup) {
    console.log(`Rollback command: node migrate_remove_po_signature_base64.mjs --restore=${backup.path}`);
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
