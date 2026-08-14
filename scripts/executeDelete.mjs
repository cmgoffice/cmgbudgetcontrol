import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const app = initializeApp({
  apiKey: 'AIzaSyDOqRqNW06Lu5fIQ_2Whr02tg6sn8zltw8',
  authDomain: 'cmg-budget-control.firebaseapp.com',
  projectId: 'cmg-budget-control',
});
const db = getFirestore(app);
const appId = 'cmg-budget-control-default';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const candidatePath = path.join(scriptDir, 'dry_run_delete_candidates.json');

const isSpentInvoice = (invoice) => {
  const status = String(invoice?.status || invoice?.statusNow || '').trim().toLowerCase();
  return status === 'paid' || status === 'invcredit';
};

const getAmount = (invoice) =>
  Number(invoice?.amount) ||
  (Number(invoice?.invoiceQty || 0) * Number(invoice?.price || 0)) ||
  0;

const getPoNo = (invoice) => invoice?.poNo || invoice?.poRef || '';

const sameCandidate = (invoice, expected) =>
  isSpentInvoice(invoice) &&
  String(invoice?.projectId || '') === String(expected?.projectId || '') &&
  String(getPoNo(invoice)) === String(expected?.poNo || '') &&
  Math.abs(getAmount(invoice) - Number(expected?.amount || 0)) <= 0.01;

async function run() {
  if (!process.argv.includes('--confirm-archive') && !process.argv.includes('--confirm-delete')) {
    throw new Error('Archiving is locked. Run with --confirm-archive only after reviewing dry_run_duplicate_invoices_report.txt.');
  }
  if (process.argv.includes('--confirm-delete') && !process.argv.includes('--confirm-archive')) {
    console.warn('Legacy --confirm-delete flag detected; this script now archives/moves records and does not permanently delete them.');
  }
  if (!fs.existsSync(candidatePath)) {
    throw new Error(`Missing dry-run candidate file: ${candidatePath}`);
  }

  const dryRun = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
  const ids = Array.from(new Set(dryRun.candidateArchiveIds || dryRun.candidateDeleteIds || []));
  if (ids.length === 0) {
    console.log('No archive candidates in the reviewed dry-run file. Nothing was moved.');
    return;
  }

  const expectedById = new Map();
  (dryRun.groups || []).forEach((group) => {
    (group.candidateDeleteIds || []).forEach((id) => {
      expectedById.set(String(id), group);
    });
  });

  console.log('Fetching live invoices for archive verification...');
  const invSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'invoices'));
  if (invSnap.metadata?.fromCache) {
    throw new Error('Firestore returned cached/offline data. Archive aborted; no backup or move was performed.');
  }

  const liveById = new Map();
  invSnap.forEach((invoiceDoc) => liveById.set(invoiceDoc.id, { id: invoiceDoc.id, ...invoiceDoc.data() }));

  const missingIds = ids.filter((id) => !liveById.has(String(id)));
  if (missingIds.length > 0) {
    throw new Error(`Live data changed since dry run. Missing candidate IDs: ${missingIds.join(', ')}`);
  }

  const changedIds = ids.filter((id) => !sameCandidate(liveById.get(String(id)), expectedById.get(String(id))));
  if (changedIds.length > 0) {
    throw new Error(`Live candidate data changed since dry run. Re-run dry run before archiving: ${changedIds.join(', ')}`);
  }

  const backupInvoices = ids.map((id) => liveById.get(String(id)));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(scriptDir, `invoice_backup_before_archive_${stamp}.json`);
  const backupPayload = {
    backupCreatedAt: new Date().toISOString(),
    sourceDryRun: dryRun,
    invoices: backupInvoices,
  };

  // Write and verify the backup before moving anything out of invoices.
  fs.writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2));
  const verifiedBackup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  if (!Array.isArray(verifiedBackup.invoices) || verifiedBackup.invoices.length !== backupInvoices.length) {
    throw new Error(`Backup verification failed: ${backupPath}. No invoice was moved.`);
  }
  console.log(`Verified backup: ${backupPath}`);

  const archiveCollection = 'duplicateInvoices';
  const sourceCollection = 'invoices';
  const archiveAt = new Date().toISOString();

  // Each candidate needs one archive write plus one source delete.
  // Keep batches below Firestore's 500-operation limit.
  for (let offset = 0; offset < ids.length; offset += 200) {
    const batch = writeBatch(db);
    ids.slice(offset, offset + 200).forEach((id) => {
      const invoice = liveById.get(String(id));
      const group = expectedById.get(String(id)) || {};
      const archiveRef = doc(db, 'artifacts', appId, 'public', 'data', archiveCollection, String(id));
      const sourceRef = doc(db, 'artifacts', appId, 'public', 'data', sourceCollection, String(id));

      batch.set(archiveRef, {
        ...invoice,
        archivedAt: archiveAt,
        archivedFromCollection: sourceCollection,
        archivedFromId: String(id),
        archiveReason: 'Potential duplicate invoice',
        duplicateGroupKey: group.key || '',
        duplicateGroup: {
          projectId: group.projectId || '',
          poNo: group.poNo || '',
          amount: Number(group.amount || getAmount(invoice)),
          suggestedKeepId: group.suggestedKeepId || '',
        },
      });
      batch.delete(sourceRef);
    });
    await batch.commit();
    console.log(`Moved ${Math.min(offset + 200, ids.length)}/${ids.length} to ${archiveCollection}`);
  }

  console.log(`Archive complete. Moved ${ids.length} duplicate invoice document(s) to ${archiveCollection}.`);
  console.log(`Backup retained at: ${backupPath}`);
}

run().catch((error) => {
  console.error(`ARCHIVE ABORTED: ${error?.message || error}`);
  process.exitCode = 1;
});
