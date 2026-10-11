import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const {MessageConnection}=await import(process.env.AMPLIFIER_NATIVE_CAPABILITY_MODULE??'../src/index.js');
const options=(root:string)=>({command:'/must-not-start',cwd:root,account:'owned-account',admissionDirectory:join(root,'intake'),resolveSession:async()=>{throw Error('Maintenance cannot resolve or start Native');}});
const allocation={allocationId:'11111111-1111-4111-8111-111111111111',allocationHash:'a'.repeat(64),treeHash:'b'.repeat(64),executionDirectory:'/owned/managed/files',entryCount:3,bytes:42};
for(const purpose of ['retention-hide','managed-files-disposal'] as const){
 const context={fenceId:'maintenance-fence',commandId:'maintenance-command',purpose,instanceId:'original-instance',dataScope:'owned-scope'};
 const selection={sessions:['ahp-session:/root','ahp-session:/child'],limit:101,...(purpose==='managed-files-disposal'?{allocation}:{})};
 const proof={verified:true as const,fenceId:context.fenceId,commandId:context.commandId,instanceId:context.instanceId,dataScope:context.dataScope,outcome:'unchanged' as const,receiptId:'trusted-effect-receipt'};
 const inspect=(lease:any,value:any=selection)=>purpose==='retention-hide'?lease.inspectRetentionReferences(value):lease.inspectManagedFilesReferences(value);
 test(purpose+' closes message intake and binds one live selection without Native calls',async()=>{
  const root=await mkdtemp(join(tmpdir(),'message-maintenance-')),c=new MessageConnection(options(root));
  try{
   const p=c.quiescenceParticipant;assert.deepEqual(p.retentionHide,{version:1});assert.deepEqual(p.managedFiles,{version:1,preservesCanonical:true});
   const lease=await p.acquire(context);assert.ok(lease);
   for(const operation of ['read','reaction','receipt'] as const)await assert.rejects(c.perform(operation,{},{}),/fenced/);
   for(const bad of [{...selection,limit:100},{...selection,sessions:[]},{...selection,sessions:['ahp-session:/root','ahp-session:/root']},{...selection,sessions:['file:///foreign']},{...selection,sessions:Array.from({length:102},(_,i)=>'ahp-session:/'+i)},{...selection,extra:true}])await assert.rejects(inspect(lease,bad));
   if(purpose==='managed-files-disposal')for(const bad of [{...allocation,treeHash:'unknown'},{...allocation,bytes:-1},{...allocation,executionDirectory:'relative'},{...allocation,foreign:true}])await assert.rejects(inspect(lease,{...selection,allocation:bad}));
   assert.deepEqual(await inspect(lease),{coverage:'complete',protected:[],omissions:[]});
   assert.deepEqual(await inspect(lease,structuredClone(selection)),{coverage:'complete',protected:[],omissions:[]});
   await assert.rejects(inspect(lease,{...selection,sessions:['ahp-session:/different']}),/changed/);
   await lease.release('unchanged',proof);await assert.rejects(inspect(lease),/live.*hold/);
   await lease.release('unchanged',{...proof});assert.equal(c.activity().intakeClosed,false);
   await assert.rejects(p.acquire(context));
  }finally{await c.close();await rm(root,{recursive:true,force:true});}
 });
 test(purpose+' preserves selection and unknown hold across replacement; exact release does not replay',async()=>{
  const root=await mkdtemp(join(tmpdir(),'message-maintenance-cold-'));let c=new MessageConnection(options(root));
  try{
   const lease=await c.quiescenceParticipant.acquire(context);assert.ok(lease);await inspect(lease);await c.close();
   c=new MessageConnection(options(root));assert.equal(c.activity().intakeClosed,true);
   await assert.rejects(inspect(lease));assert.equal(await c.quiescenceParticipant.acquire(context),null);
   const journal=join(root,'intake/message-admission.sqlite3'),before=await readFile(journal);
   for(const operation of ['read','reaction','receipt'] as const)await assert.rejects(c.perform(operation,{},{}));
   assert.deepEqual(await readFile(journal),before);
   await c.quiescenceParticipant.reconcileRelease({...context,outcome:'unchanged',proof});await c.close();
   c=new MessageConnection(options(root));assert.equal(c.activity().intakeClosed,false);
   await c.quiescenceParticipant.reconcileRelease({...context,outcome:'unchanged',proof});
   await assert.rejects(c.quiescenceParticipant.reconcileRelease({...context,outcome:'unchanged',proof:{...proof,receiptId:'foreign'}}));
  }finally{await c.close();await rm(root,{recursive:true,force:true});}
 });
 test(purpose+' active passive initialization refuses acquisition and unknown mutation survives restart',async()=>{
  const root=await mkdtemp(join(tmpdir(),'message-maintenance-busy-')),peer=join(root,'peer.mjs');
  await writeFile(peer,'process.stdin.resume();');
  const c=new MessageConnection({...options(root),command:process.execPath,args:[peer],initializationTimeoutMs:30});
  try{const pending=c.capabilities().catch(()=>undefined);assert.equal(c.activity().calls,1);assert.equal(await c.quiescenceParticipant.acquire(context),null);await pending;}finally{await c.close();}
  // Persisted mutation-dispatch boundary, without invoking a model or filesystem effect.
  let unknown:any=new MessageConnection(options(root));
  const id=unknown.admission.begin({operation:'reaction',commandId:'lost-reaction',scope:'ahp-session:/root',sessionId:'native-root',cwd:root});unknown.admission.end(id,true);await unknown.close();
  unknown=new MessageConnection(options(root));
  try{assert.equal(unknown.activity().uncertain,true);assert.equal(await unknown.quiescenceParticipant.acquire(context),null);await assert.rejects(unknown.quiescenceParticipant.reconcileRelease({...context,outcome:'unchanged',proof}));assert.equal(unknown.activity().uncertain,true);}
  finally{unknown.uncertain=false;await unknown.close();await rm(root,{recursive:true,force:true});}
 });
 test(purpose+' unknown outcome invalidates live reference and rollback proof',async()=>{
  const root=await mkdtemp(join(tmpdir(),'message-maintenance-unknown-')),c=new MessageConnection(options(root));
  try{const lease=await c.quiescenceParticipant.acquire(context);assert.ok(lease);await inspect(lease);await lease.release('unknown');await assert.rejects(inspect(lease));await assert.rejects(lease.release('unchanged',{kind:'admission-refused'}));await c.quiescenceParticipant.reconcileRelease({...context,outcome:'unchanged',proof});}
  finally{await c.close();await rm(root,{recursive:true,force:true});}
 });
}
