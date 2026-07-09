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
  const allocations = await fetchAll('pr_allocations');
  for (const alloc of allocations) {
    const fields = alloc.fields || {};
    const costCode = fields.costCode ? fields.costCode.stringValue : '';
    if (costCode === '007001001') {
       console.log('PR Alloc:', alloc.name.split('/').pop(), 'Budget:', fields.budgetId ? fields.budgetId.stringValue : 'None', 'Amt:', fields.amount ? fields.amount.doubleValue || fields.amount.integerValue || fields.amount.numberValue : 'None');
    }
  }

  const po_allocations = await fetchAll('po_allocations');
  for (const alloc of po_allocations) {
    const fields = alloc.fields || {};
    const costCode = fields.costCode ? fields.costCode.stringValue : '';
    if (costCode === '007001001') {
       console.log('PO Alloc:', alloc.name.split('/').pop(), 'Budget:', fields.budgetId ? fields.budgetId.stringValue : 'None', 'Amt:', fields.amount ? fields.amount.doubleValue || fields.amount.integerValue || fields.amount.numberValue : 'None');
    }
  }
}
main().catch(console.error);
