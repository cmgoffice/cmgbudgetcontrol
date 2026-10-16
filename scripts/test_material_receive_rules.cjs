const assert = require('assert/strict');
const project = 'demo-material-approve';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8289';
assert.match(emulatorHost, /^127\.0\.0\.1:\d+$/, 'Only a local emulator is allowed');
const root = `http://${emulatorHost}/v1/projects/${project}/databases/(default)/documents`;
const base = 'artifacts/test-app/public/data';
const encode = (value) => {
  if (value === null) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) } };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return { doubleValue: value };
  return { stringValue: value };
};
function token(uid) {
  const now = Math.floor(Date.now() / 1000);
  return Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' +
    Buffer.from(JSON.stringify({ iss: `https://securetoken.google.com/${project}`, aud: project, sub: uid, user_id: uid, iat: now, exp: now + 3600, auth_time: now, firebase: { sign_in_provider: 'custom', identities: {} } })).toString('base64url') + '.';
}
async function write(path, data, auth = 'owner', mask = []) {
  return fetch(`${root}/${base}/${path}${mask.length ? '?' + mask.map((key) => `updateMask.fieldPaths=${key}`).join('&') : ''}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: encode(data).mapValue.fields }),
  });
}
async function expected(response, code, label) {
  const body = await response.text();
  assert.equal(response.status, code, `${label}: ${body}`);
  console.log('PASS ' + label);
}
async function confirm(poId, auth, extraFields = {}) {
  const name = `projects/${project}/databases/(default)/documents/${base}/pos/${poId}`;
  return fetch(root + ':commit', { method: 'POST', headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ writes: [{
    update: { name, fields: encode({ materialReceive: { status: 'passed', certificates: [], note: 'checked', confirmedByUid: 'receiver', confirmedByName: 'Receiver' }, ...extraFields }).mapValue.fields },
    updateMask: { fieldPaths: ['materialReceive', ...Object.keys(extraFields)] },
    updateTransforms: [{ fieldPath: 'materialReceive.confirmedAt', setToServerValue: 'REQUEST_TIME' }],
  }] }) });
}
(async () => {
  const receiver = token('receiver');
  const other = token('other');
  await expected(await write('users/receiver', { role: 'Staff', assignedProjectIds: ['project-1'] }), 200, 'seed receiver in emulator');
  await expected(await write('users/other', { role: 'Staff', assignedProjectIds: ['other-project'] }), 200, 'seed other project in emulator');
  const po = { projectId: 'project-1', poType: 'CR', status: 'Approved', statusNow: 'Approved', materialReceiveRequired: true, amount: 963 };
  await expected(await write('pos/material', po), 200, 'seed Material PO');
  await expected(await write('pos/legacy', { ...po, materialReceiveRequired: false }), 200, 'seed ordinary PO');
  const receipt = { projectId: 'project-1', poId: 'material', items: [{ receivedQty: 2, amount: 200 }] };
  await expected(await write('receives/blocked', receipt, receiver), 403, 'cannot receive before inspection');
  await expected(await confirm('material', other), 403, 'cannot inspect another project');
  await expected(await confirm('material', receiver, { amount: 0 }), 403, 'inspection cannot change financial fields');
  await expected(await confirm('material', receiver), 200, 'receiver can confirm with server timestamp');
  await expected(await confirm('material', receiver), 403, 'cannot overwrite completed inspection');
  await expected(await write('receives/manual', receipt, receiver), 200, 'manual receiving after inspection works');
  await expected(await write('receives/auto', { ...receipt, autoCreatedFromPoApproval: true }, receiver), 403, 'auto receive stays blocked after inspection');
  await expected(await write('pos/material', { materialReceiveRequired: false }, receiver, ['materialReceiveRequired']), 403, 'cannot remove Material requirement');
  await expected(await write('pos/material', { status: 'Invcredit', statusNow: 'Invcredit' }, receiver, ['status', 'statusNow']), 200, 'Invoice status updates remain allowed');
  await expected(await write('receives/not-ready', receipt, receiver), 403, 'financial status cannot bypass readiness');
  await expected(await write('pos/material', { status: 'paid', statusNow: 'paid', receiveType: 'Pay before receive' }, receiver, ['status', 'statusNow', 'receiveType']), 200, 'payment updates remain allowed');
  await expected(await write('receives/paid', receipt, receiver), 200, 'paid Material PO can receive manually');
  await expected(await write('receives/ordinary', { ...receipt, poId: 'legacy', autoCreatedFromPoApproval: true }, receiver), 200, 'ordinary Auto Receive unchanged');
  const doc = await fetch(`${root}/${base}/pos/material`, { headers: { Authorization: 'Bearer owner' } }).then((response) => response.json());
  assert.equal(doc.fields.amount.doubleValue || Number(doc.fields.amount.integerValue), 963);
  console.log('PASS PO amount remains 963 after inspection and payment updates');
  await expected(await write('pos/draft', { ...po, status: 'Draft', statusNow: 'paid' }), 200, 'seed stale status');
  await expected(await confirm('draft', receiver), 403, 'cannot inspect draft with stale paid mirror');
  await expected(await write('pos/pending-payment', { ...po, status: 'Deposit', statusNow: 'Deposit' }), 200, 'seed deposit PO');
  await expected(await confirm('pending-payment', receiver), 200, 'Material remains inspectable during deposit');
  await expected(await write('pos/editable-draft', { ...po, status: 'Draft', statusNow: 'Draft' }), 200, 'seed editable draft');
  await expected(await write('pos/editable-draft', { materialReceiveRequired: false }, receiver, ['materialReceiveRequired']), 200, 'draft PR selection can change before submission');
  await expected(await write('pos/locked-draft', { ...po, status: 'Draft', statusNow: 'Draft', materialSnapshotLocked: true }), 200, 'seed revision draft');
  await expected(await write('pos/locked-draft', { materialReceiveRequired: false }, receiver, ['materialReceiveRequired']), 403, 'revision cannot remove submitted Material requirement');
  await expected(await write('pos/locked-draft', { materialSnapshotLocked: false }, receiver, ['materialSnapshotLocked']), 403, 'cannot unlock submitted Material snapshot');
  const previousInspection = { status: 'passed', certificates: [{ name: 'previous.pdf', url: 'https://example.test/previous.pdf' }], note: 'keep note', confirmedByName: 'previous' };
  const resetPatch = { status: 'Approved', statusNow: 'Approved', materialReceiveRequired: true, materialReceive: { status: 'pending' } };
  const resetMask = ['status', 'statusNow', 'materialReceiveRequired', 'materialReceive.status'];
  await expected(await write('pos/reset-material', { ...po, receiveType: 'Material', materialReceive: previousInspection }), 200, 'seed Material queue reset');
  await expected(await write('pos/reset-material', resetPatch, other, resetMask), 403, 'cannot reset Material in another project');
  await expected(await write('pos/reset-material', { ...resetPatch, amount: 0 }, receiver, [...resetMask, 'amount']), 403, 'Material reset cannot change money');
  await expected(await write('pos/reset-material', resetPatch, receiver, resetMask), 200, 'Material can return to pending inspection and Approved');
  const resetDocument = await fetch(`${root}/${base}/pos/reset-material`, { headers: { Authorization: 'Bearer owner' } }).then((response) => response.json());
  assert.equal(resetDocument.fields.materialReceive.mapValue.fields.status.stringValue, 'pending');
  assert.equal(resetDocument.fields.materialReceive.mapValue.fields.note.stringValue, 'keep note');
  assert.equal(resetDocument.fields.materialReceive.mapValue.fields.certificates.arrayValue.values.length, 1);
  assert.equal(resetDocument.fields.amount.doubleValue || Number(resetDocument.fields.amount.integerValue), 963);
  console.log('PASS Material reset preserves certificates, note and PO amount');
  await expected(await write('receives/reset-blocked', { ...receipt, poId: 'reset-material' }, receiver), 403, 'receiving is blocked until Material passes again');
  await expected(await write('pos/reset-legacy', { projectId: 'project-1', poType: 'CR', status: 'Approved', receiveType: 'Material', amount: 963 }), 200, 'seed legacy Material without flag');
  await expected(await write('pos/reset-legacy', resetPatch, receiver, resetMask), 200, 'legacy Receive Type Material also returns to inspection');
  await expected(await write('pos/reset-eqm', { ...po, receiveType: 'EQM', materialReceive: previousInspection }), 200, 'seed non-Material type with PR Material flag');
  await expected(await write('pos/reset-eqm', resetPatch, receiver, resetMask), 403, 'other Receive Types cannot use Material reset');
  await expected(await write('pos/reset-eqm', { status: 'Approved', statusNow: 'Approved' }, receiver, ['status', 'statusNow']), 200, 'ordinary reset still works for other types');
  await expected(await write('settings/functionPermissions', { receive: { receive: ['Staff'], delete: [] } }), 200, 'seed receive permission without delete');
  await expected(await write('pos/reset-no-delete', { ...po, receiveType: 'Material', materialReceive: previousInspection }), 200, 'seed reset permission test');
  await expected(await write('pos/reset-no-delete', resetPatch, receiver, resetMask), 403, 'Material reset requires delete permission');
  await expected(await write('settings/functionPermissions', { receive: { receive: [] } }), 200, 'seed restricted action');
  await expected(await write('pos/no-permission', po), 200, 'seed permission test PO');
  await expected(await confirm('no-permission', receiver), 403, 'confirmation respects receive action permission');
  console.log('All Material Firestore emulator checks passed. No production data accessed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
