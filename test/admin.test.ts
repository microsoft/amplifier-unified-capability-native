import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,rm,stat} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';const {AdminConnection}=await import(process.env.AMPLIFIER_NATIVE_CAPABILITY_MODULE??'../src/index.js');
test('upstream ACP SDK administration reaches native settings without creating a session',{skip:!process.env.AMPLIFIER_ACP_PYTHON},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'amplifier-admin-'));const workspace=join(dir,'workspace');await mkdir(workspace);const home=join(dir,'home');await mkdir(home);const config=join(dir,'agent.json');await writeFile(config,JSON.stringify({home,appHome:join(dir,'app'),adminWorkspaceRoots:[workspace],workerCommand:['/invalid/no-worker']}));
 const admin=new AdminConnection({command:process.env.AMPLIFIER_ACP_PYTHON!,args:['-m','amplifier_acp','--config',config],cwd:workspace,resolveWorkspace:()=>workspace});
 try{const result=await admin.perform('modules.save',{section:'hooks',module:'hooks-test',scope:'project',config:{}},{clientId:'test'});assert.equal(result.modules[0].module,'hooks-test');const rows=await admin.perform('modules.list',{scope:'project'},{clientId:'test'});assert.equal(rows.modules.length,1);await assert.rejects(stat(join(home,'projects')));await assert.rejects(admin.perform('providers.list',{cwd:'/not-authorized'},{clientId:'test'}),/launch authority/);}finally{await admin.close();await rm(dir,{recursive:true,force:true});}
});

test('native held administration includes cross-process gate and exact recovery maintenance exception',{skip:!process.env.AMPLIFIER_ACP_PYTHON},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'amplifier-admin-held-')),workspace=join(dir,'workspace'),home=join(dir,'home');await mkdir(workspace);await mkdir(home);await writeFile(join(home,'settings.yaml'),'fixture: unchanged\n');const config=join(dir,'native.json');await writeFile(config,JSON.stringify({home,appHome:join(dir,'app'),adminWorkspaceRoots:[workspace],adminMaintenance:true,workerCommand:['/impossible/admin-worker']}));
 const options={command:process.env.AMPLIFIER_ACP_PYTHON!,args:['-m','amplifier_acp','--config',config],cwd:workspace,resolveWorkspace:()=>workspace};
 const admin=new AdminConnection(options),other=new AdminConnection(options),context={fenceId:'root-fence',commandId:'recovery-job',purpose:'recovery' as const,instanceId:'same-host',dataScope:'owned'};
 try{
  const held=await admin.quiescenceParticipant.acquire(context);assert.ok(held);assert.equal(held.ownerId,'native-admin');
  await assert.rejects(admin.perform('modules.save',{module:'tool-never',section:'tools',config:{}},{clientId:'browser'}),/intake is held/);
  assert.equal(await other.quiescenceParticipant.acquire({...context,commandId:'other'}),null);
  await assert.rejects(admin.perform('maintenance.preview',{sessions:[],parts:['native-settings'],privateContentReviewed:true},{clientId:'browser'}),/intake is held/);
  await admin.withMaintenanceFence(context,async()=>{
   await assert.rejects(admin.perform('modules.save',{module:'tool-never',section:'tools',config:{}},{clientId:'trusted'}),/intake is held/);
   const preview=await admin.perform('maintenance.preview',{sessions:[],parts:['native-settings'],privateContentReviewed:true},{clientId:'trusted'});
   const lease=await admin.perform('maintenance.acquire',{commandId:'native-acquire',previewHash:preview.previewHash},{clientId:'trusted'});assert.equal(lease.active,true);
   const snapshot=await admin.perform('maintenance.snapshot',{commandId:'native-snapshot',leaseId:lease.leaseId,previewHash:preview.previewHash},{clientId:'trusted'});assert.equal(snapshot.receipt.state,'succeeded');
   await admin.perform('maintenance.release',{leaseId:lease.leaseId},{clientId:'trusted'});
  });
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
