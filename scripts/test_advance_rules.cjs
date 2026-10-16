const assert = require('assert/strict');
const fs = require('fs');
const project = 'demo-advance-rules';
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8291';
assert.match(host, /^127\.0\.0\.1:\d+$/);
const prefix = `projects/${project}/databases/(default)/documents`;
const base = 'artifacts/test-app/public/data';
const root = `http://${host}/v1/${prefix}`;
const enc = v => v === null ? {nullValue:null} : Array.isArray(v) ? {arrayValue:{values:v.map(enc)}} : typeof v === 'object' ? {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,enc(x)]))}} : typeof v === 'number' ? (Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v}) : typeof v === 'boolean'?{booleanValue:v}:{stringValue:v};
function token(uid){const now=Math.floor(Date.now()/1000);return Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({iss:`https://securetoken.google.com/${project}`,aud:project,sub:uid,user_id:uid,iat:now,exp:now+3600,firebase:{sign_in_provider:'custom',identities:{}}})).toString('base64url')+'.';}
const write = (p,d,mask,stamp=[]) => ({update:{name:`${prefix}/${base}/${p}`,fields:enc(d).mapValue.fields},...(mask?{updateMask:{fieldPaths:mask}}:{}),...(stamp.length?{updateTransforms:stamp.map(fieldPath=>({fieldPath,setToServerValue:'REQUEST_TIME'}))}:{})});
async function commit(writes,uid='owner'){return fetch(root+':commit',{method:'POST',headers:{Authorization:'Bearer '+(uid==='owner'?uid:token(uid)),'Content-Type':'application/json'},body:JSON.stringify({writes})});}
async function check(res,code,label){const body=await res.text();assert.equal(res.status,code,label+': '+body);console.log('PASS '+label);}
async function queryRead(collectionId, uid, projectId) {
 return fetch(`${root}/${base}:runQuery`, {method:'POST',headers:{Authorization:'Bearer '+token(uid),'Content-Type':'application/json'},body:JSON.stringify({structuredQuery:{from:[{collectionId}],...(projectId === undefined ? {} : {where:{fieldFilter:{field:{fieldPath:'projectId'},op:'EQUAL',value:enc(projectId)}}})}})});
}
const seed=async(p,d)=>check(await commit([write(p,d)]),200,'seed '+p);
const event=(id,action,fromStatus,toStatus)=>({id,action,fromStatus,toStatus,byUid:'admin',byName:'Admin',note:'',at:null});
// REST timestamps are inserted explicitly for history arrays.
function historyWrite(w){const h=w.update.fields.history?.arrayValue.values;for(const e of h||[])e.mapValue.fields.at={timestampValue:new Date().toISOString()};return w;}
const a={status:'Paid',projectId:'p',poId:'po',poNo:'PO',vendorId:'v',vendorName:'Vendor',amountSatang:10000,paidSatang:10000,recoveredSatang:0,history:[]};
const d={status:'Active',projectId:'p',poId:'po',vendorId:'v',amount:100};
function recovery(n, old=0, type='payments', id='doc', advance='a'){
 const rid=type+'-'+id, tid='audit-'+type+'-'+id+'-'+n+'-'+old;
 return [write('advanceRecoveries/'+rid,{advanceId:advance,amountSatang:n,projectId:'p',poId:'po',documentType:type,documentId:id,updatedByUid:'admin',lastTransactionId:tid},null,['updatedAt']),write(type+'/'+id,{advanceRecovery:n?{advanceId:advance,amountSatang:n}:null,updatedAt:'ISO'},['advanceRecovery','updatedAt']),write('advances/'+advance,{recoveredSatang:n,lastRecoveryId:rid},['recoveredSatang','lastRecoveryId','updatedAt'],['updatedAt']),write('advanceTransactions/'+tid,{advanceId:advance,projectId:'p',poId:'po',type:n>old?'recovery':'reversal',amountSatang:Math.abs(n-old),documentType:type,documentId:id,recoveryId:rid,createdByUid:'admin'},null,['createdAt'])];
}
(async()=>{
 await seed('users/admin',{role:'Administrator',assignedProjectIds:[]});
 await seed('users/cm',{role:'CM',assignedProjectIds:['p']});
 await seed('advances/a',a);await seed('payments/doc',d);
 await check(await commit(recovery(5000).slice(0,3),'admin'),403,'missing audit denied');
 await check(await commit(recovery(5000).filter((_,i)=>i!==1),'admin'),403,'missing document denied');
 await check(await commit(recovery(5000).filter((_,i)=>i!==2),'admin'),403,'missing counter denied');
 await check(await commit(recovery(5000),'admin'),200,'full four-write recovery within access limits');
 await check(await commit([write('payments/doc',{amount:200},['amount'])],'admin'),403,'money protected');
 for(const field of ['contractorId','sourcePoId','discountRate','netPeriodAmount','depositAmount','originalAmount'])
 await check(await commit([write('payments/doc',{[field]:999},[field])],'admin'),403,field+' protected');
 await check(await commit([write('payments/doc',{originalAmount:100},['originalAmount'])],'admin'),200,'originalAmount may initialize to unchanged amount');
 await check(await commit([write('payments/doc',{status:'Rejected'},['status'])],'admin'),403,'rejection protected');
 await check(await commit([{delete:`${prefix}/${base}/payments/doc`}],'admin'),403,'active recovery delete denied');
 await check(await commit(recovery(11000,5000),'admin'),403,'over recovery denied');
 await check(await commit(recovery(0,5000),'admin'),200,'atomic reversal');
 await seed('invoices/inv',{...d,status:'Draft'});
 await check(await commit(recovery(1000,0,'invoices','inv'),'admin'),200,'invoice allocation');
 await check(await commit([write('invoices/inv',{status:'Invcredit'},['status'])],'admin'),200,'invoice forward');
 await check(await commit(recovery(0,1000,'invoices','inv'),'admin'),200,'unbilled Invcredit reversal');
 for(const type of ['payments','invoices']){
 await check(await commit([write(type+'/ordinary',{...d,status:'Draft'})],'admin'),200,'ordinary '+type+' create');
 await check(await commit([write(type+'/ordinary',{amount:200,status:'Rejected'},['amount','status'])],'admin'),200,'ordinary '+type+' update unchanged');
 }
 await seed('settings/rolePermissions',{'advance-payment':['CM'],'payment-subcontract':['CM'],invoice:['CM']});
 await seed('settings/functionPermissions',{'advance-payment':{applyRecovery:['CM']}});
 await seed('advances/cm-a',a);await seed('payments/cm-doc',{...d,vendorId:'v',invoiceId:null,billingNo:null,payNo:null});
 const cmWrites=recovery(2000,0,'payments','cm-doc','cm-a');
 cmWrites[0].update.fields.updatedByUid=enc('cm');cmWrites[3].update.fields.createdByUid=enc('cm');
 await check(await commit(cmWrites,'cm'),200,'CM four-write recovery with both permission settings within access limits');
 const inherited={paymentId:'cm-doc',advanceId:'cm-a',amountSatang:2000};
 const invoice={...d,status:'Draft',sourceType:'payment',paymentId:'cm-doc',poId:'cm-doc',inheritedAdvanceRecovery:inherited};
 await check(await commit([write('invoices/forged',{...invoice,inheritedAdvanceRecovery:{...inherited,amountSatang:3000}})],'cm'),403,'forged inheritance denied');
 await check(await commit([write('invoices/payment-invoice-cm-doc',invoice)],'cm'),200,'inheritance preserves exact Payment recovery');
 await check(await commit([write('invoices/payment-invoice-cm-doc',{inheritedAdvanceRecovery:null},['inheritedAdvanceRecovery'])],'cm'),403,'cannot erase inheritance');
 await check(await commit(recovery(0,2000,'payments','cm-doc','cm-a'),'admin'),403,'linked invoice blocks reversal');
 await seed('settings/rolePermissions',{'advance-payment':['CM'],'payment-subcontract':[],invoice:['CM']});
 const rollback=write('payments/cm-doc',{status:'Hold',invoiceId:null,invoiceNo:null,invoiceAttachments:[],invoicePeriodNo:null,holdReason:'rollback',updatedAt:'ISO'},['status','invoiceId','invoiceNo','invoiceAttachments','invoicePeriodNo','holdReason','updatedAt']);
 await check(await commit([rollback],'cm'),403,'invoice-only role cannot unlink without deletion');
 await check(await commit([{delete:`${prefix}/${base}/invoices/payment-invoice-cm-doc`},rollback],'cm'),200,'invoice-only role atomic inherited rollback');
 await check(await commit(['rolePermissions','functionPermissions'].map(id=>({delete:`${prefix}/${base}/settings/${id}`}))),200,'restore defaults for independent lifecycle suite');
 await seed('users/staff',{role:'Staff',assignedProjectIds:['p']});
 for(const uid of ['staff','cm']) for(const collectionId of ['advances','advanceRecoveries','advanceTransactions','pos','payments']) {
   await check(await queryRead(collectionId,uid,'p'),200,uid+' assigned-project query '+collectionId);
   await check(await queryRead(collectionId,uid,'other-project'),403,uid+' other-project query denied '+collectionId);
   await check(await queryRead(collectionId,uid),403,uid+' unscoped query denied '+collectionId);
 }
 console.log('All Advance Firestore emulator checks passed. No production data accessed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
