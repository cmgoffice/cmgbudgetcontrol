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

async function main() {
  console.log('Fetching all PRs...');
  const prs = await fetchAll('prs');
  const pos = await fetchAll('pos');
  
  const problematicPRs = [];

  for (const pr of prs) {
    const fields = pr.fields || {};
    const prNo = fields.prNo ? fields.prNo.stringValue : 'Unknown';
    const prType = fields.prType ? fields.prType.stringValue : '';
    const purchaseType = fields.purchaseType ? fields.purchaseType.stringValue : '';
    
    // check if contract PR
    if (prType === 'contract' || (purchaseType && purchaseType.includes('จ้างเหมา'))) {
      const items = fields.items && fields.items.arrayValue ? fields.items.arrayValue.values || [] : [];
      
      const headerSubItemId = fields.selectedSubItemId ? fields.selectedSubItemId.stringValue : null;
      let hasNullSubItem = false;
      let someHasSubItem = false;
      
      for (const itemObj of items) {
        const item = itemObj.mapValue.fields;
        const sId = item.subItemId ? (item.subItemId.stringValue || item.subItemId.nullValue) : null;
        const bId = item.budgetSubItemId ? (item.budgetSubItemId.stringValue || item.budgetSubItemId.nullValue) : null;
        
        if ((sId && sId !== 'null') || (bId && bId !== 'null')) {
           someHasSubItem = true;
        } else {
           hasNullSubItem = true;
        }
      }
      
      // We flag if:
      // 1. Header has sub-item, but some items don't
      // 2. Mix of items (some have, some don't)
      if ((headerSubItemId && hasNullSubItem) || (someHasSubItem && hasNullSubItem)) {
         problematicPRs.push({
           prNo,
           prId: pr.name.split('/').pop(),
           projectId: fields.projectId ? fields.projectId.stringValue : '',
           headerSubItemId,
           items: items.map((itemObj, idx) => {
              const item = itemObj.mapValue.fields;
              const sId = item.subItemId ? (item.subItemId.stringValue || item.subItemId.nullValue) : 'null';
              return {
                 index: idx,
                 desc: item.description ? item.description.stringValue : '',
                 subItemId: sId
              };
           })
         });
      }
    }
  }

  console.log('--- Summary of Problematic Contract PRs ---');
  if (problematicPRs.length === 0) {
    console.log('No problematic Contract PRs found! All good.');
  } else {
    for (const p of problematicPRs) {
      console.log(`\nPR No: ${p.prNo} (Project: ${p.projectId})`);
      console.log(`Header SubItemId: ${p.headerSubItemId}`);
      console.log(`Items:`);
      for (const item of p.items) {
         const marker = (item.subItemId === 'null' || !item.subItemId) ? '❌ (Needs fix)' : '✅ (OK)';
         console.log(`  - [${item.index}] ${item.desc} | subItemId: ${item.subItemId} ${marker}`);
      }
      
      const matchingPOs = pos.filter(po => {
        const poFields = po.fields || {};
        if (poFields.prNo && poFields.prNo.stringValue === p.prNo) return true;
        if (poFields.prNos && poFields.prNos.arrayValue && poFields.prNos.arrayValue.values) {
           return poFields.prNos.arrayValue.values.some(v => v.stringValue === p.prNo);
        }
        return false;
      });
      
      if (matchingPOs.length > 0) {
         console.log(`  Associated POs: ${matchingPOs.map(po => po.fields.poNo ? po.fields.poNo.stringValue : po.name.split('/').pop()).join(', ')}`);
      } else {
         console.log(`  Associated POs: None found`);
      }
    }
  }
}

main().catch(console.error);
