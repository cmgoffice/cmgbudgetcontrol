import { initializeApp } from 'firebase/app';
import { getFirestore, doc, deleteDoc } from 'firebase/firestore';
import * as fs from 'fs';

const app = initializeApp({
  apiKey: 'AIzaSyDOqRqNW06Lu5fIQ_2Whr02tg6sn8zltw8',
  authDomain: 'cmg-budget-control.firebaseapp.com',
  projectId: 'cmg-budget-control',
});
const db = getFirestore(app);
const appId = 'cmg-budget-control-default';

async function run() {
  const data = JSON.parse(fs.readFileSync('deleted_invoices_backup.json', 'utf8'));
  console.log(`Deleting ${data.length} invoices...`);
  for (const inv of data) {
     const id = inv.id;
     await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'invoices', id));
     console.log('Deleted', id);
  }
  console.log('Deletion complete!');
  process.exit(0);
}
run().catch(console.error);
