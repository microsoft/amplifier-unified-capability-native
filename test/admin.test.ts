import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,rm,stat} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';const {AdminConnection}=await import(process.env.AMPLIFIER_NATIVE_CAPABILITY_MODULE??'../src/index.js');
test('upstream ACP SDK administration reaches native settings without creating a session',{skip:!process.env.AMPLIFIER_ACP_PYTHON},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'amplifier-admin-'));const workspace=join(dir,'workspace');await mkdir(workspace);const home=join(dir,'home');await mkdir(home);const config=join(dir,'agent.json');await writeFile(config,JSON.stringify({home,appHome:join(dir,'app'),adminWorkspaceRoots:[workspace],workerCommand:['/invalid/no-worker']}));
 const admin=new AdminConnection({command:process.env.AMPLIFIER_ACP_PYTHON!,args:['-m','amplifier_acp','--config',config],cwd:workspace,resolveWorkspace:()=>workspace});
 try{const result=await admin.perform('modules.save',{section:'hooks',module:'hooks-test',scope:'project',config:{}},{clientId:'test'});assert.equal(result.modules[0].module,'hooks-test');const rows=await admin.perform('modules.list',{scope:'project'},{clientId:'test'});assert.equal(rows.modules.length,1);await assert.rejects(stat(join(home,'projects')));await assert.rejects(admin.perform('providers.list',{cwd:'/not-authorized'},{clientId:'test'}),/launch authority/);}finally{await admin.close();await rm(dir,{recursive:true,force:true});}
});

test('native held administration includes cross-process gate and exact recovery maintenance exception',{skip:!process.env.AMPLIFIER_ACP_PYTHON},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'amplifier-admin-held-')),workspace=join(dir,'workspace'),home=join(dir,'home');await mkdir(workspace);await mkdir(home);await writeFile(join(home,'settings.yaml'),'fixture: unchanged\n');const config=join(dir,'native.json');await writeFile(config,JSON.stringify({home,appHome:join(dir,'app'),adminWorkspaceRoots:[workspace],adminMaintenance:true,maintenanceExternalWriters:'stopped',workerCommand:['/impossible/admin-worker']}));
 const options={command:process.env.AMPLIFIER_ACP_PYTHON!,args:['-m','amplifier_acp','--config',config],cwd:workspace,resolveWorkspace:()=>workspace};
 const admin=new AdminConnection(options),other=new AdminConnection(options),context={fenceId:'root-fence',commandId:'recovery-job',purpose:'recovery' as const,instanceId:'same-host',dataScope:'owned'};
 try{
  const held=await admin.quiescenceParticipant.acquire(context);assert.ok(held);assert.equal(held.ownerId,'native-admin');const voice=await admin.perform('voice.configuration',{},{clientId:'browser'});assert.equal(voice.available,false);assert.equal(voice.credentialAccess,'disabled');await assert.rejects(admin.perform('voice.credential',{},{clientId:'browser'}),/intake is held/);
  await assert.rejects(admin.perform('modules.save',{module:'tool-never',section:'tools',config:{}},{clientId:'browser'}),/intake is held/);
  assert.equal(await other.quiescenceParticipant.acquire({...context,commandId:'other'}),null);
  await assert.rejects(admin.perform('maintenance.preview',{sessions:[],parts:['native-settings'],privateContentReviewed:true},{clientId:'browser'}),/intake is held/);
  let archiveHash='';
  await admin.withMaintenanceFence(context,async()=>{
   await assert.rejects(admin.perform('modules.save',{module:'tool-never',section:'tools',config:{}},{clientId:'trusted'}),/intake is held/);
   const preview=await admin.perform('maintenance.preview',{sessions:[],parts:['native-settings'],privateContentReviewed:true},{clientId:'trusted'});
   const lease=await admin.perform('maintenance.acquire',{commandId:'native-acquire',previewHash:preview.previewHash},{clientId:'trusted'});assert.equal(lease.active,true);assert.equal((await admin.perform('voice.configuration',{},{clientId:'browser'})).configurable,false);await assert.rejects(admin.perform('voice.configure',{source:'private',apiKey:'must-not-write'},{clientId:'browser'}),/intake is held/);
   const snapshot=await admin.perform('maintenance.snapshot',{commandId:'native-snapshot',leaseId:lease.leaseId,previewHash:preview.previewHash},{clientId:'trusted'});assert.equal(snapshot.receipt.state,'succeeded');
   await admin.perform('maintenance.release',{leaseId:lease.leaseId},{clientId:'trusted'});
   const plan=await admin.perform('maintenance.archive.create',{commandId:'archive-plan',parts:['shared-configuration'],privateContentReviewed:true},{clientId:'trusted'});
   const sealed=await admin.perform('maintenance.archive.prepare',{commandId:'archive-seal',planId:plan.planId,expectedRevision:0},{clientId:'trusted'});archiveHash=sealed.previewHash;
  });
  const manifest=await admin.perform('maintenance.archive.manifest',{previewHash:archiveHash,limit:2},{clientId:'browser'});assert.equal(manifest.items.length,2);
  await assert.rejects(admin.perform('maintenance.archive.create',{commandId:'forbidden-plan',parts:['shared-configuration'],privateContentReviewed:true},{clientId:'browser'}),/intake is held/);
  const proof={verified:true as const,...context,outcome:'unchanged' as const,receiptId:'trusted-owner-receipt'};await held.release('unchanged',proof);
  assert.equal((await admin.inspectLifecycle()).intakeClosed,false);
  const after=await admin.perform('modules.save',{module:'tool-fixture',section:'tools',config:{}},{clientId:'browser'});assert.ok(after.modules.length);
  await assert.rejects(stat(join(home,'projects')));
 }finally{await admin.close();await other.close();await rm(dir,{recursive:true,force:true});}
});

test('queued Node admission refuses quiescence before native request, and detached recovery scope expires',{skip:!process.env.AMPLIFIER_ACP_PYTHON},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'amplifier-admin-queued-')),workspace=join(dir,'workspace'),home=join(dir,'home');await mkdir(workspace);await mkdir(home);const config=join(dir,'native.json');await writeFile(config,JSON.stringify({home,appHome:join(dir,'app'),adminWorkspaceRoots:[workspace],adminMaintenance:true,workerCommand:['/impossible']}));
 let release!:()=>void,blocked=true;const gate=new Promise<void>(resolve=>release=resolve);const admin=new AdminConnection({command:process.env.AMPLIFIER_ACP_PYTHON!,args:['-m','amplifier_acp','--config',config],cwd:workspace,resolveWorkspace:async()=>{if(blocked)await gate;return workspace;}});
 const context={fenceId:'fence',commandId:'request',purpose:'recovery' as const,instanceId:'host',dataScope:'scope'};
 try{
  const pending=admin.perform('modules.list',{}, {clientId:'browser'});assert.equal(await admin.quiescenceParticipant.acquire(context),null);blocked=false;release();await pending;
  const held=await admin.quiescenceParticipant.acquire(context);assert.ok(held);
  let resume!:()=>void;const later=new Promise<void>(resolve=>resume=resolve);let detached:Promise<unknown>|undefined;
  await admin.withMaintenanceFence(context,async()=>{detached=(async()=>{await later;return admin.perform('maintenance.preview',{sessions:[],parts:['native-settings'],privateContentReviewed:true},{clientId:'trusted'});})();});
  resume();await assert.rejects(detached!,/intake is held/);
  await held.release('unchanged',{kind:'admission-refused'});
 }finally{release();await admin.close();await rm(dir,{recursive:true,force:true});}
});

test('replacement admin proves native gate availability before authenticated host reconciliation',{skip:!process.env.AMPLIFIER_ACP_PYTHON},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'amplifier-admin-replace-')),workspace=join(dir,'workspace'),home=join(dir,'home');await mkdir(workspace);await mkdir(home);const config=join(dir,'native.json');await writeFile(config,JSON.stringify({home,appHome:join(dir,'app'),adminWorkspaceRoots:[workspace],workerCommand:['/impossible']}));const options={command:process.env.AMPLIFIER_ACP_PYTHON!,args:['-m','amplifier_acp','--config',config],cwd:workspace,resolveWorkspace:()=>workspace};
 const original=new AdminConnection(options),replacement=new AdminConnection(options),context={fenceId:'saved-fence',commandId:'saved-command',purpose:'distribution-update' as const,instanceId:'old-host',dataScope:'same-data'};
 try{
  assert.ok(await original.quiescenceParticipant.acquire(context));await original.close();
  await replacement.quiescenceParticipant.reconcileRelease({...context,outcome:'ready',proof:{verified:true,...context,outcome:'ready',instanceId:'new-host',receiptId:'authenticated-supervisor-receipt'}});
  assert.equal((await replacement.inspectLifecycle()).intakeClosed,false);await assert.rejects(stat(join(home,'projects')));
 }finally{await original.close();await replacement.close();await rm(dir,{recursive:true,force:true});}
});

test('actual native post-response writer emits negotiated idle advisory after a refused acquisition',{skip:!process.env.AMPLIFIER_ACP_PYTHON},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'admin-idle-event-')),workspace=join(dir,'workspace'),home=join(dir,'home'),flag=join(dir,'finish');await mkdir(workspace);await mkdir(home);const config=join(dir,'native.json');await writeFile(config,JSON.stringify({home,appHome:join(dir,'app'),adminWorkspaceRoots:[workspace],workerCommand:['/impossible']}));
 const script=`import asyncio\nfrom pathlib import Path\nfrom amplifier_acp.admin import Administration\nclass Setup:\n def __init__(self):self.logins={}\n async def close(self):\n  for row in self.logins.values():row['task'].cancel()\n  await asyncio.gather(*(r['task'] for r in self.logins.values()),return_exceptions=True)\nasync def fake(self,workspace,operation,args):\n self.setup=Setup()\n async def wait():\n  while not Path(args['flag']).exists():await asyncio.sleep(.01)\n self.setup.logins['fixture']={'task':asyncio.create_task(wait())}\n return {'phase':'waiting'}\nAdministration.authorized=fake\nfrom amplifier_acp.server import main\nmain()`;
 let signals=0;const admin=new AdminConnection({command:process.env.AMPLIFIER_ACP_PYTHON!,args:['-c',script,'--config',config],cwd:workspace,resolveWorkspace:()=>workspace,onMayBeIdle:()=>signals++});
 const context={fenceId:'idle-fence',commandId:'idle-command',purpose:'distribution-update' as const,instanceId:'host',dataScope:'scope'};
 try{
  await admin.perform('providers.login',{flag},{clientId:'fixture'});const before=signals;assert.ok(before>0,'ordinary request completion supplies a recheck signal');
  assert.equal(await admin.quiescenceParticipant.acquire(context),null);assert.equal(signals,before);await writeFile(flag,'finish');
  for(let n=0;n<300&&signals===before;n++)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(signals,before+1,'native background completion arrives without polling administration');
  const lease=await admin.quiescenceParticipant.acquire(context);assert.ok(lease);await lease.release('unchanged',{kind:'admission-refused'});
 }finally{await admin.close();await rm(dir,{recursive:true,force:true});}
});

test('staged import selects only a trusted workspace and preserves passive receipts under held intake',{skip:!process.env.AMPLIFIER_ACP_PYTHON},async()=>{
 const {createHash}=await import('node:crypto');const {realpath}=await import('node:fs/promises');
 const dir=await realpath(await mkdtemp(join(tmpdir(),'admin-import-'))),workspace=join(dir,'workspace'),selected=join(dir,'selected'),home=join(dir,'home');await mkdir(workspace);await mkdir(selected);await mkdir(home);
 const config=join(dir,'native.json');await writeFile(config,JSON.stringify({home,appHome:join(dir,'app'),adminWorkspaceRoots:[workspace,selected],adminHistoryImport:true,bundle:'fixture-bundle',workerCommand:['/impossible/import-worker']}));
 const options={command:process.env.AMPLIFIER_ACP_PYTHON!,args:['-m','amplifier_acp','--config',config],cwd:workspace,resolveWorkspace:()=>workspace,env:{AMPLIFIER_SESSION_STATE_HOME:join(dir,'writer-state')}};
 const admin=new AdminConnection(options),other=new AdminConnection(options),raw=Buffer.from(JSON.stringify([{role:'user',content:'Imported evidence'}]));
 try{
  await assert.rejects(admin.importHistory('modules.save',{module:'forbidden'},selected),/Only native history import/);
  await assert.rejects(admin.importHistory('history.import.receipt',{commandId:'absent'},dir),/outside launcher/);
  const begin=await admin.importHistory('history.import.begin',{commandId:'begin',format:'json',bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex')},selected);assert.equal(begin.status,'succeeded');
  const chunk=await admin.importHistory('history.import.chunk',{commandId:'chunk',uploadId:begin.result.uploadId,offset:0,contentBase64:raw.toString('base64')},selected);assert.equal(chunk.status,'succeeded');
  const preview=await admin.importHistory('history.import.preview',{commandId:'preview',uploadId:begin.result.uploadId},selected);assert.equal(preview.status,'succeeded');
  const commit=await admin.importHistory('history.import.commit',{commandId:'commit',previewHash:preview.result.previewHash},selected);assert.equal(commit.status,'succeeded');assert.equal(commit.result.historyCwd,selected);assert.equal(commit.result.workReplayed,false);
  assert.deepEqual(await other.importHistory('history.import.receipt',{commandId:'commit'},selected),commit);
  await assert.rejects(admin.perform('history.import.receipt',{commandId:'commit'},{clientId:'browser'}),/another authorized workspace/);
  const context={fenceId:'import-held',commandId:'recovery-command',purpose:'recovery' as const,instanceId:'host',dataScope:'scope'};
  const lease=await admin.quiescenceParticipant.acquire(context);assert.ok(lease);
  assert.deepEqual(await admin.importHistory('history.import.receipt',{commandId:'commit'},selected),commit);
  await assert.rejects(admin.importHistory('history.import.begin',{commandId:'blocked'},selected),/intake is held/);
  await lease.release('unchanged',{kind:'admission-refused'});
 }finally{await admin.close();await other.close();await rm(dir,{recursive:true,force:true});}
});

test('optional native import and voice preferences refuse before dispatch when unadvertised',{skip:!process.env.AMPLIFIER_ACP_PYTHON},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'admin-unsupported-')),workspace=join(dir,'workspace'),home=join(dir,'home');await mkdir(workspace);await mkdir(home);const config=join(dir,'native.json');await writeFile(config,JSON.stringify({home,appHome:join(dir,'app'),adminWorkspaceRoots:[workspace],workerCommand:['/impossible']}));
 const admin=new AdminConnection({command:process.env.AMPLIFIER_ACP_PYTHON!,args:['-m','amplifier_acp','--config',config],cwd:workspace,resolveWorkspace:()=>workspace});
 try{
  await assert.rejects(admin.importHistory('history.import.begin',{commandId:'absent'},workspace),(error:any)=>error.data?.executed===false&&error.data.reason==='history-import-unavailable');
  await assert.rejects(admin.perform('voice.preferences.update',{commandId:'absent'},{clientId:'browser'}),(error:any)=>error.data?.executed===false&&error.data.reason==='voice-preferences-unavailable');
  await assert.rejects(stat(join(dir,'app')));
 }finally{await admin.close();await rm(dir,{recursive:true,force:true});}
});

test('shared voice preference CAS and exact passive receipt are independent from credentials',{skip:!process.env.AMPLIFIER_ACP_PYTHON},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'admin-voice-defaults-')),workspace=join(dir,'workspace'),home=join(dir,'home');await mkdir(workspace);await mkdir(home);const config=join(dir,'native.json');await writeFile(config,JSON.stringify({home,appHome:join(dir,'app'),adminWorkspaceRoots:[workspace],adminVoicePreferences:true,workerCommand:['/impossible']}));
 const admin=new AdminConnection({command:process.env.AMPLIFIER_ACP_PYTHON!,args:['-m','amplifier_acp','--config',config],cwd:workspace,resolveWorkspace:()=>workspace});
 try{
  const before=await admin.perform('voice.configuration',{},{clientId:'browser'});assert.equal(before.credentialAccess,'disabled');assert.ok(before.preferenceFields.includes('voice'));
  const saved=await admin.perform('voice.preferences.update',{commandId:'voice-save',expectedRevision:before.preferencesRevision,patch:{voice:'cedar',interruptions:false}},{clientId:'browser'});assert.equal(saved.status,'succeeded');assert.equal(saved.result.voice,'cedar');assert.equal(saved.result.fallbackBehavior,'stored-only');
  const conflict=await admin.perform('voice.preferences.update',{commandId:'voice-stale',expectedRevision:before.preferencesRevision,patch:{voice:'marin'}},{clientId:'browser'});assert.equal(conflict.status,'failed');assert.equal(conflict.executed,false);assert.equal(conflict.reason,'preferences_changed');
  const context={fenceId:'held',commandId:'maintenance',purpose:'recovery' as const,instanceId:'host',dataScope:'scope'};const lease=await admin.quiescenceParticipant.acquire(context);assert.ok(lease);
  assert.deepEqual(await admin.perform('voice.preferences.receipt',{commandId:'voice-save'},{clientId:'browser'}),saved);
  await assert.rejects(admin.perform('voice.preferences.update',{commandId:'blocked'},{clientId:'browser'}),/intake is held/);
  await lease.release('unchanged',{kind:'admission-refused'});await assert.rejects(stat(join(home,'keys.env')));await assert.rejects(stat(join(home,'projects')));
 }finally{await admin.close();await rm(dir,{recursive:true,force:true});}
});

test('service stop retains exact identity, excludes maintenance, and requires platform-specific release proof',{skip:!process.env.AMPLIFIER_ACP_PYTHON},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'admin-service-')),workspace=join(dir,'workspace'),home=join(dir,'home');await mkdir(workspace);await mkdir(home);const config=join(dir,'native.json');await writeFile(config,JSON.stringify({home,appHome:join(dir,'app'),adminWorkspaceRoots:[workspace],adminMaintenance:true,workerCommand:['/impossible']}));
 const options={command:process.env.AMPLIFIER_ACP_PYTHON!,args:['-m','amplifier_acp','--config',config],cwd:workspace,resolveWorkspace:()=>workspace};const admin=new AdminConnection(options),replacement=new AdminConnection(options);
 const identity={installationId:'installed',dataScope:'scope',ownerId:'platform',instanceId:'old',releaseDigest:'a'.repeat(64)},context={fenceId:'service-fence',commandId:'stop',purpose:'service-stop' as const,instanceId:'old',dataScope:'scope',serviceIdentity:{...identity}};
 const refused={verified:true as const,fenceId:context.fenceId,commandId:context.commandId,outcome:'unchanged' as const,instanceId:'old',dataScope:'scope',receiptId:'platform-refusal',kind:'service-lifecycle' as const,serviceOutcome:'stop-refused' as const,expected:{...identity},observed:{...identity},refusalReceiptId:'refusal'};
 try{
  assert.deepEqual(admin.quiescenceParticipant.serviceStop,{version:1});
  const live=await admin.quiescenceParticipant.acquire(context);assert.ok(live);context.serviceIdentity.ownerId='mutated-caller';
  assert.equal((await admin.inspectLifecycle()).lease.serviceIdentity.ownerId,'platform');
  await assert.rejects(admin.withMaintenanceFence(context,async()=>{}),/intake is held/);
  await assert.rejects(live.release('unchanged',{verified:true,...context,outcome:'unchanged',receiptId:'legacy-proof'}),/service identity|service lifecycle/);
  await assert.rejects(live.release('ready',{...refused,outcome:'ready',serviceOutcome:'resumed'}),/service lifecycle/);
  assert.equal((await admin.inspectLifecycle()).intakeClosed,true);await live.release('unchanged',refused);await live.release('unchanged',refused);
  await assert.rejects(live.release('unchanged',{...refused,receiptId:'changed'}),/receipt binds different evidence/);
  const second={...context,fenceId:'second-fence',commandId:'second-stop',serviceIdentity:{...identity}};assert.ok(await admin.quiescenceParticipant.acquire(second));await admin.close();
  await assert.rejects(replacement.quiescenceParticipant.reconcileRelease({...second,outcome:'unchanged',proof:{kind:'admission-refused'} as any}),/service identity|service lifecycle/);
  assert.equal((await replacement.inspectLifecycle()).intakeClosed,false,'Invalid reconciliation cannot acquire a new native gate');
  const resumed={...refused,fenceId:second.fenceId,commandId:second.commandId,outcome:'ready' as const,instanceId:'new',serviceOutcome:'resumed' as const,observed:{...identity,instanceId:'new'},resumeCommandId:'resume',exitReceiptId:'exit',readyReceiptId:'ready'};
  await replacement.quiescenceParticipant.reconcileRelease({...second,outcome:'ready',proof:resumed});
  const rollback=await replacement.quiescenceParticipant.acquire({...second,fenceId:'rollback-fence',commandId:'preflight'});assert.ok(rollback);await rollback.release('unchanged',{kind:'admission-refused'});
  await assert.rejects(stat(join(home,'projects')));
 }finally{await admin.close();await replacement.close();await rm(dir,{recursive:true,force:true});}
});

test('older admin peers are refused before service-stop acquisition is dispatched',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'admin-old-service-')),audit=join(dir,'effects');
 const script=`const readline=require('node:readline'),fs=require('node:fs');readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.method==='initialize')process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{protocolVersion:1,agentCapabilities:{_meta:{'amplifier.dev/native':{version:1,admin:{version:1,lifecycle:{version:1,heldIntake:true,crossProcessWriterFence:true}}}}}}})+'\\n');else fs.appendFileSync(process.argv[1],m.method+'\\n');});`;
 const admin=new AdminConnection({command:process.execPath,args:['-e',script,audit],cwd:dir,resolveWorkspace:()=>dir});
 try{const serviceIdentity={installationId:'install',dataScope:'scope',ownerId:'platform',instanceId:'instance',releaseDigest:'digest'};assert.equal(await admin.quiescenceParticipant.acquire({fenceId:'fence',commandId:'stop',purpose:'service-stop',instanceId:'instance',dataScope:'scope',serviceIdentity}),null);await assert.rejects(stat(audit));}finally{await admin.close();await rm(dir,{recursive:true,force:true});}
});
