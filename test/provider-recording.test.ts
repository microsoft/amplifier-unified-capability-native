import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,stat,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const {createProviderRecordingCapabilities,AdminConnection}=await import(process.env.AMPLIFIER_NATIVE_CAPABILITY_MODULE??'../src/index.js');
const marker={version:1,cas:true,receipt:true,application:'next-runtime-preparation'};
test('recording is offered only after exact peer negotiation, with no fabricated policy',async()=>{
 for(const value of [undefined,{}, {...marker,receipt:false},{...marker,extra:true}])assert.equal(await createProviderRecordingCapabilities({nativeCapabilities:async()=>value,nativeAdmin:async()=>{throw Error('must not read')}}),undefined);
 assert.equal(await createProviderRecordingCapabilities({nativeCapabilities:async()=>{throw Error('offline')},nativeAdmin:async()=>{throw Error('must not read')}}),undefined);
});
test('recording UI and agent actions share trusted identity; foreign selectors never dispatch',async()=>{
 const calls:any[]=[];const owner=await createProviderRecordingCapabilities({nativeCapabilities:async()=>marker,nativeAdmin:async(...args:any[])=>{calls.push(args);return {status:'succeeded'}}});assert.ok(owner);
 const action=(args:any,channel='ahp-session:/s',operation='diagnostics.recording.configure',origin:'ui'|'agent'='ui')=>owner.action({version:1,topic:'provider-recording',operation,args,channel,commandId:'original'}, {clientId:'one',origin,session:{uri:'ahp-session:/s'}});
 const args={enabled:true,expectedRevision:'a'.repeat(64)};
 for(const origin of ['ui','agent'] as const)await action(args,undefined,undefined,origin);
 assert.equal(calls.length,2);assert.equal(calls[0][0],'provider.recording.configure');assert.equal(calls[0][1].commandId,'original');assert.deepEqual(calls[0][1],calls[1][1]);
 for(const bad of [{...args,home:'/foreign'},{...args,sessionId:'other'},{...args,enabled:'yes'},{...args,expectedRevision:1}])await assert.rejects(action(bad));
 await assert.rejects(action(args,'ahp-session:/other'));assert.equal(calls.length,2);
 await action({commandId:'original'},undefined,'diagnostics.recording.receipt');assert.equal(calls[2][0],'provider.recording.receipt');assert.deepEqual(calls[2][1],{commandId:'original'});
});
test('installed Native records an exact policy receipt and preserves held intake after lost reply',{skip:!process.env.AMPLIFIER_RECORDING_PYTHON},async()=>{
 const dir=await realpath(await mkdtemp(join(tmpdir(),'recording-native-'))),cwd=join(dir,'workspace'),home=join(dir,'home'),appHome=join(dir,'app');await mkdir(cwd);await mkdir(home);
 const file=join(dir,'native.json'),config={home,appHome,adminWorkspaceRoots:[cwd],adminProviderRecording:true,workerCommand:['/never/start']};await writeFile(file,JSON.stringify(config));
 const options={command:process.env.AMPLIFIER_RECORDING_PYTHON!,args:['-I','-B','-m','amplifier_acp','--config',file],cwd,resolveWorkspace:()=>cwd};let admin=new AdminConnection(options);
 try{
  const make=()=>createProviderRecordingCapabilities({nativeCapabilities:()=>admin.providerRecordingCapabilities(),nativeAdmin:admin.perform});let owner=await make();assert.ok(owner);
  const action=(operation:string,args:any={},id='read')=>owner!.action({version:1,topic:'provider-recording',channel:'host',commandId:id,operation,args},{clientId:'browser',origin:'ui'});
  const before=(await action('diagnostics.recording.get')).result;assert.equal(before.enabled,false);await assert.rejects(stat(appHome));
  const saved=await action('diagnostics.recording.configure',{enabled:true,expectedRevision:before.revision},'saved');assert.equal(saved.result.status,'succeeded');
  const bytes=await readFile(join(appHome,'diagnostics','config.json'));
  // Discard the delivered acknowledgement and replace the administration process.
  await admin.close();admin=new AdminConnection(options);owner=await make();assert.ok(owner);
  assert.deepEqual((await action('diagnostics.recording.receipt',{commandId:'saved'})).result,saved.result);
  assert.deepEqual(await readFile(join(appHome,'diagnostics','config.json')),bytes);
  const lease=await admin.quiescenceParticipant.acquire({fenceId:'freeze',commandId:'review',purpose:'recovery',instanceId:'host',dataScope:'owned'});assert.ok(lease);
  assert.equal((await action('diagnostics.recording.get')).result.enabled,true);
  assert.deepEqual((await action('diagnostics.recording.receipt',{commandId:'saved'})).result,saved.result);
  const blocked=await action('diagnostics.recording.configure',{enabled:false,expectedRevision:saved.result.result.revision},'blocked');assert.equal(blocked.accepted,false);assert.equal(blocked.result.executed,false);
  await lease.release('unchanged',{kind:'admission-refused'});await assert.rejects(stat(join(home,'projects')));
  await admin.close();await writeFile(file,JSON.stringify({...config,adminProviderRecording:false}));admin=new AdminConnection(options);assert.equal(await make(),undefined);
  await assert.rejects(admin.perform('provider.recording.get',{}, {clientId:'test'}),(error:any)=>error.data?.executed===false);
 }finally{await admin.close();await rm(dir,{recursive:true,force:true});}
});
