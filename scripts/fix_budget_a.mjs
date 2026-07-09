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

async function main() {
  const docId = 'J-72-007001001-Head office charge job site';
  const url = 'https://firestore.googleapis.com/v1/projects/cmg-budget-control/databases/(default)/documents/artifacts/cmg-budget-control-default/public/data/budgets/' + encodeURIComponent(docId);
  
  const updateFields = {
    usedAmount: { doubleValue: 2657242.50 }
  };
  
  const payload = JSON.stringify({ fields: updateFields });
  
  const updateMask = 'updateMask.fieldPaths=usedAmount';
  const patchUrl = url + '?' + updateMask;
  
  const patchOptions = {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    },
    body: payload
  };
  
  const res = await fetchJson(patchUrl, patchOptions);
  console.log('Update Budget A result:', res.status, res.body);
}

main().catch(console.error);
