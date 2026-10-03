import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,rm,stat,realpath} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
const {createPermissionsCapabilities,AdminConnection}=await import(process.env.AMPLIFIER_NATIVE_CAPABILITY_MODULE??'../src/index.js');
const sid='ahp-session:/selected';
test('private scope selection never enters shared topic; same revision and exact selected session are enforced before native calls',async()=>{
 const calls:any[]=[],changes:any[]=[];const view={scope:'local',allowed:[],denied:[],revision:'a'.repeat(64),scopes:['global','project','local'],limits:{pathsPerList:64,pathChars:4096},application:'next-idle-execution'};
 const owner=createPermissionsCapabilities({nativeAdmin:async(op:string,args:any,context:any)=>{calls.push({op,args,context});return op==='permissions.save'?{status:'succeeded',result:view}:view;},onInvalidate:(...args:any[])=>changes.push(args)});
 const context={clientId:'one',origin:'agent' as const,session:{uri:sid}};
 const request=(op:string,args:any,channel=sid)=>({version:1,channel,topic:'permissions',operation:op,commandId:'command',args});
 await assert.rejects(owner.action(request('permissions.save',{scope:'global',expectedRevision:view.revision,allowed:[],denied:[]}),context),/global/);
 await assert.rejects(owner.action(request('permissions.save',{expectedRevision:view.revision,allowed:[],denied:[]}),context),/global/);
 await assert.rejects(owner.action(request('permissions.get',{sessionId:'ahp-session:/foreign'}),context),/selector/);
 await assert.rejects(owner.action(request('permissions.get',{},'ahp-root://'),context),/own|current/);
 await assert.rejects(owner.action(request('permissions.save',{scope:'project',workspace:'/foreign',expectedRevision:view.revision,allowed:[],denied:[]}),context),/Unexpected/);
 assert.equal(calls.length,0);
 const saved=await owner.action(request('permissions.save',{sessionId:sid,scope:'project',expectedRevision:view.revision,allowed:['output'],denied:[]}),context);assert.deepEqual(saved.updates,[]);assert.deepEqual(changes,[['permissions','host']]);
 assert.equal(calls[0].args.commandId,'command');assert.equal(calls[0].args.sessionId,undefined);
 const metadata=await owner.read({topic:'permissions',scope:'host',clientId:'other'});assert.equal(metadata.data.permissions,undefined);assert.equal(metadata.data.permissionsCapability.available,true);assert.equal(metadata.data.permissionsCapability.scope,undefined);
 const read=await owner.action(request('permissions.get',{sessionId:sid,scope:'local'}),context);assert.deepEqual(read.result,view);assert.deepEqual(read.updates,[]);assert.equal(changes.length,1,'Reads must not produce read-invalidation loops');
 assert.deepEqual(owner.quiescenceAccess,{'permissions.get':'read','permissions.receipt':'read'});
 const schemas=await owner.actionSchemas();assert.ok(schemas['permissions.save'].schema.properties.sessionId);
});

test('actual native permissions bridge preserves CAS, passive held receipts and current-session agent authority',{skip:!process.env.AMPLIFIER_ACP_PYTHON},async()=>{
 const dir=await realpath(await mkdtemp(join(tmpdir(),'permissions-bridge-'))),workspace=join(dir,'workspace'),home=join(dir,'home');await mkdir(workspace);await mkdir(home);
 const config=join(dir,'native.json');await writeFile(config,JSON.stringify({home,appHome:join(dir,'app'),adminWorkspaceRoots:[workspace],adminPermissions:true,workerCommand:['/never/start/permissions-worker']}));
 const options={command:process.env.AMPLIFIER_ACP_PYTHON!,args:['-m','amplifier_acp','--config',config],cwd:workspace,resolveWorkspace:async()=>workspace};let admin=new AdminConnection(options);
 const create=()=>createPermissionsCapabilities({nativeAdmin:(...args:any[])=>admin.perform(...args),inspectSession:async(selected:string)=>{assert.equal(selected,sid);return {uri:sid,workingDirectory:workspace};}});let owner=create();
 const context={clientId:'browser',origin:'ui' as const,session:{uri:sid,workingDirectory:workspace}};
 const action=(op:string,args:any,id='operation')=>owner.action({version:1,channel:sid,topic:'permissions',operation:op,commandId:id,args},context);
 try{
  const initial=(await owner.action({version:1,channel:'ahp-root://',topic:'permissions',operation:'permissions.get',commandId:'selected-read',args:{scope:'project',sessionId:sid}},{clientId:'browser',origin:'ui'})).result;
  assert.equal(initial.workspace,workspace);
  const args={scope:'project',expectedRevision:initial.revision,allowed:['outputs'],denied:['private'],sessionId:sid};
  const saved=await action('permissions.save',args,'saved');assert.equal(saved.result.status,'succeeded');assert.deepEqual(saved.result.result.allowed,[join(workspace,'outputs')]);
  const stale=await action('permissions.save',{...args,allowed:[]},'stale');assert.equal(stale.accepted,false);assert.equal(stale.result.executed,false);
  await admin.close();admin=new AdminConnection(options);owner=create();
  assert.deepEqual((await action('permissions.receipt',{sessionId:sid,commandId:'saved'})).result,saved.result);
  const lease=await admin.quiescenceParticipant.acquire({fenceId:'fence',commandId:'stop',purpose:'distribution-update',instanceId:'host',dataScope:'scope'});assert.ok(lease);
  assert.equal((await action('permissions.get',{scope:'project'})).result.revision,saved.result.result.revision);
  assert.deepEqual((await action('permissions.receipt',{commandId:'saved'})).result,saved.result);
  await assert.rejects(action('permissions.save',{...args,expectedRevision:saved.result.result.revision},'blocked'),/intake is held/);
  await lease.release('unchanged',{kind:'admission-refused'});
  await assert.rejects(admin.perform('permissions.save',{scope:'global'},{clientId:'agent',origin:'agent',session:{uri:sid}}),/restricted/);
  await assert.rejects(stat(join(home,'projects')));
 }finally{await admin.close();await rm(dir,{recursive:true,force:true});}
});

test('unadvertised permission owner refuses before dispatch and creates no settings',{skip:!process.env.AMPLIFIER_ACP_PYTHON},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'permissions-disabled-')),workspace=join(dir,'workspace');await mkdir(workspace);const config=join(dir,'native.json');await writeFile(config,JSON.stringify({home:join(dir,'home'),appHome:join(dir,'app'),adminWorkspaceRoots:[workspace],workerCommand:['/never/start']}));
 const admin=new AdminConnection({command:process.env.AMPLIFIER_ACP_PYTHON!,args:['-m','amplifier_acp','--config',config],cwd:workspace,resolveWorkspace:()=>workspace});
 try{await assert.rejects(admin.perform('permissions.get',{},{clientId:'browser'}),(error:any)=>error.data?.executed===false&&error.data.reason==='permissions-unavailable');await assert.rejects(stat(join(dir,'app')));}finally{await admin.close();await rm(dir,{recursive:true,force:true});}
});

test('passive maintenance negotiation preserves full-native restore metadata without mounting or retaining caller edits',{skip:!process.env.AMPLIFIER_ACP_PYTHON},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'admin-capabilities-')),workspace=join(dir,'workspace');await mkdir(workspace);const config=join(dir,'native.json');await writeFile(config,JSON.stringify({home:join(dir,'home'),appHome:join(dir,'app'),adminWorkspaceRoots:[workspace],adminMaintenance:true,maintenanceFullNative:true,maintenanceRestoreRoots:[workspace],workerCommand:['/never/start']}));
 const admin=new AdminConnection({command:process.env.AMPLIFIER_ACP_PYTHON!,args:['-m','amplifier_acp','--config',config],cwd:workspace,resolveWorkspace:()=>workspace});
 try{
  const one=await admin.maintenanceCapabilities();assert.equal(one.version,1);assert.equal(one.archivePlans.fullNative.version,1);assert.equal(one.archivePlans.fullNative.restore.version,1);
  one.archivePlans.fullNative.version=999;assert.equal((await admin.maintenanceCapabilities()).archivePlans.fullNative.version,1);
  assert.equal((await admin.inspectLifecycle()).work.requests,0);
  const lease=await admin.quiescenceParticipant.acquire({fenceId:'restore-inspect',commandId:'recovery',purpose:'recovery',instanceId:'host',dataScope:'scope'});assert.ok(lease);
  const absent=await admin.perform('maintenance.restore.inspect',{restoreCommandId:'never-admitted'},{clientId:'browser'});assert.equal(absent.available,false);assert.equal(absent.finalized,false);
  await assert.rejects(admin.perform('maintenance.restore.apply',{commandId:'forbidden',previewHash:'x'},{clientId:'browser'}),/intake is held/);
  await lease.release('unchanged',{kind:'admission-refused'});await assert.rejects(stat(join(dir,'home','projects')));
 }finally{await admin.close();await rm(dir,{recursive:true,force:true});}
});


test('host-scoped UI selectors require exact authorized session binding; missing resolver or agent root selection never falls back',async()=>{
 const calls:any[]=[];let lookups=0;const inspector=async(uri:string)=>{lookups++;if(uri!==sid)throw Error('unauthorized session');return {uri,workingDirectory:'/authorized/selected'};};
 const nativeAdmin=async(op:string,args:any,context:any)=>{calls.push({op,args,context});return {scope:'project',status:'succeeded'};};
 const owner=createPermissionsCapabilities({nativeAdmin,inspectSession:inspector}),request={version:1,channel:'ahp-root://',topic:'permissions',operation:'permissions.get',commandId:'read',args:{sessionId:sid,scope:'project'}};
 await owner.action(request,{clientId:'browser',origin:'ui'});assert.equal(calls[0].context.session.uri,sid);assert.equal(calls[0].context.session.workingDirectory,'/authorized/selected');assert.equal(calls[0].args.sessionId,undefined);
 await assert.rejects(owner.action({...request,args:{...request.args,sessionId:'ahp-session:/foreign'}},{clientId:'browser',origin:'ui'}),/unauthorized/);
 const before=lookups;await assert.rejects(owner.action(request,{clientId:'agent',origin:'agent'}),/current session/);assert.equal(lookups,before);
 await assert.rejects(createPermissionsCapabilities({nativeAdmin}).action(request,{clientId:'browser'}),/trusted host/);
 await assert.rejects(createPermissionsCapabilities({nativeAdmin,inspectSession:async()=>({uri:'ahp-session:/foreign',workingDirectory:'/other'})}).action(request,{clientId:'browser'}),/identity/);
 assert.equal(calls.length,1);
});
