#!/usr/bin/env node
/**
 * Migration Script: Update existing auto-created Receive documents
 * to use the PO Creator's name and UID instead of the PO Approver's.
 * 
 * Run with:
 * node migrate_receive_creators.mjs
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';

// 1. Read Firebase config from .env
const envContent = readFileSync('.env', 'utf-8');
const envLines = envContent.split('\n');

const config = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
  measurementId: ''
};

envLines.forEach(line => {
  const trimmed = line.trim();
  if (trimmed.startsWith('REACT_APP_FIREBASE_API_KEY=')) {
    config.apiKey = trimmed.split('=')[1];
  } else if (trimmed.startsWith('REACT_APP_FIREBASE_AUTH_DOMAIN=')) {
    config.authDomain = trimmed.split('=')[1];
  } else if (trimmed.startsWith('REACT_APP_FIREBASE_PROJECT_ID=')) {
    config.projectId = trimmed.split('=')[1];
  } else if (trimmed.startsWith('REACT_APP_FIREBASE_STORAGE_BUCKET=')) {
    config.storageBucket = trimmed.split('=')[1];
  } else if (trimmed.startsWith('REACT_APP_FIREBASE_MESSAGING_SENDER_ID=')) {
    config.messagingSenderId = trimmed.split('=')[1];
  } else if (trimmed.startsWith('REACT_APP_FIREBASE_APP_ID=')) {
    config.appId = trimmed.split('=')[1];
  } else if (trimmed.startsWith('REACT_APP_FIREBASE_MEASUREMENT_ID=')) {
    config.measurementId = trimmed.split('=')[1];
  }
});

// Initialize Firebase
const app = initializeApp(config);
const db = getFirestore(app);
const appId = 'cmg-budget-control-default';

async function migrate() {
  try {
    console.log('📦 Loading POs...');
    const posSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'pos'));
    const pos = {};
    posSnap.forEach(d => {
      pos[d.id] = { id: d.id, ...d.data() };
    });
    console.log(`✅ Loaded ${Object.keys(pos).length} POs.`);

    console.log('📦 Loading Receives...');
    const receivesSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'receives'));
    console.log(`✅ Loaded ${receivesSnap.docs.length} Receive documents.`);

    let updatedCount = 0;

    for (const rcvDoc of receivesSnap.docs) {
      const rcv = rcvDoc.data();
      const isAuto = rcv.autoCreatedFromPoApproval || String(rcv.note || '').toLowerCase().includes('auto receive');

      if (isAuto && rcv.poId) {
        const po = pos[rcv.poId];
        if (po) {
          const nameFromFirstLast = [po.createdByFirstName, po.createdByLastName].filter(Boolean).join(' ');
          const creatorName = po.createdByName || nameFromFirstLast || po.createdByUid || 'System';
          const creatorUid = po.createdByUid || null;

          if (rcv.receivedByName !== creatorName || rcv.receivedByUid !== creatorUid) {
            console.log(`🔄 Updating Receive ${rcv.rpNo || rcv.receiveNo || rcvDoc.id}:`);
            console.log(`   - PO: ${po.poNo || po.id}`);
            console.log(`   - Name: "${rcv.receivedByName}" ➡️ "${creatorName}"`);
            console.log(`   - Uid: "${rcv.receivedByUid}" ➡️ "${creatorUid}"`);

            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'receives', rcvDoc.id), {
              receivedByName: creatorName,
              receivedByUid: creatorUid,
              updatedAt: new Date().toISOString()
            });

            updatedCount++;
          }
        }
      }
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log(`🎉 Migration Completed! Updated ${updatedCount} documents.`);
    console.log('═══════════════════════════════════════════════════════');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error running migration:', error);
    process.exit(1);
  }
}

migrate();
