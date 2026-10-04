import {createHash} from 'node:crypto';
/** Stable native child identities; no paths, settings, result storage, or effects. */
export function bundleCommandIds(scope:string,operation:string,commandId:string):{commandId:string;activationCommandId?:string} {
 if(!['bundle.save','bundle.export','bundle.default','bundle.switch'].includes(operation)||typeof commandId!=='string'||!commandId||commandId.length>256)throw Error('Bounded original bundle command identity required.');
 const child=(effect:string)=>'unified-bundle-v1:'+createHash('sha256').update(JSON.stringify(['unified-native-capabilities',1,scope,operation,commandId,effect])).digest('hex');
 return {commandId:child(operation),...(operation==='bundle.save'&&scope!=='host'?{activationCommandId:child('bundle.switch')}:{})};
}

/** Validate the native-owned v1 receipt; never infer results from other state. */
export function exactBundleReceipt(value:Record<string,any>,operation:string,commandId:string):Record<string,any>|null {
 const fail=()=>{throw Error('Native bundle receipt does not bind the exact child operation.');};
 if(!value||Object.keys(value).some(k=>k!=='receipt')||!('receipt' in value))return fail();
 const r=value.receipt;if(r===null)return null;
 if(!r||Array.isArray(r)||typeof r!=='object'||Object.keys(r).some(k=>!['version','commandId','operation','status','createdAt','completedAt','replayed','executed','reason','result','diagnosticReceipt'].includes(k))||r.version!==1||r.commandId!==commandId||r.operation!==operation||!['succeeded','refused','unknown'].includes(r.status)||r.replayed!==false||!Number.isFinite(r.createdAt)||r.createdAt<0)return fail();
 if('diagnosticReceipt' in r&&(r.status==='succeeded'||typeof r.diagnosticReceipt!=='string'||r.diagnosticReceipt.length!==44||!/^startup-[a-f0-9]{32}\.log$/.test(r.diagnosticReceipt)))return fail();
 if(r.status==='unknown'){
  if(['completedAt','executed','reason','result'].some(k=>k in r))return fail();
 }else{
  if(!Number.isFinite(r.completedAt)||r.completedAt<0)return fail();
  if(r.status==='succeeded'){
   if(!r.result||typeof r.result!=='object'||Array.isArray(r.result)||'executed' in r||'reason' in r||Buffer.byteLength(JSON.stringify(r.result))>524288)return fail();
  }else if(r.executed!==false||r.reason!=='bundle-preflight-refused'||'result' in r)return fail();
 }
 return structuredClone(r);
}
