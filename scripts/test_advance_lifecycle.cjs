// Tests only a named demo project on a loopback Firestore emulator.
const assert = require('assert/strict');
const project = 'demo-advance-rules';
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8291';
assert.match(host, /^127\.0\.0\.1:\d+$/);
const prefix = `projects/${project}/databases/(default)/documents`;
const base = 'artifacts/test-app/public/data';
const root = `http://${host}/v1/${prefix}`;
const encode = v => v === null ? { nullValue: null } : v instanceof Date ? { timestampValue: v.toISOString() }
  : Array.isArray(v) ? { arrayValue: { values: v.map(encode) } }
  : typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k,x]) => [k,encode(x)])) } }
  : typeof v === 'number' ? Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  : typeof v === 'boolean' ? { booleanValue: v } : { stringValue: v };
const decode = v => 'nullValue' in v ? null : 'timestampValue' in v ? new Date(v.timestampValue)
  : 'arrayValue' in v ? (v.arrayValue.values || []).map(decode)
  : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k,x]) => [k,decode(x)]))
  : 'integerValue' in v ? Number(v.integerValue) : 'doubleValue' in v ? v.doubleValue
  : 'booleanValue' in v ? v.booleanValue : v.stringValue;
function token(uid) {
  if (uid === 'owner') return uid;
  const now = Math.floor(Date.now()/1000);
  return Buffer.from(JSON.stringify({ alg:'none', typ:'JWT' })).toString('base64url') + '.' +
    Buffer.from(JSON.stringify({ iss:`https://securetoken.google.com/${project}`,aud:project,sub:uid,user_id:uid,iat:now,exp:now+3600,firebase:{sign_in_provider:'custom',identities:{}} })).toString('base64url') + '.';
}
const write = (path,data,mask,stamps=[]) => ({
  update:{name:`${prefix}/${base}/${path}`,fields:encode(data).mapValue.fields},
  ...(mask ? {updateMask:{fieldPaths:mask}} : {}),
  ...(stamps.length ? {updateTransforms:stamps.map(fieldPath=>({fieldPath,setToServerValue:'REQUEST_TIME'}))} : {}),
});
async function commit(writes,uid='owner') {
  return fetch(root+':commit',{method:'POST',headers:{Authorization:`Bearer ${token(uid)}`,'Content-Type':'application/json'},body:JSON.stringify({writes})});
}
let count = 0;
async function check(res,code,label) { const body=await res.text();assert.equal(res.status,code,`${label}: ${body}`);count++;console.log(`PASS ${label}`); }
async function read(path,uid='owner') {
  const r = await fetch(`${root}/${base}/${path}`,{headers:{Authorization:`Bearer ${token(uid)}`}});
  assert.equal(r.status,200,await (r.status !== 200 ? r.text() : Promise.resolve('')));
  return decode({mapValue:{fields:(await r.json()).fields}});
}
let sequence = 0;
const event = (action,uid,fromStatus,toStatus,note='') => ({id:`lifecycle-audit-${++sequence}`,action,fromStatus,toStatus,byUid:uid,byName:uid,note,at:new Date()});
function create(id,amountSatang,uid='lifecycle-CM',extra={}) {
  const e=event('create',uid,'','Pending PD');
  const a={status:'Pending PD',amountSatang,paidSatang:0,recoveredSatang:0,projectId:'lifecycle-project',poId:'lifecycle-po',poNo:'PO-LIFE',vendorId:'lifecycle-vendor',vendorName:'Lifecycle Vendor',workUnclaimedAmount:0,balanceSnapshot:250000,recoveryTerms:'Recover each period',reason:'Mobilization',createdByUid:uid,createdByName:uid,history:[e],...extra};
  return [write(`advances/${id}`,a,null,['createdAt','updatedAt']),write(`advanceTransactions/${e.id}`,{...e,advanceId:id,projectId:a.projectId,poId:a.poId,amountSatang},null,['createdAt'])];
}
async function transition(id,action,uid,{next,note='',reference='REF-001'}={}) {
  const a=await read(`advances/${id}`);
  const to=next || (action==='reject'?'Rejected':action==='pay'?'Paid':a.status==='Pending PD'?'Pending PCM':a.status==='Pending PCM'?'Pending GM':a.status==='Pending GM'&&a.amountSatang>10000000?'Pending MD':'Approved');
  const e=event(action,uid,a.status,to,note);
  const patch={status:to,history:[...a.history,e]};
  const stamps=['updatedAt'];
  if(action==='reject')patch.rejectionReason=note;
  if(action==='pay') {
    Object.assign(patch,{paidSatang:a.amountSatang,paidDate:'2026-10-16',paymentReference:reference,paidByUid:uid,paidByName:uid});
    Object.assign(e,{amountSatang:a.amountSatang,paidDate:patch.paidDate,paymentReference:reference});stamps.push('paidAt');
  }
  const audit={...e,advanceId:id,projectId:a.projectId,poId:a.poId,amountSatang:a.amountSatang};
  return [write(`advances/${id}`,patch,[...Object.keys(patch),...stamps],stamps),write(`advanceTransactions/${e.id}`,audit,null,['createdAt'])];
}
(async()=>{
  await check(await commit([write('settings/rolePermissions',{}),write('settings/functionPermissions',{})]),200,'reset isolated lifecycle permission settings');
  for(const role of ['CM','PM','PD','PCM','GM','MD','Staff','Administrator']) await check(await commit([write(`users/lifecycle-${role}`,{role,assignedProjectIds:['lifecycle-project']})]),200,`seed ${role}`);
  await check(await commit([write('users/lifecycle-other',{role:'CM',assignedProjectIds:['other-project']}),write('pos/lifecycle-po',{projectId:'lifecycle-project',poNo:'PO-LIFE',vendorId:'lifecycle-vendor',vendorName:'Lifecycle Vendor',status:'Approved',amount:250000})]),200,'seed scoped PO');
  await check(await commit(create('life-denied',10000,'lifecycle-Staff'),'lifecycle-Staff'),403,'Staff cannot request Advance');
  await check(await commit(create('life-other',10000,'lifecycle-other'),'lifecycle-other'),403,'CM cannot request another project');
  await check(await commit(create('life-bad-vendor',10000,'lifecycle-CM',{vendorId:'other'}),'lifecycle-CM'),403,'cannot forge vendor');
  await check(await commit(create('life-no-audit',10000).slice(0,1),'lifecycle-CM'),403,'request requires atomic audit');
  await check(await commit(create('life-low',10000000),'lifecycle-CM'),200,'CM creates exactly 100000 baht');
  await check(await commit(await transition('life-low','approve','lifecycle-GM'),'lifecycle-GM'),403,'cannot skip PD role');
  await check(await commit(await transition('life-low','approve','lifecycle-PD',{next:'Approved'}),'lifecycle-PD'),403,'PD cannot skip stages');
  await check(await commit(await transition('life-low','pay','lifecycle-Administrator'),'lifecycle-Administrator'),403,'cannot pay before approval');
  for(const role of ['PD','PCM','GM'])await check(await commit(await transition('life-low','approve',`lifecycle-${role}`),`lifecycle-${role}`),200,`100000 approve ${role}`);
  assert.equal((await read('advances/life-low')).status,'Approved');
  await check(await commit(await transition('life-low','pay','lifecycle-CM'),'lifecycle-CM'),403,'unconfigured CM cannot confirm pay');
  await check(await commit(await transition('life-low','pay','lifecycle-Administrator',{reference:''}),'lifecycle-Administrator'),403,'payment reference required');
  await check(await commit(await transition('life-low','pay','lifecycle-Administrator'),'lifecycle-Administrator'),200,'approved Advance paid with audit');
  await check(await commit(await transition('life-low','pay','lifecycle-Administrator'),'lifecycle-Administrator'),403,'cannot pay twice');
  await check(await commit([write('advances/life-low',{amountSatang:1},['amountSatang'])],'lifecycle-Administrator'),403,'cannot overwrite requested amount');
  await check(await commit(create('life-high',10000001,'lifecycle-PM'),'lifecycle-PM'),200,'PM creates 100000.01 baht');
  for(const role of ['PD','PCM','GM'])await check(await commit(await transition('life-high','approve',`lifecycle-${role}`),`lifecycle-${role}`),200,`over threshold approve ${role}`);
  assert.equal((await read('advances/life-high')).status,'Pending MD');
  await check(await commit(await transition('life-high','pay','lifecycle-Administrator'),'lifecycle-Administrator'),403,'over threshold waits for MD');
  await check(await commit(await transition('life-high','approve','lifecycle-MD'),'lifecycle-MD'),200,'MD final approval');
  await check(await commit([write('settings/functionPermissions',{'advance-payment':{confirmPay:['CM'],applyRecovery:['CM','PM','PCM','Administrator']}})]),200,'configure confirmPay CM');
  await check(await commit(await transition('life-high','pay','lifecycle-CM'),'lifecycle-CM'),200,'configured CM confirms payment');
  await check(await commit(create('life-reject',12345),'lifecycle-CM'),200,'create rejection scenario');
  await check(await commit(await transition('life-reject','reject','lifecycle-PD'),'lifecycle-PD'),403,'rejection reason required');
  await check(await commit(await transition('life-reject','reject','lifecycle-PD',{note:'Incomplete supporting details'}),'lifecycle-PD'),200,'reject with reason');
  const approved=await read('advances/life-high');
  await check(await commit([write(`advanceTransactions/${approved.history[0].id}`,{note:'tampered'},['note'])],'lifecycle-Administrator'),403,'audit is immutable even for Administrator');
  const outsider=await fetch(`${root}/${base}/advances/life-high`,{headers:{Authorization:`Bearer ${token('lifecycle-other')}`}});
  await check(outsider,403,'cannot read another project Advance');
  console.log(`Advance lifecycle: ${count} emulator checks passed. No production data accessed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
