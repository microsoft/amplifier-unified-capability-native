import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,chmod,readdir,realpath} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {Readable,Writable} from 'node:stream';import {ClientSideConnection,ndJsonStream} from '@agentclientprotocol/sdk';
const {createNativeCapabilities,AdminConnection}=await import(process.env.AMPLIFIER_NATIVE_CAPABILITY_MODULE??'../src/index.js');
const python=process.env.AMPLIFIER_BUNDLE_COMMANDS_PYTHON;
test('installed native exact bundle receipts recover lost replies across whole native/admin restart without active runtime',{skip:!python,timeout:90000},async()=>{
 const dir=await realpath(await mkdtemp(join(tmpdir(),'native-bridge-bundle-receipts-'))),workspace=join(dir,'workspace'),home=join(dir,'home'),foreignWorkspace=join(dir,'other-workspace');await mkdir(workspace);await mkdir(foreignWorkspace);await mkdir(home);
 const config=join(dir,'native.json'),bundle=join(dir,'fixture.yaml');
 await writeFile(bundle,JSON.stringify({bundle:{name:'receipt-fixture',version:'1.0.0+amplifier-unified.snapshot.1'},session:{orchestrator:{module:'loop-live'},context:{module:'context-simple'}},providers:[{module:'provider-fixture',config:{fixtureModels:[{id:'fixture-model'},{id:'fixture-alternate'}],selectedModelAudit:join(dir,'provider-calls.log')}}]}));
 await writeFile(join(home,'settings.yaml'),'bundle:\n  app: []\n');
 await writeFile(config,JSON.stringify({home,appHome:join(dir,'app'),bundle,adminWorkspaceRoots:[workspace,foreignWorkspace],startupTimeout:60}));
 const env={...process.env,PYTHONDONTWRITEBYTECODE:'1',AMPLIFIER_RUNTIME_IMMUTABLE:'1',AMPLIFIER_SOURCE_STORE:join(dir,'source-store'),AMPLIFIER_SESSION_STATE_HOME:join(dir,'writer-state'),UV_CACHE_DIR:join(dir,'uv-cache')};
 let children:ChildProcessWithoutNullStreams[]=[],admins:any[]=[],retained=false;
 const launch=async()=>{
  const child=spawn(python!,['-I','-B','-m','amplifier_acp','--config',config],{cwd:workspace,env,stdio:'pipe'});children.push(child);let diagnostic='';child.stderr.on('data',d=>diagnostic=(diagnostic+String(d)).slice(-8000));
  const client=new ClientSideConnection(()=>({sessionUpdate:async()=>{},requestPermission:async()=>({outcome:{outcome:'cancelled' as const}})}),ndJsonStream(Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>));
  await client.initialize({protocolVersion:1,clientCapabilities:{_meta:{'amplifier.dev/native':{version:1}}}});return {client,child,diagnostic:()=>diagnostic};
 };
 const launchAdmin=(resolvedWorkspace=workspace)=>{const a=new AdminConnection({command:python!,args:['-I','-B','-m','amplifier_acp','--config',config],cwd:workspace,env,resolveWorkspace:()=>resolvedWorkspace});admins.push(a);return a;};
 const stop=async(child:ChildProcessWithoutNullStreams)=>{if(child.exitCode!==null||child.signalCode!==null)return;const done=new Promise<void>(resolve=>child.once('exit',()=>resolve()));child.kill('SIGKILL');await done;};
 try{
  let peer=await launch(),admin=launchAdmin();const native=await peer.client.newSession({cwd:workspace,mcpServers:[]});
  const scope='ahp-session:/receipt-owned',context={clientId:'owned-client',session:{uri:scope,workingDirectory:workspace},origin:'ui' as const};
  let activeCalls=0,saveEffects=0,activationEffects=0;const expected=new Map<string,any>();
  const makeProvider=(lost:'save'|'activation'|'none')=>createNativeCapabilities({
   nativeBundleCommands:()=>admin.bundleCommandCapabilities(),
   nativeBundleReceipt:(_scope:string,commandId:string)=>admin.readBundleReceipt({sessionId:native.sessionId,cwd:workspace,commandId}),
   nativeAdmin:async(op:string,args:any,ctx:any)=>{const result=await admin.perform(op,args,ctx);if(op==='bundle.save'){saveEffects++;expected.set(args.name,result);if(lost==='save')throw Error('Injected lost save reply after actual native success');}return result;},
   nativeControl:async(_scope:string,operation:string,args:any)=>{activeCalls++;const result=await peer.client.extMethod('_amplifier/native',{sessionId:native.sessionId,operation,args}) as any;if(operation==='bundle.switch'){activationEffects++;expected.set(args.bundle+':activation',result);if(lost==='activation')throw Error('Injected lost activation reply after actual native success');}return result;}
  });
  const request=(op:string,args:any,id:string)=>({channel:scope,topic:'bundles',operation:op,args,commandId:id,version:1});
  const query=(provider:any,id:string)=>provider.action(request('bundle.receipt',{operation:'bundle.save',commandId:id},'inspect-'+id),context);
  const lostSave=makeProvider('save');assert.equal(await lostSave.negotiateBundleCommands(),true);
  await assert.rejects(lostSave.action(request('bundle.save',{name:'lost-save'},'outer-save-loss'),context),/Injected lost save reply/);
  const saveRecovery=await query(lostSave,'outer-save-loss');assert.deepEqual(saveRecovery.result.receipts.command.result,expected.get('lost-save'));assert.equal(saveRecovery.result.receipts.activation,null);assert.equal(activationEffects,0);
  const lostActivation=makeProvider('activation');const save=await lostActivation.action(request('bundle.save',{name:'lost-activation'},'outer-activation-loss'),context);assert.equal(save.result.activation.state,'unknown');
  const beforeRestart=await query(lostActivation,'outer-activation-loss');assert.deepEqual(beforeRestart.result.receipts.command.result,expected.get('lost-activation'));assert.deepEqual(beforeRestart.result.receipts.activation.result,expected.get('lost-activation:activation'));
  const normal=makeProvider('none');let delivered:any=await normal.action(request('bundle.save',{name:'outer-loss'},'outer-reply-loss'),context);
  const savedUri=delivered.result.saved.uri,body=await readFile(savedUri,'utf8');delivered=undefined;
  const control=async(operation:string,args:any={})=>peer.client.extMethod('_amplifier/native',{sessionId:native.sessionId,operation,args}) as Promise<any>;
  const catalog=await control('configuration.providers');await control('provider.select',{instance:catalog.providers[0].id,model:'fixture-model'});
  const original=await control('configuration.inspect'),choicePlan=structuredClone(original.plan);choicePlan.providers[0].instance_id='different-instance';
  const choiceSaved=await admin.perform('bundle.save',{commandId:'fixture-independent-choice-save',name:'needs-choice',effectiveConfig:choicePlan,resources:await control('configuration.exportResources')},context);
  const choice=await normal.action(request('bundle.switch',{bundle:'needs-choice'},'outer-model-choice'),context);
  assert.equal(choice.result.requiresModelChoice,true);assert.equal(choice.result.applied,false);
  assert.equal((await control('configuration.inspect')).configurationRevision,original.configurationRevision);
  const choiceReceipt=await normal.action(request('bundle.receipt',{operation:'bundle.switch',commandId:'outer-model-choice'},'inspect-choice'),context);
  assert.deepEqual(choiceReceipt.result.receipts.command.result,choice.result);
  assert.deepEqual((await admin.perform('bundle.receipt',{commandId:'fixture-independent-choice-save'},context)).receipt.result,choiceSaved);

  await admin.close();await stop(peer.child);peer=await launch();admin=launchAdmin();
  const recovered=createNativeCapabilities({nativeAdmin:admin.perform,nativeBundleCommands:()=>admin.bundleCommandCapabilities(),nativeBundleReceipt:(_scope:string,commandId:string)=>admin.readBundleReceipt({sessionId:native.sessionId,cwd:workspace,commandId}),nativeControl:async()=>{throw Error('Passive recovery must not start active runtime');}});
  const priorActive=activeCalls;
  for(const id of ['outer-save-loss','outer-activation-loss','outer-reply-loss']){
   const value=await query(recovered,id);const receipts=value.result.receipts;assert.equal(receipts.command.status,'succeeded');assert.equal(receipts.command.replayed,false);assert.deepEqual(value.updates,[]);assert.deepEqual(value.invalidate,[]);
   if(id==='outer-save-loss')assert.equal(receipts.activation,null);else assert.equal(receipts.activation.status,'succeeded');
  }
  const exact=await query(recovered,'outer-reply-loss');assert.deepEqual(exact.result.receipts.command.result,expected.get('outer-loss'));assert.deepEqual(exact.result.receipts.activation.result,expected.get('outer-loss:activation'));
  assert.equal(await readFile(savedUri,'utf8'),body);assert.equal(activeCalls,priorActive);assert.equal(saveEffects,3);assert.equal(activationEffects,3);await assert.rejects(readFile(join(dir,'provider-calls.log')));
  const changedDefaultAdmin=launchAdmin(foreignWorkspace);assert.equal((await changedDefaultAdmin.perform('bundle.receipt',{commandId:exact.result.receipts.command.commandId},context)).receipt,null);
  assert.equal((await admin.readBundleReceipt({sessionId:native.sessionId,cwd:foreignWorkspace,commandId:exact.result.receipts.activation.commandId})).receipt,null);
  assert.deepEqual((await admin.perform('bundle.receipt',{commandId:exact.result.receipts.command.commandId},context)).receipt,exact.result.receipts.command);
  const restoredChoice=await recovered.action(request('bundle.receipt',{operation:'bundle.switch',commandId:'outer-model-choice'},'inspect-restarted-choice'),context);assert.deepEqual(restoredChoice.result.receipts.command.result,choice.result);assert.equal(restoredChoice.result.receipts.command.result.applied,false);
  // Foreign selected native authority cannot inspect an activation receipt.
  const foreign=await admin.readBundleReceipt({sessionId:'foreign-session',cwd:workspace,commandId:exact.result.receipts.activation.commandId});assert.equal(foreign.receipt,null);
  if(process.env.AMPLIFIER_BUNDLE_RECEIPT_EVIDENCE)await writeFile(process.env.AMPLIFIER_BUNDLE_RECEIPT_EVIDENCE,JSON.stringify({
   fixture:'owned installed Core/Foundation with fixture provider',nativePython:python,installedModule:process.env.AMPLIFIER_NATIVE_CAPABILITY_MODULE??null,
   saveReplyLost:{save:saveRecovery.result.receipts.command.status,activation:saveRecovery.result.receipts.activation},
   activationReplyLost:{delivered:'unknown',recovered:beforeRestart.result.receipts.activation.status,applied:beforeRestart.result.receipts.activation.result.applied},
   wholeNativeAdminRestart:{newSessionOpened:false,activeRuntimeCalls:0,exactSaveAndActivationResultsRecovered:true},
   needsModel:{status:restoredChoice.result.receipts.command.status,applied:false,exactPreviewPreserved:true,originalMountRevisionPreserved:true,independentSavePreserved:true},
   wrongCanonicalWorkspace:{adminSave:null,activation:null,originalSaveRetained:true},foreignNativeIdentity:null,
   bridgeSaveDispatches:saveEffects,bridgeActivationDispatches:activationEffects,providerCalls:0,updates:[],invalidations:[],replayed:false
  },null,2)+'\n');

 }catch(error){retained=true;throw Object.assign(error as Error,{ownedStateRetained:dir});}
 finally{for(const a of admins)await a.close();for(const c of children)await stop(c);if(!retained){const writable=async(p:string)=>{await chmod(p,0o700);for(const e of await readdir(p,{withFileTypes:true}))if(e.isDirectory())await writable(join(p,e.name));};await writable(dir);await rm(dir,{recursive:true,force:true});}}
});
test('actual older admin refuses receipt identities before mutations and never launches a worker',{skip:!process.env.AMPLIFIER_BUNDLE_LEGACY_PYTHON},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'native-bundle-legacy-')),workspace=join(dir,'workspace'),home=join(dir,'home');await mkdir(workspace);await mkdir(home);const config=join(dir,'native.json');await writeFile(config,JSON.stringify({home,appHome:join(dir,'app'),adminWorkspaceRoots:[workspace],workerCommand:['/impossible/legacy-worker']}));
 const admin=new AdminConnection({command:process.env.AMPLIFIER_BUNDLE_LEGACY_PYTHON!,args:['-I','-B','-m','amplifier_acp','--config',config],cwd:workspace,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',AMPLIFIER_RUNTIME_IMMUTABLE:'1'},resolveWorkspace:()=>workspace});
 try{
  assert.equal(await admin.bundleCommandCapabilities(),undefined);
  await assert.rejects(admin.perform('bundle.save',{commandId:'must-not-be-ignored',name:'never'},{clientId:'owned'}),(e:any)=>e.data?.reason==='bundle-command-unavailable'&&e.data.executed===false&&e.data.replayed===false);
  await assert.rejects(admin.perform('bundle.receipt',{commandId:'absent'},{clientId:'owned'}),(e:any)=>e.data?.reason==='bundle-receipt-unavailable'&&e.data.executed===false);
  await assert.rejects(admin.readBundleReceipt({sessionId:'native-owned',cwd:workspace,commandId:'absent'}),(e:any)=>e.data?.reason==='bundle-receipt-unavailable');await assert.rejects(readFile(join(home,'bundles','command-receipts.sqlite3')));assert.deepEqual(await readdir(home),[]);
 }finally{await admin.close();await rm(dir,{recursive:true,force:true});}
});
