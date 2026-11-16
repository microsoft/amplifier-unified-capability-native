import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
const {AdminConnection}=await import(process.env.AMPLIFIER_NATIVE_CAPABILITY_MODULE??'../src/index.js');
const context={fenceId:'held-original',commandId:'update-original',purpose:'distribution-update' as const,instanceId:'original-host',dataScope:'owned-data'};
const proof={verified:true as const,fenceId:context.fenceId,commandId:context.commandId,dataScope:context.dataScope,outcome:'ready' as const,instanceId:'replacement-host',receiptId:'authenticated-ready'};
test('replacement release requires actual negotiated durable support and never reacquires',async()=>{
 for(const supported of [false,true]){
  const root=await mkdtemp(join(tmpdir(),'admin-release-')),peer=join(root,'peer.mjs'),audit=join(root,'audit');
  await writeFile(peer,`import readline from 'node:readline';import{appendFileSync}from'node:fs';for await(const line of readline.createInterface({input:process.stdin})){const r=JSON.parse(line);appendFileSync(${JSON.stringify(audit)},JSON.stringify({method:r.method,params:r.params})+'\\n');if(r.method!=='initialize'&&r.params.operation!=='reconcileRelease')throw Error('Unexpected admission or work');const result=r.method==='initialize'?{protocolVersion:1,agentCapabilities:{_meta:{'amplifier.dev/native':{version:1,admin:{version:1,lifecycle:{version:1,heldIntake:true,crossProcessWriterFence:true,admissionAbort:{version:1,durable:true,receipt:true},...(${supported}?{reconcileRelease:{version:1,durable:true,receipt:true}}:{})}}}}}}:{released:true,reconciled:true,intakeClosed:false,workerStarted:false,adminInstanceId:'native-replacement',lease:{...${JSON.stringify(context)},leaseId:'original-lease',adminInstanceId:'native-original'}};console.log(JSON.stringify({jsonrpc:'2.0',id:r.id,result}));}`);
  const admin=new AdminConnection({command:process.execPath,args:[peer],cwd:root,resolveWorkspace:()=>root});
  try{
   for(const change of [{verified:false},{instanceId:context.instanceId},{receiptId:''},{commandId:'foreign'},{purpose:'distribution-update'}])await assert.rejects(admin.quiescenceParticipant.reconcileRelease({...context,outcome:'ready',proof:{...proof,...change} as any}),/exact distribution release/);
   await assert.rejects(readFile(audit),'Invalid proof cannot even start a peer');
   const input={...context,phase:'unknown',owners:['native-admin'],outcome:'ready' as const,proof:{...proof}};
   if(supported){
    const pending=admin.quiescenceParticipant.reconcileRelease(input);input.proof.receiptId='caller-mutated';await pending;input.proof.receiptId=proof.receiptId;
    await admin.quiescenceParticipant.reconcileRelease({...input,phase:'settled'});
    const rows=(await readFile(audit,'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(rows.length,2);assert.equal(rows[1].params.operation,'reconcileRelease');
    assert.deepEqual(rows[1].params.args,{...context,outcome:'ready',proof});
    await assert.rejects(admin.quiescenceParticipant.reconcileRelease({...input,proof:{...proof,receiptId:'changed'}}));
   }else{
    await assert.rejects(admin.quiescenceParticipant.reconcileRelease(input),/no acquire was dispatched/);
    await assert.rejects(admin.perform('modules.save',{}, {clientId:'test'}),/intake is held/);
    assert.equal((await readFile(audit,'utf8')).trim().split('\n').length,1);
   }
  }finally{await admin.close();await rm(root,{recursive:true,force:true});}
 }
});

test('actual Native release survives lost reply and replacement without replay',{skip:!process.env.AMPLIFIER_ACP_PYTHON},async()=>{
 const root=await mkdtemp(join(tmpdir(),'native-release-')),config=join(root,'native.json');
 await writeFile(config,JSON.stringify({home:join(root,'home'),appHome:join(root,'app'),adminWorkspaceRoots:[root],workerCommand:['/must-not-start']}));
 const options={command:process.env.AMPLIFIER_ACP_PYTHON!,args:['-I','-B','-m','amplifier_acp','--config',config],cwd:root,resolveWorkspace:()=>root};
 const original=new AdminConnection(options),replacement=new AdminConnection(options),third=new AdminConnection(options);
 try{
  assert.ok(await original.quiescenceParticipant.acquire(context));await original.close();
  const rpc=(replacement as any).rpc.bind(replacement);let dispatches=0;
  (replacement as any).rpc=async(method:string,params:any)=>{assert.equal(params.operation,'reconcileRelease');dispatches++;const result=await rpc(method,params);assert.equal(result.reconciled,true);throw Error('lost release reply');};
  await assert.rejects(replacement.quiescenceParticipant.reconcileRelease({...context,outcome:'ready',proof}),/lost release reply/);
  assert.equal(dispatches,1);await replacement.close();
  await third.quiescenceParticipant.reconcileRelease({...context,phase:'unknown',owners:['native-admin'],outcome:'ready',proof});
  assert.equal((await third.inspectLifecycle()).intakeClosed,false);
  await third.quiescenceParticipant.reconcileRelease({...context,outcome:'ready',proof});
  const next=await third.quiescenceParticipant.acquire({...context,fenceId:'next-fence',commandId:'next-command'});assert.ok(next);
  await assert.rejects(third.quiescenceParticipant.reconcileRelease({...context,outcome:'ready',proof}));
  await next.release('unchanged',{kind:'admission-refused'});
  await assert.rejects(readFile(join(root,'home','projects')));
 }finally{await original.close();await replacement.close();await third.close();await rm(root,{recursive:true,force:true});}
});
