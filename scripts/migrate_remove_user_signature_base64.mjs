#!/usr/bin/env node
/**
 * Migration: remove base64 signatureDataUrl from user documents.
 *
 * The app should store signature files in Firebase Storage and keep only
 * signatureUrl / identity metadata in Firestore. This script defaults to
 * dry-run and writes a rollback backup when run with --yes.
 */

import { deleteApp, initializeApp } from "firebase/app";
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
import { readFileSync, mkdirSync, createWriteStream, existsSync } from "fs";
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
const batchSize = Math.max(1, Math.min(25, Number(batchSizeArg?.split("=")[1] || 10) || 10));
const restoreArg = process.argv.slice(2).find((arg) => arg.startsWith("--restore="));
const restorePath = restoreArg ? restoreArg.slice("--restore=".length) : "";

function roughStringBytes(value) {
  return typeof value === "string" ? Buffer.byteLength(value, "utf8") : 0;
}

function createBackupWriter() {
  mkdirSync("migration-logs", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join("migration-logs", `user-signature-base64-backup-${stamp}.jsonl`);
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

  console.log(`Restoring user signatureDataUrl from: ${path}`);
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
  let batch = writeBatch(db);
  let batchCount = 0;
  let restored = 0;

  for (const line of lines) {
    const entry = JSON.parse(line);
    if (!entry?.id || !entry?.signatureDataUrl) continue;
    batch.update(doc(db, "artifacts", appId, "public", "data", "users", entry.id), {
      signatureDataUrl: entry.signatureDataUrl,
    });
    batchCount++;
    if (batchCount >= 450) {
      await batch.commit();
      restored += batchCount;
      console.log(`Restored ${restored}`);
      batch = writeBatch(db);
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
    restored += batchCount;
  }

  console.log(`Restore complete: ${restored} user document(s)`);
}

async function main() {
  if (restorePath) {
    await restoreFromBackup(restorePath);
    return;
  }

  console.log("User signatureDataUrl cleanup");
  console.log(`Mode: ${dryRun ? "DRY RUN (no writes)" : "LIVE WRITE"}`);
  console.log(`Batch size: ${batchSize}`);
  if (dryRun) {
    console.log("To run live: node migrate_remove_user_signature_base64.mjs --yes");
  }

  const usersRef = collection(db, "artifacts", appId, "public", "data", "users");
  const backup = dryRun ? null : createBackupWriter();
  if (backup) console.log(`Rollback backup log: ${backup.path}`);

  let totalUpdated = 0;
  let estimatedBytesRemoved = 0;

  try {
    while (true) {
      const snap = await getDocs(query(usersRef, where("signatureDataUrl", "!=", null), limit(batchSize)));
      if (snap.empty) break;

      if (dryRun) {
        snap.docs.forEach((userDoc) => {
          const data = userDoc.data();
          const bytes = roughStringBytes(data.signatureDataUrl);
          estimatedBytesRemoved += bytes;
          console.log(`- ${data.email || userDoc.id}: ${(bytes / 1024).toFixed(1)} KB`);
        });
        totalUpdated += snap.size;
        break;
      }

      const batch = writeBatch(db);
      snap.docs.forEach((userDoc) => {
        const data = userDoc.data();
        const bytes = roughStringBytes(data.signatureDataUrl);
        estimatedBytesRemoved += bytes;
        if (backup?.stream) {
          writeBackupLine(backup.stream, {
            id: userDoc.id,
            email: data.email || "",
            signatureDataUrl: data.signatureDataUrl,
            backedUpAt: new Date().toISOString(),
          });
        }
        batch.update(doc(db, "artifacts", appId, "public", "data", "users", userDoc.id), {
          signatureDataUrl: deleteField(),
        });
      });

      await batch.commit();
      totalUpdated += snap.size;
      console.log(`Committed ${totalUpdated} user document(s)`);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  } finally {
    if (backup?.stream) {
      await new Promise((resolve) => backup.stream.end(resolve));
    }
  }

  console.log(dryRun ? "Dry run complete. No data was changed." : "Cleanup complete.");
  console.log(`Total ${dryRun ? "sample docs found" : "docs updated"}: ${totalUpdated}`);
  console.log(`Estimated bytes ${dryRun ? "in sample" : "removed"}: ${(estimatedBytesRemoved / 1024 / 1024).toFixed(2)} MB`);
  if (backup) console.log(`Rollback command: node migrate_remove_user_signature_base64.mjs --restore=${backup.path}`);
}

main()
  .then(async () => {
    await deleteApp(app);
  })
  .catch(async (err) => {
    console.error("Migration failed:", err);
    try { await deleteApp(app); } catch (_) {}
    process.exit(1);
  });
