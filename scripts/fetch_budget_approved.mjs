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
  const budgets = await fetchAll('budgets');
  for (const b of budgets) {
    const fields = b.fields || {};
    if (fields.projectId && fields.projectId.stringValue === 'J-72' && fields.code && fields.code.stringValue === '007001001') {
       console.log('Found Budget:', b.name.split('/').pop());
       console.log('Status:', fields.status ? fields.status.stringValue : '');
       console.log('Amount:', fields.amount ? (fields.amount.doubleValue || fields.amount.integerValue || fields.amount.numberValue) : 0);
       console.log('UsedAmount:', fields.usedAmount ? (fields.usedAmount.doubleValue || fields.usedAmount.integerValue || fields.usedAmount.numberValue) : 0);
       const subItems = fields.subItems && fields.subItems.arrayValue ? fields.subItems.arrayValue.values || [] : [];
       for (const sub of subItems) {
          const sFields = sub.mapValue.fields;
          console.log('  SubItem ID:', sFields.id ? sFields.id.stringValue : '', 'Desc:', sFields.description ? sFields.description.stringValue : '', 'Amt:', sFields.amount ? sFields.amount.doubleValue || sFields.amount.integerValue : 0);
       }
    }
  }
}
main().catch(console.error);
