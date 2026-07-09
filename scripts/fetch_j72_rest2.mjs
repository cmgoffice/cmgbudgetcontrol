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
  const prs = await fetchAll('prs');
  for (const pr of prs) {
    const fields = pr.fields || {};
    const items = fields.items && fields.items.arrayValue ? fields.items.arrayValue.values || [] : [];
    for (const itemObj of items) {
      const item = itemObj.mapValue.fields;
      const costCode = item.costCode ? item.costCode.stringValue : '';
      if (costCode === '007001001') {
        let amt = 0;
        if (item.amount) {
          amt = Number(item.amount.doubleValue || item.amount.integerValue || item.amount.numberValue);
        } else {
           const qty = Number((item.quantity && (item.quantity.doubleValue || item.quantity.integerValue)) || 0);
           const price = Number((item.price && (item.price.doubleValue || item.price.integerValue)) || 0);
           amt = qty * price;
        }
        console.log('PR', pr.name.split('/').pop(), 'Status:', fields.status ? fields.status.stringValue : 'None', 'Amt:', amt, 'Project:', fields.projectId ? fields.projectId.stringValue : 'None');
      }
    }
  }
}
main().catch(console.error);
