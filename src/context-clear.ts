import {createHash} from 'node:crypto';
type Json=Record<string,any>;
/** Stable identity is scoped to the original AHP command, never a current cwd. */
export function contextClearCommandId(scope:string,commandId:string):string {
 if(typeof scope!=='string'||!scope.startsWith('ahp-session:/')||scope.length>8192||typeof commandId!=='string'||!commandId||commandId.length>256)throw Error('Bounded original selected-session context command identity required.');
 return 'unified-context-v1:'+createHash('sha256').update(JSON.stringify(['unified-native-capabilities-context',1,scope,'context.clear',commandId])).digest('hex');
}
export function contextClearUnavailable(message='Reviewed history-preserving context clear is unsupported on this configured engine.'){
 return Object.assign(Error(message),{data:{executed:false,replayed:false,reason:'context-clear-unavailable'}});
}
/** Qualification is based only on actual passive initialize metadata. */
export function contextClearMetadata(value:Json|undefined):boolean {
 return value?.version===1&&value.review==='context.clear.review'&&value.apply==='context.clear'&&value.receipt==='_amplifier/context/receipt'&&value.preservesHistory===true&&value.clearsExplicitGoal===true&&value.activeTask==='pause-required'&&value.replayUnknown===false;
}

const REVISION=/^[0-9a-f]{64}$/;
const REFUSALS=new Set(['context-clear-command-required','context-clear-review-arguments','context-clear-reviewed-revisions-required','context-clear-invalid-revision','context-clear-command-conflict','context-clear-preflight-refused','context-clear-stale-review','native-checkpoint-required','context-clear-receipt-selectors','context-clear-history-workspace-required','context-clear-history-unavailable','context-clear-receipt-scope-mismatch']);
function fail():never {throw Error('Native context clear result does not match the bounded exact v1 contract.');}
function exact(value:any,required:string[],optional:string[]=[]):Json {
 if(!value||typeof value!=='object'||Array.isArray(value)||required.some(k=>!Object.hasOwn(value,k))||Object.keys(value).some(k=>!required.includes(k)&&!optional.includes(k)))return fail();
 if(Buffer.byteLength(JSON.stringify(value))>16384)return fail();return value;
}
export function contextClearRevision(value:any):boolean{return typeof value==='string'&&REVISION.test(value);}
/** Schema owners: native context-clear.v1.json reviewResult/applyResult. */
export function exactContextClearReview(value:Json):Json {
 exact(value,['historyRevision','controlRevision','canClear','goalPresent','goalAction','task'],['reason']);
 if(!contextClearRevision(value.historyRevision)||!contextClearRevision(value.controlRevision)||typeof value.canClear!=='boolean'||typeof value.goalPresent!=='boolean'||value.goalAction!=='clear'||('reason' in value&&(typeof value.reason!=='string'||value.reason.length>512)))return fail();
 if(value.task!==null){exact(value.task,['id','revision','status']);if(typeof value.task.id!=='string'||value.task.id.length>200||!Number.isSafeInteger(value.task.revision)||value.task.revision<0||typeof value.task.status!=='string'||value.task.status.length>32)return fail();}
 return structuredClone(value);
}
export function exactContextClearResult(value:Json):Json {
 exact(value,['cleared','historyPreserved','eventsPreserved','goalCleared','archiveId','previousHistoryRevision','historyRevision']);
 if(value.cleared!==true||value.historyPreserved!==true||value.eventsPreserved!==true||typeof value.goalCleared!=='boolean'||!contextClearRevision(value.archiveId)||!contextClearRevision(value.previousHistoryRevision)||!contextClearRevision(value.historyRevision))return fail();
 return structuredClone(value);
}
/** Passive native context-clear-receipt.v1.json; null is absence, not outcome proof. */
export function exactContextReceipt(value:Json,commandId:string):Json|null {
 exact(value,['receipt']);const receipt=value.receipt;if(receipt===null)return null;
 const common=['version','operation','commandId','createdAt','status'];
 if(receipt?.status==='succeeded'){exact(receipt,[...common,'completedAt','result']);exactContextClearResult(receipt.result);if(!Number.isFinite(receipt.completedAt)||receipt.completedAt<0)return fail();}
 else if(receipt?.status==='refused'){exact(receipt,[...common,'executed','reason']);if(receipt.executed!==false||!REFUSALS.has(receipt.reason))return fail();}
 else if(receipt?.status==='unknown')exact(receipt,common);
 else return fail();
 if(receipt.version!==1||receipt.operation!=='context.clear'||receipt.commandId!==commandId||typeof receipt.commandId!=='string'||!receipt.commandId||receipt.commandId.length>200||/[\u0000-\u001f]/.test(receipt.commandId)||!Number.isFinite(receipt.createdAt)||receipt.createdAt<0)return fail();
 return structuredClone(receipt);
}
