import https from 'https';

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
  const pos = await fetchAll('pos');
  
  for (const po of pos) {
    const poStr = JSON.stringify(po);
    if (poStr.includes('J72-DL-010')) {
      console.log('PO Found containing J72-DL-010:', po.name.split('/').pop());
      const fields = po.fields || {};
      const items = fields.items && fields.items.arrayValue ? fields.items.arrayValue.values || [] : [];
      for (const itemObj of items) {
        const item = itemObj.mapValue.fields;
        console.log('  Item:', item.description ? item.description.stringValue : 'No desc', '| subItemId:', item.subItemId ? (item.subItemId.stringValue || item.subItemId.nullValue) : 'undefined', '| budgetSubItemId:', item.budgetSubItemId ? (item.budgetSubItemId.stringValue || item.budgetSubItemId.nullValue) : 'undefined');
      }
    }
  }
}

main().catch(console.error);
