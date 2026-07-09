import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('c:/Users/Administrator/Pictures/Git Repository/cmgbudgetcontrol/firebase-service-account.json', 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function run() {
  const projectId = 'J-72';
  const costCode = '004002001';
  
  const budgetRef = db.collection('projects').doc(projectId).collection('budgets').doc(projectId + '-' + costCode + '-Civil Sub contractor (ผู้รับเหมาช่วงค่าแรง)');
  const budgetDoc = await budgetRef.get();
  console.log('Budget:', budgetDoc.data());

  const subItemsRef = budgetRef.collection('subItems');
  const subItemsSnap = await subItemsRef.get();
  subItemsSnap.forEach(doc => {
    console.log('SubItem:', doc.id, 'desc:', doc.data().description, 'balance:', doc.data().balance, 'prTotal:', doc.data().prTotal, 'poTotal:', doc.data().poTotal, 'budget:', doc.data().budget);
  });

  const prId = 'J72-DL-010';
  const prsRef = db.collection('projects').doc(projectId).collection('prs').where('prNo', '==', prId);
  const prsSnap = await prsRef.get();
  prsSnap.forEach(doc => {
    console.log('PR:', doc.id, JSON.stringify(doc.data().items, null, 2));
  });
}

run().catch(console.error);
