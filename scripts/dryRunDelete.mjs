import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
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

const isSpentInvoice = (invoice) => {
  const status = String(invoice?.status || invoice?.statusNow || '').trim().toLowerCase();
  return status === 'paid' || status === 'invcredit';
};

const getAmount = (invoice) =>
  Number(invoice?.amount) ||
  (Number(invoice?.invoiceQty || 0) * Number(invoice?.price || 0)) ||
  0;

const getDateValue = (invoice) => {
  const raw = invoice?.createdAt || invoice?.invDate || invoice?.date || 0;
  const value = new Date(raw).getTime();
  return Number.isFinite(value) ? value : 0;
};

const formatAmount = (amount) =>
  Number(amount || 0).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

async function run() {
  console.log('Fetching live invoices for dry run...');
  const invSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'invoices'));

  // Firestore can return an empty local-cache snapshot while the network is
  // unavailable. Never treat that as a clean database for a deletion dry run.
  if (invSnap.metadata?.fromCache) {
    throw new Error('Firestore returned cached/offline data. Dry run aborted; no live duplicate result is valid.');
  }

  const invoices = [];
  invSnap.forEach((invoiceDoc) => invoices.push({ id: invoiceDoc.id, ...invoiceDoc.data() }));
  if (invoices.length === 0) {
    throw new Error('Live invoice collection is empty. Dry run aborted instead of assuming there are no duplicates.');
  }

  const grouped = new Map();
  invoices.forEach((invoice) => {
    if (!isSpentInvoice(invoice)) return;
    const poNo = invoice.poNo || invoice.poRef;
    if (!poNo) return;

    const amount = getAmount(invoice);
    const key = `${invoice.projectId || ''}_${poNo}_${amount}`;
    const group = grouped.get(key) || [];
    group.push(invoice);
    grouped.set(key, group);
  });

  const duplicateGroups = Array.from(grouped.entries())
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => {
      const sorted = [...group].sort((a, b) => {
        const dateDiff = getDateValue(a) - getDateValue(b);
        return dateDiff || String(a.id).localeCompare(String(b.id));
      });
      const keep = sorted[0];
      const candidates = sorted.slice(1);
      return {
        key,
        projectId: keep.projectId || '',
        poNo: keep.poNo || keep.poRef || '',
        amount: getAmount(keep),
        suggestedKeepId: keep.id,
        candidateDeleteIds: candidates.map((invoice) => invoice.id),
        invoices: sorted.map((invoice) => ({
          id: invoice.id,
          invNo: invoice.invNo || invoice.invoiceNo || invoice.docNo || '',
          status: invoice.status || invoice.statusNow || '',
          paymentType: invoice.paymentType || '',
          amount: getAmount(invoice),
          createdAt: invoice.createdAt || invoice.invDate || invoice.date || '',
          receiveIds: Array.isArray(invoice.receiveIds) ? invoice.receiveIds : [],
        })),
      };
    })
    .sort((a, b) => `${a.projectId}_${a.poNo}`.localeCompare(`${b.projectId}_${b.poNo}`));

  const candidateDeleteIds = duplicateGroups.flatMap((group) => group.candidateDeleteIds);
  const reportLines = [
    '=== Invoice Duplicate Dry Run ===',
    `Generated: ${new Date().toISOString()}`,
    `Live invoices scanned: ${invoices.length}`,
    `Potential duplicate groups: ${duplicateGroups.length}`,
    `Suggested candidates to archive/move: ${candidateDeleteIds.length}`,
    '',
  ];

  duplicateGroups.forEach((group, index) => {
    reportLines.push(`GROUP ${index + 1}`);
    reportLines.push(`Project ID: ${group.projectId || '-'}`);
    reportLines.push(`PO: ${group.poNo || '-'} | Amount: ${formatAmount(group.amount)}`);
    reportLines.push(`Suggested KEEP: ${group.suggestedKeepId}`);
    group.invoices.forEach((invoice) => {
      const marker = invoice.id === group.suggestedKeepId ? 'KEEP ' : 'CHECK';
      reportLines.push(
        `  ${marker} | Invoice ID: ${invoice.id} | No: ${invoice.invNo || '-'} | ` +
        `Status: ${invoice.status || '-'} | Amount: ${formatAmount(invoice.amount)} | ` +
        `Created: ${invoice.createdAt || '-'} | Receive IDs: ${invoice.receiveIds.join(',') || '-'}`
      );
    });
    reportLines.push('');
  });

  if (duplicateGroups.length === 0) {
    reportLines.push('No potential duplicate groups found.');
  }

  const report = reportLines.join('\n');
  console.log(report);

  fs.writeFileSync(path.join(scriptDir, 'dry_run_duplicate_invoices_report.txt'), report + '\n');
  fs.writeFileSync(
    path.join(scriptDir, 'dry_run_invoice_groups.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), groups: duplicateGroups }, null, 2)
  );
  fs.writeFileSync(
    path.join(scriptDir, 'dry_run_delete_candidates.json'),
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      source: 'dryRunDelete.mjs',
      candidateArchiveIds: candidateDeleteIds,
      // Keep the legacy key so reviewed dry-run files remain compatible.
      candidateDeleteIds,
      groups: duplicateGroups.map((group) => ({
        key: group.key,
        projectId: group.projectId,
        poNo: group.poNo,
        amount: group.amount,
        suggestedKeepId: group.suggestedKeepId,
        candidateArchiveIds: group.candidateDeleteIds,
        // Keep the legacy key so reviewed dry-run files remain compatible.
        candidateDeleteIds: group.candidateDeleteIds,
      })),
    }, null, 2)
  );

  console.log(`Report saved: ${path.join(scriptDir, 'dry_run_duplicate_invoices_report.txt')}`);
  console.log(`Review file saved: ${path.join(scriptDir, 'dry_run_delete_candidates.json')}`);
  console.log('No invoice was deleted.');
}

run().catch((error) => {
  console.error(`DRY RUN ABORTED: ${error?.message || error}`);
  process.exitCode = 1;
});
