import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const app = initializeApp({
  apiKey: 'AIzaSyDOqRqNW06Lu5fIQ_2Whr02tg6sn8zltw8',
  authDomain: 'cmg-budget-control.firebaseapp.com',
  projectId: 'cmg-budget-control',
});
const db = getFirestore(app);
const appId = 'cmg-budget-control-default';

async function run() {
  console.log("Fetching invoices...");
  const invSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'invoices'));
  const invoices = [];
  invSnap.forEach(doc => invoices.push({id: doc.id, ...doc.data()}));

  const grouped = new Map();
  invoices.forEach(inv => {
     const poNo = inv.poNo || inv.poRef;
     if (!poNo) return; 
     
     const amt = Number(inv.amount) || (Number(inv.invoiceQty||0)*Number(inv.price||0)) || 0;
     const key = `${inv.projectId}_${poNo}_${amt}`;
     
     if (!grouped.has(key)) {
         grouped.set(key, []);
     }
     grouped.get(key).push(inv);
  });

  const duplicates = [];
  grouped.forEach((invList, key) => {
     if (invList.length > 1) {
         duplicates.push({ key, invoices: invList });
     }
  });

  const toBeDeleted = [];
  const kept = [];

  duplicates.forEach(dup => {
      // Sort invoices by date descending (newest first)
      const sortedInvs = dup.invoices.sort((a, b) => {
          const dateA = new Date(a.date || a.createdAt || a.invoiceDate || 0).getTime();
          const dateB = new Date(b.date || b.createdAt || b.invoiceDate || 0).getTime();
          if (dateB !== dateA) {
              return dateB - dateA; // latest first
          }
          // If dates are identical, use ID string comparison for deterministic sort
          return b.id.localeCompare(a.id);
      });
      
      const [latest, ...rest] = sortedInvs;
      kept.push(latest);
      toBeDeleted.push(...rest);
  });

  console.log(`Found ${toBeDeleted.length} duplicate invoices to delete.`);
  console.log(`Keeping ${kept.length} latest invoices.`);

  // Save the full data of invoices to be deleted as a backup
  fs.writeFileSync('deleted_invoices_backup.json', JSON.stringify(toBeDeleted, null, 2));
  console.log("Saved full backup to 'deleted_invoices_backup.json'. This can be used for rollback.");
  
  // Write restore script
  const restoreScript = `import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import * as fs from 'fs';

const app = initializeApp({
  apiKey: 'AIzaSyDOqRqNW06Lu5fIQ_2Whr02tg6sn8zltw8',
  authDomain: 'cmg-budget-control.firebaseapp.com',
  projectId: 'cmg-budget-control',
});
const db = getFirestore(app);
const appId = '${appId}';

async function run() {
  const data = JSON.parse(fs.readFileSync('deleted_invoices_backup.json', 'utf8'));
  console.log(\`Restoring \${data.length} invoices...\`);
  for (const inv of data) {
     const id = inv.id;
     const docData = { ...inv };
     delete docData.id;
     await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'invoices', id), docData);
     console.log('Restored', id);
  }
  console.log('Restore complete!');
  process.exit(0);
}
run().catch(console.error);
`;
  fs.writeFileSync('restoreInvoices.mjs', restoreScript);
  
  // Write delete script
  const deleteScript = `import { initializeApp } from 'firebase/app';
import { getFirestore, doc, deleteDoc } from 'firebase/firestore';
import * as fs from 'fs';

const app = initializeApp({
  apiKey: 'AIzaSyDOqRqNW06Lu5fIQ_2Whr02tg6sn8zltw8',
  authDomain: 'cmg-budget-control.firebaseapp.com',
  projectId: 'cmg-budget-control',
});
const db = getFirestore(app);
const appId = '${appId}';

async function run() {
  const data = JSON.parse(fs.readFileSync('deleted_invoices_backup.json', 'utf8'));
  console.log(\`Deleting \${data.length} invoices...\`);
  for (const inv of data) {
     const id = inv.id;
     await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'invoices', id));
     console.log('Deleted', id);
  }
  console.log('Deletion complete!');
  process.exit(0);
}
run().catch(console.error);
`;
  fs.writeFileSync('executeDelete.mjs', deleteScript);

  process.exit(0);
}
run().catch(console.error);
