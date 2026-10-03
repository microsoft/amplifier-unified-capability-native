import test from 'node:test';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
const module=process.env.AMPLIFIER_NATIVE_CAPABILITY_MODULE;
const {createNativeCapabilities,AdminConnection}=await import(module??'../src/index.js');
const {contextClearCommandId,exactContextReceipt,exactContextClearReview,exactContextClearResult}=await import(module?new URL('./context-clear.js',pathToFileURL(module)).href:'../src/context-clear.js');
const scope='ahp-session:/context-owned',context={clientId:'owned',origin:'ui' as const,session:{uri:scope,workingDirectory:'/original-history'}};
const metadata={version:1,review:'context.clear.review',apply:'context.clear',receipt:'_amplifier/context/receipt',preservesHistory:true,clearsExplicitGoal:true,activeTask:'pause-required',replayUnknown:false};
const review={historyRevision:'a'.repeat(64),controlRevision:'b'.repeat(64),canClear:true,goalPresent:true,goalAction:'clear',task:null};
const result={cleared:true,historyPreserved:true,eventsPreserved:true,goalCleared:true,archiveId:'c'.repeat(64),previousHistoryRevision:'a'.repeat(64),historyRevision:'d'.repeat(64)};
const action=(operation:string,args:any={},commandId='original-clear')=>({channel:scope,topic:'runtime-control',operation,version:1,commandId,args});
const ops=['context.clear.review','context.clear','context.clear.receipt'];

test('context clear discovery requires exact actual metadata and passive receipt port, with optional failure isolated',async()=>{
 for(const input of [undefined,{...metadata,version:2},{...metadata,preservesHistory:false},{...metadata,activeTask:'clear'},{...metadata,replayUnknown:true}]){
  let dispatch=0;const provider=createNativeCapabilities({nativeControl:async()=>{dispatch++;return {};},nativeContextClear:async()=>input,nativeContextReceipt:async()=>({receipt:null})});
  assert.equal(await provider.negotiateContextClear(),false);for(const op of ops){assert.equal(provider.manifest.actions[op],undefined);await assert.rejects(provider.action(action(op),context),(e:any)=>e.data.executed===false&&e.data.reason==='context-clear-unavailable');}assert.equal(dispatch,0);
 }
 const noPort=createNativeCapabilities({nativeControl:async()=>({}),nativeContextClear:async()=>metadata});assert.equal(await noPort.negotiateContextClear(),false);
 let attempts=0;const unavailable=createNativeCapabilities({nativeControl:async(_s:string,op:string)=>op==='capabilities'?{controls:['goals.get']}:{goal:null},nativeContextClear:async()=>{attempts++;throw Error('Peer unavailable');},nativeContextReceipt:async()=>({receipt:null})});
 assert.equal(await unavailable.negotiateContextClear(),false);assert.equal((await unavailable.actionSchemas())['context.clear'],undefined);assert.equal((await unavailable.action(action('runtime.control',{operation:'goals.get'}),context)).result.goal,null);assert.equal(attempts,1);assert.equal(unavailable.contextClearAvailability().state,'unavailable');
});

test('review/apply preserve exact native result and original command identity without reads or revision rebasing',async()=>{
 const calls:any[]=[];const provider=createNativeCapabilities({nativeControl:async(s:string,op:string,args:any)=>{calls.push({s,op,args});return structuredClone(op==='capabilities'?{controls:['goals.get','goals.set']}:op.startsWith('goals.')?{goal:{condition:'Original goal'}}:op==='context.clear.review'?review:result);},nativeContextClear:async()=>metadata,nativeContextReceipt:async()=>({receipt:null})});
 assert.equal(await provider.negotiateContextClear(),true);assert.ok((await provider.actionSchemas())['context.clear']);
 await provider.action(action('runtime.control',{operation:'goals.set',args:{condition:'Original goal'}},'set-goal'),context);await provider.action(action('runtime.control',{operation:'goals.get'},'load-goal'),context);calls.length=0;
 const loaded=await provider.action(action('context.clear.review',{},'review-command'),context);assert.deepEqual(loaded.result,review);assert.equal(loaded._meta['amplifier.dev/operation'].id,'review-command');assert.deepEqual(loaded.invalidate,[]);
 const cleared=await provider.action(action('context.clear',{expectedHistoryRevision:review.historyRevision,expectedControlRevision:review.controlRevision}),{...context,origin:'agent'});
 assert.deepEqual(cleared.result,result);assert.equal(cleared._meta['amplifier.dev/operation'].id,'original-clear');assert.deepEqual(calls,[{s:scope,op:'context.clear.review',args:{}},{s:scope,op:'context.clear',args:{expectedHistoryRevision:review.historyRevision,expectedControlRevision:review.controlRevision,commandId:contextClearCommandId(scope,'original-clear')}}]);
 assert.deepEqual(cleared.updates[0].data.runtimeControl[scope]['context.clear'],result);assert.equal(cleared.updates[0].data.runtimeControl[scope]['context.clear.review'],undefined);assert.equal(cleared.updates[0].data.runtimeControl[scope]['goals.get'],undefined);assert.equal(cleared.updates[0].data.runtimeControl[scope]['goals.set'],undefined);
});

test('context public arguments and generic legacy paths refuse before native dispatch',async()=>{
 let calls=0;const provider=createNativeCapabilities({nativeControl:async()=>{calls++;return {};},nativeContextClear:async()=>metadata,nativeContextReceipt:async()=>({receipt:null})});await provider.negotiateContextClear();
 for(const op of ops)await assert.rejects(provider.action(action('runtime.control',{operation:op}),context),/generic native controls/);
 for(const args of [{},{expectedHistoryRevision:'old',expectedControlRevision:'b'.repeat(64)},{expectedHistoryRevision:'a'.repeat(64),expectedControlRevision:'b'.repeat(64),commandId:'forged'},{expectedHistoryRevision:'a'.repeat(64),expectedControlRevision:'b'.repeat(64),cwd:'/foreign'}])await assert.rejects(provider.action(action('context.clear',args),context),/reviewed/);
 await assert.rejects(provider.action(action('context.clear.review',{workspace:'/foreign'}),context),/no arguments/);
 await assert.rejects(provider.action(action('context.clear.receipt',{commandId:'original',sessionId:'foreign'}),context),/scope|Exact original/);
 await assert.rejects(provider.action({...action('context.clear.review'),channel:'host'},{clientId:'owned'}),/admitted native session/);
 await assert.rejects(provider.action(action('context.clear.review'),{clientId:'owned',session:{uri:'ahp-session:/foreign'}}),/Authenticated/);assert.equal(calls,0);
});

test('native refusal and unknown remain original failures without projections, current-state reads or mutation retries',async()=>{
 for(const data of [{reason:'context-clear-stale-review',executed:false,replayed:false},{reason:'context-clear-outcome-unknown',outcome:'unknown',replayed:false}]){
  let effects=0;const error=Object.assign(Error('Original native outcome'),{data});const provider=createNativeCapabilities({nativeControl:async()=>{effects++;throw error;},nativeContextClear:async()=>metadata,nativeContextReceipt:async()=>({receipt:null})});await provider.negotiateContextClear();
  await assert.rejects(provider.action(action('context.clear',{expectedHistoryRevision:review.historyRevision,expectedControlRevision:review.controlRevision}),context),(e:any)=>e===error);assert.equal(effects,1);
  const receipt=await provider.action(action('context.clear.receipt',{commandId:'original-clear'},'inspect-only'),context);assert.equal(receipt.result.receipt,null);assert.deepEqual(receipt.updates,[]);assert.deepEqual(receipt.invalidate,[]);assert.equal(effects,1);
 }
});

test('passive exact receipts survive bridge reconstruction, including refused unknown and null without synthetic outcomes',async()=>{
 const id=contextClearCommandId(scope,'original-clear'),receipts=[{version:1,operation:'context.clear',commandId:id,createdAt:1,status:'succeeded',completedAt:2,result},{version:1,operation:'context.clear',commandId:id,createdAt:1,status:'refused',executed:false,reason:'context-clear-preflight-refused'},{version:1,operation:'context.clear',commandId:id,createdAt:1,status:'unknown'},null];
 for(const receipt of receipts){let active=0;const passive:any[]=[];const provider=createNativeCapabilities({nativeControl:async()=>{active++;throw Error('No worker allowed');},nativeContextClear:async()=>metadata,nativeContextReceipt:async(s:string,id:string)=>{passive.push({s,id});return {receipt:structuredClone(receipt)};}});await provider.negotiateContextClear();
  const response=await provider.action(action('context.clear.receipt',{commandId:'original-clear'},'new-inspection'),context);assert.deepEqual(response.result,{commandId:'original-clear',operation:'context.clear',receipt});assert.equal(response._meta['amplifier.dev/operation'].id,'new-inspection');assert.deepEqual(response.updates,[]);assert.deepEqual(response.invalidate,[]);assert.equal(active,0);assert.deepEqual(passive,[{s:scope,id}]);
 }
 const newerGoal={goal:{condition:'A newer explicit goal'}};const newer=createNativeCapabilities({nativeControl:async(_s:string,op:string)=>op==='capabilities'?{controls:['goals.set']}:structuredClone(newerGoal),nativeContextClear:async()=>metadata,nativeContextReceipt:async()=>({receipt:structuredClone(receipts[0])})});
 await newer.action(action('runtime.control',{operation:'goals.set',args:{condition:'A newer explicit goal'}},'new-goal-command'),context);
 const read={uri:'amplifier-capability://native/runtime-control',topic:'runtime-control',scope,clientId:'owned'},before=await newer.read(read);
 const inspection=await newer.action(action('context.clear.receipt',{commandId:'original-clear'},'inspect-older-clear'),context);assert.deepEqual(inspection.updates,[]);assert.deepEqual(inspection.invalidate,[]);assert.deepEqual(await newer.read(read),before);assert.deepEqual(before.data.runtimeControl[scope]['goals.set'],newerGoal);assert.deepEqual(before.data.runtimeControl[scope]['goals.get'],newerGoal);
 assert.equal(contextClearCommandId(scope,'original-clear'),id);assert.notEqual(contextClearCommandId('ahp-session:/other','original-clear'),id);assert.notEqual(contextClearCommandId(scope,'other-command'),id);assert.throws(()=>contextClearCommandId(scope,'x'.repeat(257)),/Bounded/);
});

test('closed native context schemas reject foreign binding, extra fields and fabricated unknown results',()=>{
 const id=contextClearCommandId(scope,'original-clear'),unknown={version:1,operation:'context.clear',commandId:id,createdAt:1,status:'unknown'};
 assert.deepEqual(exactContextClearReview({...review,canClear:false,task:{id:'task',revision:1,status:'active'},reason:'Pause the active task'}).task.status,'active');
 for(const receipt of [{...unknown,result},{...unknown,executed:false},{...unknown,reason:'invented'},{...unknown,commandId:'foreign'},{...unknown,operation:'bundle.switch'},{...unknown,createdAt:-1},{...unknown,status:'refused',executed:false,reason:'arbitrary'}])assert.throws(()=>exactContextReceipt({receipt},id),/exact v1 contract/);
 assert.throws(()=>exactContextReceipt({receipt:null,extra:true},id),/exact v1 contract/);assert.throws(()=>exactContextClearResult({...result,historyPreserved:false}),/exact v1 contract/);assert.throws(()=>exactContextClearReview({...review,reason:'x'.repeat(16385)}),/exact v1 contract/);
});

test('administration context metadata and receipts use passive original selectors without session/control calls',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'context-passive-admin-')),audit=join(dir,'calls.jsonl'),script=join(dir,'peer.mjs');
 await writeFile(script,`import readline from 'node:readline';import{appendFileSync}from'node:fs';const metadata=${JSON.stringify(metadata)};for await(const line of readline.createInterface({input:process.stdin})){const q=JSON.parse(line);appendFileSync(${JSON.stringify(audit)},JSON.stringify(q)+'\\n');if(q.id===undefined)continue;const result=q.method==='initialize'?{protocolVersion:1,agentCapabilities:{_meta:{'amplifier.dev/native':{version:1,admin:{version:1},contextClear:metadata}}}}:{receipt:null};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:q.id,result})+'\\n');}`);
 const admin=new AdminConnection({command:process.execPath,args:[script],cwd:dir,resolveWorkspace:()=>{throw Error('Do not resolve current default for passive receipt');}});
 try{assert.deepEqual(await admin.contextClearCapabilities(),metadata);assert.deepEqual(await admin.readContextReceipt({sessionId:'original-native-id',cwd:'/canonical-history',commandId:'derived-command'}),{receipt:null});const calls=(await readFile(audit,'utf8')).trim().split('\n').map(row=>JSON.parse(row));assert.deepEqual(calls.map(row=>row.method),['initialize','_amplifier/context/receipt']);assert.deepEqual(calls[1].params,{sessionId:'original-native-id',cwd:'/canonical-history',commandId:'derived-command'});await assert.rejects(admin.readContextReceipt({sessionId:'original-native-id',cwd:'/canonical-history',commandId:'bad\nselector'}),/Exact trusted/);}finally{await admin.close();await rm(dir,{recursive:true,force:true});}
});
