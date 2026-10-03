import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath,chmod,readdir} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {Readable,Writable} from 'node:stream';import {ClientSideConnection,ndJsonStream} from '@agentclientprotocol/sdk';
const {createNativeCapabilities,AdminConnection}=await import(process.env.AMPLIFIER_NATIVE_CAPABILITY_MODULE??'../src/index.js');
const python=process.env.AMPLIFIER_CONTEXT_CLEAR_PYTHON;
test('actual native reviewed context clear recovers exact refused and lost-success receipts on passive reconstruction without worker or replay',{skip:!python,timeout:90000},async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'native-bridge-context-clear-'))),workspace=join(root,'history-workspace'),other=join(root,'other-default'),home=join(root,'home'),appHome=join(root,'native-app'),config=join(root,'native.json'),bundle=join(root,'fixture.yaml');
 for(const path of [workspace,other,home])await mkdir(path);
 await writeFile(join(home,'settings.yaml'),'bundle:\n  app: []\n');
 await writeFile(bundle,JSON.stringify({bundle:{name:'context-clear-fixture',version:'1.0.0+amplifier-unified.snapshot.1'},session:{orchestrator:{module:'loop-live'},context:{module:'context-simple'}},providers:[{module:'provider-fixture',config:{fixtureModels:[{id:'fixture-model'}],selectedModelAudit:join(root,'provider-calls.log')}}]}));
 const settings={home,appHome,bundle,adminWorkspaceRoots:[workspace,other],startupTimeout:60};await writeFile(config,JSON.stringify(settings));
 const env={...process.env,PYTHONDONTWRITEBYTECODE:'1',AMPLIFIER_RUNTIME_IMMUTABLE:'1',AMPLIFIER_SOURCE_STORE:join(root,'source-store'),AMPLIFIER_SESSION_STATE_HOME:join(root,'writer-state'),UV_CACHE_DIR:join(root,'uv-cache')};
 const child=spawn(python!,['-I','-B','-m','amplifier_acp','--config',config],{cwd:workspace,env,stdio:'pipe'});let diagnostic='';child.stderr.on('data',d=>diagnostic=(diagnostic+String(d)).slice(-8000));
 const client=new ClientSideConnection(()=>({sessionUpdate:async()=>{},requestPermission:async()=>({outcome:{outcome:'cancelled' as const}})}),ndJsonStream(Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>));
 const stop=async(child:ChildProcessWithoutNullStreams)=>{if(child.exitCode!==null||child.signalCode!==null)return;const done=new Promise<void>(r=>child.once('exit',()=>r()));child.kill('SIGKILL');await done;};
 const admins:any[]=[];const adminAt=(currentDefault=workspace)=>{const admin=new AdminConnection({command:python!,args:['-I','-B','-m','amplifier_acp','--config',config],cwd:workspace,env,resolveWorkspace:()=>currentDefault});admins.push(admin);return admin;};
 let completed=false,activeCalls=0,clearCalls=0;
 try{
  const initialized=await client.initialize({protocolVersion:1,clientCapabilities:{_meta:{'amplifier.dev/native':{version:1}}}});assert.equal((initialized.agentCapabilities?._meta?.['amplifier.dev/native'] as any).contextClear.version,1);
  const native=await client.newSession({cwd:workspace,mcpServers:[]});const scope='ahp-session:/context-owned',context={clientId:'owned',origin:'ui' as const,session:{uri:scope,workingDirectory:workspace}};let admin=adminAt(),oracle:any;
  const control=async(operation:string,args:any={})=>{activeCalls++;if(operation==='context.clear')clearCalls++;return client.extMethod('_amplifier/native',{sessionId:native.sessionId,operation,args}) as Promise<any>;};
  const provider=createNativeCapabilities({nativeContextClear:()=>admin.contextClearCapabilities(),nativeContextReceipt:(_scope:string,commandId:string)=>admin.readContextReceipt({sessionId:native.sessionId,cwd:workspace,commandId}),nativeControl:async(_scope:string,op:string,args:any)=>{const value=await control(op,args);if(op==='context.clear'){oracle=value;throw Error('Lost bridge reply after actual native success');}return value;}});
  assert.equal(await provider.negotiateContextClear(),true);
  const action=(operation:string,args:any={},commandId='owned-original-clear')=>provider.action({channel:scope,topic:'runtime-control',operation,args,commandId,version:1},context);
  await control('goals.set',{condition:'Clear this explicit fixture goal',maxTurns:2});
  const stale=(await action('context.clear.review',{},'old-review')).result;await control('goals.set',{condition:'New explicit fixture goal',maxTurns:2});
  await assert.rejects(action('context.clear',{expectedHistoryRevision:stale.historyRevision,expectedControlRevision:stale.controlRevision},'stale-original-clear'),(e:any)=>e.data?.reason==='context-clear-stale-review'&&e.data?.executed===false);
  const refused=(await action('context.clear.receipt',{commandId:'stale-original-clear'},'inspect-refused')).result.receipt;assert.equal(refused.status,'refused');assert.equal(refused.reason,'context-clear-stale-review');
  const review=(await action('context.clear.review',{},'current-review')).result;assert.equal(review.canClear,true);assert.equal(review.goalPresent,true);
  await assert.rejects(action('context.clear',{expectedHistoryRevision:review.historyRevision,expectedControlRevision:review.controlRevision}),/Lost bridge reply/);
  assert.equal(oracle.cleared,true);assert.equal(oracle.historyPreserved,true);assert.equal(oracle.eventsPreserved,true);assert.equal(oracle.goalCleared,true);
  const succeeded=(await action('context.clear.receipt',{commandId:'owned-original-clear'},'inspect-succeeded')).result.receipt;assert.equal(succeeded.status,'succeeded');assert.deepEqual(succeeded.result,oracle);
  const archive=join(appHome,'sessions',native.sessionId,'history-revisions','context-'+oracle.archiveId,'transcript.jsonl'),beforeImage=await readFile(archive);
  await admin.close();await stop(child);await writeFile(config,JSON.stringify({...settings,workerCommand:['/impossible/passive-context-clear-worker']}));admin=adminAt(other);
  const cold=createNativeCapabilities({nativeContextClear:()=>admin.contextClearCapabilities(),nativeContextReceipt:(_scope:string,commandId:string)=>admin.readContextReceipt({sessionId:native.sessionId,cwd:workspace,commandId}),nativeControl:async()=>{throw Error('Cold receipt cannot invoke native runtime');}});assert.equal(await cold.negotiateContextClear(),true);
  const before=activeCalls;
  for(const [id,expected] of [['stale-original-clear',refused],['owned-original-clear',succeeded]] as const){const value=await cold.action({channel:scope,topic:'runtime-control',operation:'context.clear.receipt',args:{commandId:id},commandId:'cold-inspect-'+id,version:1},context);assert.deepEqual(value.result.receipt,expected);assert.deepEqual(value.updates,[]);assert.deepEqual(value.invalidate,[]);}
  assert.deepEqual(await readFile(archive),beforeImage);assert.equal(activeCalls,before);assert.equal(clearCalls,2);await assert.rejects(readFile(join(root,'provider-calls.log')));
  if(process.env.AMPLIFIER_CONTEXT_CLEAR_ACCEPTANCE_RECEIPT)await writeFile(process.env.AMPLIFIER_CONTEXT_CLEAR_ACCEPTANCE_RECEIPT,JSON.stringify({nativePython:python,bridgeEntry:process.env.AMPLIFIER_NATIVE_CAPABILITY_MODULE??'source',originalNativeSessionId:native.sessionId,immutableHistoryWorkspace:workspace,changedCurrentDefault:other,staleRefusalExact:true,lostCompletedReplyExact:true,wholeNativeAdminRestart:true,workerCommandProhibited:true,activeControlOnColdReceipt:0,clearDispatches:clearCalls,providerCalls:0,replayed:false,archiveBeforeImageUnchanged:true},null,2));
  completed=true;
 }finally{
  for(const admin of admins)await admin.close();await stop(child);
  if(completed){const writable=async(p:string)=>{await chmod(p,0o700);for(const e of await readdir(p,{withFileTypes:true}))if(e.isDirectory())await writable(join(p,e.name));};await writable(root);await rm(root,{recursive:true,force:true});}else process.stderr.write('Owned context-clear fixture retained without replay: '+root+'\n'+diagnostic);
 }
});

test('actual older native peer keeps all reviewed clear actions unsupported and never starts a worker',{skip:!process.env.AMPLIFIER_CONTEXT_CLEAR_OLD_PYTHON,timeout:10000},async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'native-context-clear-older-'))),workspace=join(root,'workspace'),home=join(root,'home'),config=join(root,'native.json');await mkdir(workspace);await mkdir(home);await writeFile(config,JSON.stringify({home,appHome:join(root,'app'),adminWorkspaceRoots:[workspace],workerCommand:['/impossible/older-context-worker']}));
 const admin=new AdminConnection({command:process.env.AMPLIFIER_CONTEXT_CLEAR_OLD_PYTHON!,args:['-I','-B','-m','amplifier_acp','--config',config],cwd:workspace,env:{PYTHONDONTWRITEBYTECODE:'1',AMPLIFIER_RUNTIME_IMMUTABLE:'1',AMPLIFIER_SOURCE_STORE:join(root,'source-store'),AMPLIFIER_SESSION_STATE_HOME:join(root,'writer-state'),UV_CACHE_DIR:join(root,'uv-cache')},resolveWorkspace:()=>workspace});let dispatches=0;
 try{assert.equal(await admin.contextClearCapabilities(),undefined);const provider=createNativeCapabilities({nativeContextClear:()=>admin.contextClearCapabilities(),nativeContextReceipt:()=>{throw Error('Unavailable peer must not inspect');},nativeControl:async()=>{dispatches++;throw Error('Unavailable peer must not start');}});assert.equal(await provider.negotiateContextClear(),false);
  const scope='ahp-session:/old-peer',context={clientId:'owned',session:{uri:scope}};for(const operation of ['context.clear.review','context.clear','context.clear.receipt']){assert.equal(provider.manifest.actions[operation],undefined);await assert.rejects(provider.action({channel:scope,topic:'runtime-control',operation,args:{},commandId:'unsupported',version:1},context),(e:any)=>e.data?.reason==='context-clear-unavailable'&&e.data.executed===false);}
  await assert.rejects(admin.readContextReceipt({sessionId:'absent',cwd:workspace,commandId:'absent'}),(e:any)=>e.data?.reason==='context-clear-unavailable');assert.equal(dispatches,0);
 }finally{await admin.close();await rm(root,{recursive:true,force:true});}
});
