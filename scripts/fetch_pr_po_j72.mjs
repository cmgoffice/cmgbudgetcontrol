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

async function queryCollection(collectionId) {
  const url = 'https://firestore.googleapis.com/v1/projects/cmg-budget-control/databases/(default)/documents:runQuery';
  
  const payload = {
    structuredQuery: {
      from: [{ collectionId: collectionId }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: 'projectId' },
                op: 'EQUAL',
                value: { stringValue: 'J-72' }
              }
            }
          ]
        }
      }
    }
  };
  
  const res = await fetchJson(url, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  
  return res.body;
}

async function main() {
  const prs = await queryCollection('purchaseRequests');
  let count = 0;
  if (Array.isArray(prs)) {
    for (let r of prs) {
      if (r.document) count++;
    }
  }
  console.log('Found PRs:', count);

  const pos = await queryCollection('purchaseOrders');
  let countPos = 0;
  if (Array.isArray(pos)) {
    for (let r of pos) {
      if (r.document) countPos++;
    }
  }
  console.log('Found POs:', countPos);
}

main().catch(console.error);
