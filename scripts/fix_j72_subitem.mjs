import https from 'https';
import fs from 'fs';

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch(e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    if (options.body) req.write(options.body);
    req.on('error', reject);
    req.end();
  });
}

async function fetchDoc(collection, docId) {
  const url = `https://firestore.googleapis.com/v1/projects/cmg-budget-control/databases/(default)/documents/artifacts/cmg-budget-control-default/public/data/${collection}/${docId}`;
  const res = await fetchJson(url);
  if (res.status === 200 && res.body.fields) return res.body;
  return null;
}

async function fetchAll(collectionId) {
  let allDocs = [];
  let pageToken = '';
  do {
    const url = 'https://firestore.googleapis.com/v1/projects/cmg-budget-control/databases/(default)/documents/artifacts/cmg-budget-control-default/public/data/' + collectionId + '?pageSize=300' + (pageToken ? '&pageToken=' + pageToken : '');
    const res = await fetchJson(url);
    if (res.body && res.body.documents) {
      allDocs = allDocs.concat(res.body.documents);
    }
    pageToken = res.body ? res.body.nextPageToken : null;
  } while (pageToken);
  return allDocs;
}

async function patchDoc(collection, docId, updateMask, fields) {
  const mask = updateMask.map(m => `updateMask.fieldPaths=${encodeURIComponent(m)}`).join('&');
  const url = `https://firestore.googleapis.com/v1/projects/cmg-budget-control/databases/(default)/documents/artifacts/cmg-budget-control-default/public/data/${collection}/${docId}?${mask}`;
  
  const res = await fetchJson(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  });
  return res;
}

async function main() {
  const prId = 'J72-DL-010';
  const poDocId = 'nOc1V9vQYPMDKBzqzqJs';
  const targetSubItemId = 'a99a4a91-6736-42bc-adc8-c61417b1f9b5';
  
  // 1. Find PR Doc Id
  console.log('Finding PR Doc Id...');
  const prs = await fetchAll('prs');
  let prDoc = null;
  let prDocId = null;
  for (const pr of prs) {
    if (pr.fields && pr.fields.prNo && pr.fields.prNo.stringValue === prId) {
      prDoc = pr;
      prDocId = pr.name.split('/').pop();
      break;
    }
  }
  
  if (!prDocId) {
    console.error('Could not find PR', prId);
    return;
  }
  
  // 2. Fetch PO Doc
  const poDoc = await fetchDoc('pos', poDocId);
  if (!poDoc) {
    console.error('Could not find PO', poDocId);
    return;
  }
  
  // 3. Save Rollback Backup
  const rollbackData = {
    timestamp: new Date().toISOString(),
    pr: prDoc,
    po: poDoc
  };
  fs.writeFileSync('scripts/rollback_J72_DL_010.json', JSON.stringify(rollbackData, null, 2));
  console.log('Rollback backup saved to scripts/rollback_J72_DL_010.json');
  
  // 4. Patch PR
  console.log('Patching PR items...');
  const prItems = prDoc.fields.items.arrayValue.values;
  for (let i = 0; i < prItems.length; i++) {
    const item = prItems[i].mapValue.fields;
    item.subItemId = { stringValue: targetSubItemId };
    item.budgetSubItemId = { stringValue: targetSubItemId };
  }
  const prRes = await patchDoc('prs', prDocId, ['items'], { items: { arrayValue: { values: prItems } } });
  console.log('PR patch result:', prRes.status);
  
  // 5. Patch PO
  console.log('Patching PO items...');
  const poItems = poDoc.fields.items.arrayValue.values;
  for (let i = 0; i < poItems.length; i++) {
    const item = poItems[i].mapValue.fields;
    item.subItemId = { stringValue: targetSubItemId };
    item.budgetSubItemId = { stringValue: targetSubItemId };
  }
  const poRes = await patchDoc('pos', poDocId, ['items'], { items: { arrayValue: { values: poItems } } });
  console.log('PO patch result:', poRes.status);
  
  console.log('Done! Both PR and PO have been successfully patched.');
}

main().catch(console.error);
