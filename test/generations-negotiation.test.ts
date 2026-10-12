import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';
const {AdminConnection}=await import(process.env.AMPLIFIER_NATIVE_CAPABILITY_MODULE??'../src/index.js');
test('only negotiated metadata-only generation notifications invalidate; no implicit native reads or replay',async()=>{
 const marker={version:1,metadataOnly:true,notification:'_amplifier/admin/generationsChanged'};
 for(const progress of [undefined,{...marker,metadataOnly:false},{...marker,extra:true},marker]){
  const dir=await mkdtemp(join(tmpdir(),'generation-progress-')),script=join(dir,'peer.mjs');let changes=0;
  await writeFile(script,`import readline from 'node:readline';const send=row=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',...row})+'\\n');for await(const line of readline.createInterface({input:process.stdin})){const q=JSON.parse(line);if(q.method==='initialize'){send({id:q.id,result:{protocolVersion:1,agentCapabilities:{_meta:{'amplifier.dev/native':{version:1,admin:{version:1,generations:{version:1,...${JSON.stringify(progress?{progress}:{})}}}}}}}})}else{for(const params of [{version:1},{version:2},{version:1,private:'never project'}])send({method:'_amplifier/admin/generationsChanged',params});send({id:q.id,result:{state:'unknown'}})}}`);
  const admin=new AdminConnection({command:process.execPath,args:[script],cwd:dir,resolveWorkspace:()=>dir,onGenerationsChanged:()=>{changes++;throw Error('UI disconnected')}});
  try{assert.deepEqual(await admin.perform('generations.check',{commandId:'original'},{clientId:'fixture'}),{state:'unknown'});assert.equal(changes,progress===marker?1:0);}finally{await admin.close();await rm(dir,{recursive:true,force:true})}
 }
});
test('absent or incompatible generation grant refuses before admin dispatch; actual version1 grant preserves original result',async()=>{
 for(const metadata of [undefined,{version:2},{version:1}]){
  const dir=await mkdtemp(join(tmpdir(),'generation-bridge-grant-')),audit=join(dir,'audit.jsonl'),script=join(dir,'peer.mjs');await writeFile(script,`import readline from'node:readline';import{appendFileSync}from'node:fs';for await(const line of readline.createInterface({input:process.stdin})){const q=JSON.parse(line);appendFileSync(${JSON.stringify(audit)},JSON.stringify(q)+'\\n');if(q.id===undefined)continue;const result=q.method==='initialize'?{protocolVersion:1,agentCapabilities:{_meta:{'amplifier.dev/native':{version:1,admin:{version:1,...${JSON.stringify(metadata?{generations:metadata}:{})}}}}}}:{fixture:'exact-generation-read'};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:q.id,result})+'\\n');}`);
  const admin=new AdminConnection({command:process.execPath,args:[script],cwd:dir,resolveWorkspace:()=>dir});
  try{assert.deepEqual(await admin.generationsCapabilities(),metadata);
   if(metadata?.version===1)assert.deepEqual(await admin.perform('generations.inspect',{}, {clientId:'owned'}),{fixture:'exact-generation-read'});
   else for(const operation of ['generations.check','generations.inspect','generations.prepare','generations.promote','generations.rollback','generations.receipt','generations.repair'])await assert.rejects(admin.perform(operation,{commandId:'never-dispatched'},{clientId:'owned'}),(error:any)=>error.data?.executed===false&&error.data.replayed===false&&error.data.reason==='native-generations-unavailable');
   const calls=(await readFile(audit,'utf8')).trim().split('\n').map(line=>JSON.parse(line));assert.deepEqual(calls.map(row=>row.method),metadata?.version===1?['initialize','_amplifier/admin']:['initialize']);
  }finally{await admin.close();await rm(dir,{recursive:true,force:true});}
 }
});
