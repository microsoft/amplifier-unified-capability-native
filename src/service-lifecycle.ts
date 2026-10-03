/** Public identity binding; authenticated platform evidence remains host-owned. */
export interface ServiceIdentity {installationId:string;dataScope:string;ownerId:string;instanceId:string;releaseDigest:string;}
export interface ServiceReleaseFields {kind:'service-lifecycle';serviceOutcome:'resumed'|'stop-refused';expected:ServiceIdentity;observed:ServiceIdentity;resumeCommandId?:string;exitReceiptId?:string;readyReceiptId?:string;refusalReceiptId?:string;}
const keys=['installationId','dataScope','ownerId','instanceId','releaseDigest'] as const;
const token=(value:unknown)=>typeof value==='string'&&value.length>0&&value.length<=200&&!/[\x00-\x1f]/.test(value);
export function serviceIdentity(value:unknown):ServiceIdentity {
 if(!value||typeof value!=='object'||Object.keys(value).length!==keys.length||keys.some(key=>!token((value as any)[key])))throw Error('Exact bounded service identity required');
 return Object.fromEntries(keys.map(key=>[key,(value as any)[key]])) as unknown as ServiceIdentity;
}
export function sameIdentity(left:ServiceIdentity,right:ServiceIdentity){return keys.every(key=>left[key]===right[key]);}
export function validateServiceRelease(context:{fenceId:string;commandId:string;dataScope:string;serviceIdentity?:ServiceIdentity},outcome:'unchanged'|'ready',proof:any){
 const expected=serviceIdentity(proof?.expected),observed=serviceIdentity(proof?.observed);
 if(!context.serviceIdentity||!sameIdentity(expected,context.serviceIdentity)||proof.kind!=='service-lifecycle'||proof.verified!==true||proof.fenceId!==context.fenceId||proof.commandId!==context.commandId||proof.dataScope!==context.dataScope||proof.outcome!==outcome||proof.instanceId!==observed.instanceId||!token(proof.receiptId)||keys.some(key=>key!=='instanceId'&&expected[key]!==observed[key]))throw Error('Exact authenticated service lifecycle release proof required');
 if(outcome==='unchanged'&&proof.serviceOutcome==='stop-refused'&&sameIdentity(expected,observed)&&token(proof.refusalReceiptId))return;
 if(outcome==='ready'&&proof.serviceOutcome==='resumed'&&expected.instanceId!==observed.instanceId&&['resumeCommandId','exitReceiptId','readyReceiptId'].every(key=>token(proof[key])))return;
 throw Error('Exact authenticated service lifecycle release proof required');
}

export function evidenceKey(value:unknown):string {const canonical=(row:any):any=>Array.isArray(row)?row.map(canonical):row&&typeof row==='object'?Object.fromEntries(Object.keys(row).sort().map(key=>[key,canonical(row[key])])):row;return JSON.stringify(canonical(value));}
