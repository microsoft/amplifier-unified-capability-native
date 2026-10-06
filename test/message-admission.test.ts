import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,symlink,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {DatabaseSync} from 'node:sqlite';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {readFile} from 'node:fs/promises';
const {MessageConnection,AdminConnection}=await import(process.env.AMPLIFIER_NATIVE_CAPABILITY_MODULE??'../src/index.js');
const ctx={fenceId:'original-fence',commandId:'original-command',purpose:'distribution-update' as const,instanceId:'original-instance',dataScope:'owned-scope'};
const proof=(c=ctx)=>({...c,kind:'distribution-admission-abort' as const,verified:true as const,receiptId:'trusted-'+c.fenceId});
const hostShape=(c=ctx)=>({...c,phase:'unknown',owners:['native-message-metadata'],observedAt:1,admissionStage:'acquiring',proof:proof(c)});
const options=(root:string)=>({command:'/must-not-start',cwd:root,account:'owned-account',admissionDirectory:join(root,'intake'),resolveSession:async()=>{throw Error('No Native session may be resolved');}});
test('held replacement negotiates its real owner without admitting history or settling the original fence',async()=>{
 const root=await mkdtemp(join(tmpdir(),'message-held-negotiate-')),peer=join(root,'peer.mjs'),audit=join(root,'audit');
 await writeFile(peer,`import readline from 'node:readline';import{appendFileSync}from'node:fs';for await(const line of readline.createInterface({input:process.stdin})){const r=JSON.parse(line);appendFileSync(${JSON.stringify(audit)},r.method+'\\n');if(r.method!=='initialize')throw Error('No message or history RPC allowed');await new Promise(resolve=>setTimeout(resolve,30));console.log(JSON.stringify({jsonrpc:'2.0',id:r.id,result:{protocolVersion:1,agentCapabilities:{_meta:{'amplifier.dev/native':{version:1,messageInteractions:{version:1,methods:['reaction','read','receipt']}}}}}}));}`);
 let c=new MessageConnection(options(root));
 try{
  assert.ok(await c.quiescenceParticipant.acquire(ctx));await c.close();
  c=new MessageConnection({...options(root),command:process.execPath,args:[peer]});
  const journal=join(root,'intake/message-admission.sqlite3'),before=await readFile(journal);
  const {MessageCapabilities}=await import(process.env.AMPLIFIER_NATIVE_CAPABILITY_MODULE??'../src/index.js');const provider=new MessageCapabilities(c);
  const negotiating=provider.negotiate();assert.equal(c.activity().calls,1);
  await assert.rejects(c.close(),/in flight/);
  await assert.rejects(c.quiescenceParticipant.abortAdmission(hostShape()),/active/);
  assert.equal(await negotiating,true);assert.ok(provider.manifest.actions['message.reaction']);
  assert.deepEqual(c.activity(),{calls:0,intakeClosed:true,uncertain:false,closed:false});
  for(const operation of ['read','reaction','receipt'] as const)await assert.rejects(c.perform(operation,{},{}),/fenced/);
  assert.deepEqual(await readFile(journal),before);
  assert.equal(await provider.negotiate(),true);assert.equal(await readFile(audit,'utf8'),'initialize\n');
  const release={verified:true as const,fenceId:ctx.fenceId,commandId:ctx.commandId,dataScope:ctx.dataScope,instanceId:'authenticated-replacement',outcome:'ready' as const,receiptId:'authenticated-ready'};
  await c.quiescenceParticipant.reconcileRelease({...ctx,outcome:'ready',proof:release});assert.equal(c.activity().intakeClosed,false);
  await c.close();c=new MessageConnection(options(root));assert.equal(c.activity().intakeClosed,false);
  await c.quiescenceParticipant.reconcileRelease({...ctx,outcome:'ready',proof:release});
 }finally{await c.close();await rm(root,{recursive:true,force:true});}
});
test('durable original acquired acknowledgement loss and abort acknowledgement loss reopen with exact receipts',async()=>{
 const root=await mkdtemp(join(tmpdir(),'message-abort-'));let c=new MessageConnection(options(root));
 try{assert.ok(await c.quiescenceParticipant.acquire(ctx));await c.close();c=new MessageConnection(options(root));assert.equal(c.activity().intakeClosed,true);
 const receipt=await c.quiescenceParticipant.abortAdmission(hostShape());assert.equal(receipt.status,'released');assert.equal(receipt.ownerId,'native-message-metadata');assert.equal(c.activity().intakeClosed,false);
 await c.close();c=new MessageConnection(options(root));assert.deepEqual(await c.quiescenceParticipant.abortAdmission(hostShape()),receipt);
 const newer={...ctx,fenceId:'newer-fence',commandId:'newer-command'};assert.ok(await c.quiescenceParticipant.acquire(newer));(c as any).calls=1;
 assert.deepEqual(await c.quiescenceParticipant.abortAdmission(hostShape()),receipt);assert.equal(c.activity().calls,1);assert.equal(c.activity().intakeClosed,true);
 await assert.rejects(c.quiescenceParticipant.abortAdmission({...hostShape(),proof:{...proof(),receiptId:'wrong'}}));await assert.rejects(c.quiescenceParticipant.abortAdmission(hostShape(newer)));
 (c as any).calls=0;assert.equal((await c.quiescenceParticipant.abortAdmission(hostShape(newer))).status,'released');assert.ok(await c.quiescenceParticipant.acquire({...ctx,fenceId:'genuine-next',commandId:'next'}));
 }finally{await c.close();await rm(root,{recursive:true,force:true});}
});
test('durable refusal stays refused and missing or foreign original evidence cannot settle another hold',async()=>{
 const root=await mkdtemp(join(tmpdir(),'message-abort-refusal-'));let c=new MessageConnection(options(root));try{
 (c as any).calls=1;assert.equal(await c.quiescenceParticipant.acquire(ctx),null);(c as any).calls=0;assert.equal(await c.quiescenceParticipant.acquire(ctx),null);await c.close();c=new MessageConnection(options(root));
 const newer={...ctx,fenceId:'newer',commandId:'newer'};assert.ok(await c.quiescenceParticipant.acquire(newer));
 await assert.rejects(c.quiescenceParticipant.abortAdmission(hostShape()));assert.equal(c.activity().intakeClosed,true);
 for(const change of [{commandId:'foreign'},{instanceId:'foreign'},{dataScope:'foreign'}]){const foreign={...newer,...change};await assert.rejects(c.quiescenceParticipant.abortAdmission(hostShape(foreign)));assert.equal(c.activity().intakeClosed,true);}
 await assert.rejects(c.quiescenceParticipant.abortAdmission(hostShape({...ctx,fenceId:'never-acquired'})));
 await c.quiescenceParticipant.abortAdmission(hostShape(newer));assert.equal((await c.quiescenceParticipant.abortAdmission(hostShape())).status,'not-acquired');
 }finally{await c.close();await rm(root,{recursive:true,force:true});}
});
test('atomic abort failure preserves held acquisition and exact retry succeeds',async()=>{
 const root=await mkdtemp(join(tmpdir(),'message-abort-atomic-')),c=new MessageConnection(options(root));try{
 assert.ok(await c.quiescenceParticipant.acquire(ctx));const db=new DatabaseSync(join(root,'intake/message-admission.sqlite3'));
 try{db.exec("CREATE TRIGGER fail_abort BEFORE UPDATE ON attempts WHEN instr(NEW.value,'aborted')>0 BEGIN SELECT RAISE(ABORT,'owned atomic fault'); END");await assert.rejects(c.quiescenceParticipant.abortAdmission(hostShape()),/owned atomic fault/);assert.equal(c.activity().intakeClosed,true);db.exec('DROP TRIGGER fail_abort');}finally{db.close();}
 assert.equal((await c.quiescenceParticipant.abortAdmission(hostShape())).status,'released');
 }finally{await c.close();await rm(root,{recursive:true,force:true});}
});
test('unknown effect journal survives replacement and never fabricates no-acquire proof',async()=>{
 const root=await mkdtemp(join(tmpdir(),'message-abort-unknown-'));let c=new MessageConnection(options(root));try{
 // This is a causal persistence boundary fixture; no model or Native effect is invoked.
 const journal=(c as any).admission,id=journal.begin({operation:'reaction',commandId:'original',scope:'ahp-session:/owned',sessionId:'native',cwd:root});journal.end(id,true);
 assert.equal(await c.quiescenceParticipant.acquire(ctx),null);await c.close();c=new MessageConnection(options(root));
 assert.equal(c.activity().uncertain,true);await assert.rejects(c.quiescenceParticipant.abortAdmission(hostShape()),/unknown/);assert.equal(c.activity().uncertain,true);await assert.rejects(c.close(),/uncertain/);
 }finally{(c as any).uncertain=false;await c.close();await rm(root,{recursive:true,force:true});}
});
test('lifetime exclusion, symlink and partial journal refuse; durable abort without configured journal refuses',async()=>{
 const root=await mkdtemp(join(tmpdir(),'message-abort-path-'));const c=new MessageConnection(options(root));try{assert.throws(()=>new MessageConnection(options(root)));}finally{await c.close();}
 try{await symlink(join(root,'intake'),join(root,'link'));assert.throws(()=>new MessageConnection({...options(root),admissionDirectory:join(root,'link')}));
 const broken=join(root,'partial');const temp=new MessageConnection({...options(root),admissionDirectory:broken});await temp.close();await writeFile(join(broken,'message-admission.sqlite3'),'');assert.throws(()=>new MessageConnection({...options(root),admissionDirectory:broken}),/schema/);
 const legacy=new MessageConnection({...options(root),admissionDirectory:undefined});await assert.rejects(legacy.quiescenceParticipant.abortAdmission(hostShape()),/unavailable/);await legacy.close();
 }finally{await rm(root,{recursive:true,force:true});}
});
test('actual Native participant projects Host-shaped abort fence while direct boundary stays strict',{skip:!process.env.AMPLIFIER_ACP_PYTHON},async()=>{
 const root=await mkdtemp(join(tmpdir(),'native-host-shape-')),config=join(root,'native.json');await writeFile(config,JSON.stringify({home:join(root,'home'),appHome:join(root,'app'),adminWorkspaceRoots:[root],workerCommand:['/must-not-start']}));
 const c=new AdminConnection({command:process.env.AMPLIFIER_ACP_PYTHON!,args:['-B','-m','amplifier_acp','--config',config],cwd:root,resolveWorkspace:()=>root});
 try{assert.ok(await c.quiescenceParticipant.acquire({...ctx,phase:'acquiring',owners:['native-admin']}));await assert.rejects(c.abortAdmission(hostShape()),/Exact authenticated/);const receipt=await c.quiescenceParticipant.abortAdmission(hostShape());assert.equal(receipt.status,'released');assert.deepEqual(await c.quiescenceParticipant.abortAdmission(hostShape()),receipt);}finally{await c.close();await rm(root,{recursive:true,force:true});}
});

test('legacy owner ready release settles authenticated old fence without inventing acquisition',async()=>{
 const root=await mkdtemp(join(tmpdir(),'message-legacy-ready-'));let c=new MessageConnection(options(root));
 const releaseProof={verified:true as const,fenceId:ctx.fenceId,commandId:ctx.commandId,dataScope:ctx.dataScope,instanceId:'authenticated-replacement',outcome:'ready' as const,receiptId:'authenticated-ready'};
 try{assert.equal(c.activity().intakeClosed,false);await assert.rejects(c.quiescenceParticipant.abortAdmission(hostShape()),/unconfirmed/);
 for(const invalid of [{...releaseProof,verified:false},{...releaseProof,instanceId:ctx.instanceId},{...releaseProof,commandId:'foreign'}]){await assert.rejects(c.quiescenceParticipant.reconcileRelease({...hostShape(),outcome:'ready',proof:invalid}));assert.equal(c.activity().intakeClosed,false);}
 await c.quiescenceParticipant.reconcileRelease({...hostShape(),outcome:'ready',proof:releaseProof});assert.equal(c.activity().intakeClosed,false);
 await c.close();c=new MessageConnection(options(root));await c.quiescenceParticipant.reconcileRelease({...hostShape(),outcome:'ready',proof:releaseProof});
 await assert.rejects(c.quiescenceParticipant.abortAdmission(hostShape()),/unconfirmed/);
 assert.ok(await c.quiescenceParticipant.acquire({...ctx,fenceId:'next-legacy',commandId:'next-legacy'}));
 }finally{await c.close();await rm(root,{recursive:true,force:true});}
});

test('actual unknown message RPC persists across process exit and fences replacement without replay',async()=>{
 const root=await mkdtemp(join(tmpdir(),'message-unknown-rpc-')),peer=join(root,'peer.mjs'),child=join(root,'child.mjs'),audit=join(root,'audit');
 await writeFile(peer,`import readline from 'node:readline';import{appendFileSync}from'node:fs';for await(const line of readline.createInterface({input:process.stdin})){const r=JSON.parse(line);appendFileSync(${JSON.stringify(audit)},r.method+'\\n');if(r.method==='_amplifier/message/reaction'){console.log(JSON.stringify({jsonrpc:'2.0',id:r.id,error:{code:-32000,message:'owned lost result',data:{outcome:'unknown'}}}));process.exit(0);}const result=r.method==='initialize'?{protocolVersion:1,agentCapabilities:{_meta:{'amplifier.dev/native':{version:1,messageInteractions:{version:1,methods:['reaction','read','receipt']}}}}}:{};console.log(JSON.stringify({jsonrpc:'2.0',id:r.id,result}));}`);
 const module=process.env.AMPLIFIER_NATIVE_CAPABILITY_MODULE??new URL('../src/index.ts',import.meta.url).href;
 await writeFile(child,`import{MessageConnection}from ${JSON.stringify(module)};const c=new MessageConnection({...${JSON.stringify(options(root))},command:process.execPath,args:[${JSON.stringify(peer)}],resolveSession:async()=>({uri:'ahp-session:/owned',nativeSessionId:'native',workingDirectory:${JSON.stringify(root)}})});try{await c.perform('reaction',{reference:{sessionId:'native'},commandId:'original-reaction'},{clientId:'owned',account:'owned-account',session:{uri:'ahp-session:/owned'}});throw Error('Expected unknown');}catch(e){if(!c.activity().uncertain)throw e;}if(await c.quiescenceParticipant.acquire(${JSON.stringify(ctx)})!==null)throw Error('Unknown effect admitted');console.log('unknown retained');process.exit(0);`);
 let c:any;try{const result=await promisify(execFile)(process.execPath,['--import','tsx',child]);assert.match(result.stdout,/unknown retained/);c=new MessageConnection(options(root));assert.equal(c.activity().uncertain,true);await assert.rejects(c.quiescenceParticipant.abortAdmission(hostShape()),/unknown/);await assert.rejects(c.capabilities(),/fenced/);await assert.rejects(c.quiescenceParticipant.reconcileRelease({...ctx,outcome:'ready',proof:{verified:true,fenceId:ctx.fenceId,commandId:ctx.commandId,dataScope:ctx.dataScope,instanceId:'replacement',outcome:'ready',receiptId:'authenticated-ready'}}));assert.equal(c.activity().uncertain,true);const db=new DatabaseSync(join(root,'intake/message-admission.sqlite3'),{readOnly:true});try{const call=JSON.parse(String(db.prepare('SELECT id FROM calls').get()!.id));assert.equal(call.operation,'reaction');assert.equal(call.commandId,'original-reaction');assert.equal(call.sessionId,'native');assert.equal(call.scope,'ahp-session:/owned');assert.equal(call.cwd,root);}finally{db.close();}const rows=(await readFile(audit,'utf8')).trim().split('\n');assert.deepEqual(rows,['initialize','_amplifier/history','_amplifier/message/reaction']);}finally{if(c){c.uncertain=false;await c.close();}await rm(root,{recursive:true,force:true});}
});

test('orphan sidecars and missing identity refuse unchanged before writable startup',async()=>{
 for(const suffix of ['-wal','-shm','-journal']){
  const root=await mkdtemp(join(tmpdir(),'message-orphan-')),dir=join(root,'intake');
  const {mkdir,readdir}=await import('node:fs/promises');await mkdir(dir);
  const file=join(dir,'message-admission.sqlite3'+suffix);await writeFile(file,'');
  try{const before=await readdir(dir);assert.throws(()=>new MessageConnection(options(root)),/main database is missing/);assert.deepEqual(await readdir(dir),before);assert.equal((await readFile(file)).length,0);}finally{await rm(root,{recursive:true,force:true});}
 }
 const root=await mkdtemp(join(tmpdir(),'message-missing-identity-'));const c=new MessageConnection(options(root));assert.ok(await c.quiescenceParticipant.acquire(ctx));await c.close();
 const file=join(root,'intake/message-admission.sqlite3'),db=new DatabaseSync(file);db.exec('DELETE FROM identity');db.close();
 try{const before=await readFile(file);for(const account of ['owned-account','different-account'])assert.throws(()=>new MessageConnection({...options(root),account}),/identity is missing or changed/);assert.deepEqual(await readFile(file),before);
 const read=new DatabaseSync(file,{readOnly:true});try{assert.equal(read.prepare('SELECT count(*) n FROM identity').get()!.n,0);assert.ok(read.prepare('SELECT value FROM held WHERE id=1').get());}finally{read.close();}}finally{await rm(root,{recursive:true,force:true});}
});

for(const operation of ['read','reaction'] as const)test('actual interrupted '+operation+' preserves the correct durable effect boundary',async()=>{
 const root=await mkdtemp(join(tmpdir(),'message-passive-exit-')),peer=join(root,'peer.mjs'),child=join(root,'child.mjs'),audit=join(root,'audit');
 const c=new MessageConnection(options(root));await c.close();
 const file=join(root,'intake/message-admission.sqlite3'),before=await readFile(file);
 await writeFile(peer,`import readline from 'node:readline';import{appendFileSync}from'node:fs';for await(const line of readline.createInterface({input:process.stdin})){const r=JSON.parse(line);appendFileSync(${JSON.stringify(audit)},r.method+'\\n');if(r.method==='_amplifier/message/'+${JSON.stringify(operation)})continue;const result=r.method==='initialize'?{protocolVersion:1,agentCapabilities:{_meta:{'amplifier.dev/native':{version:1,messageInteractions:{version:1,methods:['reaction','read','receipt']}}}}}:{};console.log(JSON.stringify({jsonrpc:'2.0',id:r.id,result}));}`);
 const module=process.env.AMPLIFIER_NATIVE_CAPABILITY_MODULE??new URL('../src/index.ts',import.meta.url).href;
 await writeFile(child,`import{MessageConnection}from ${JSON.stringify(module)};import{readFile}from'node:fs/promises';const c=new MessageConnection({...${JSON.stringify(options(root))},command:process.execPath,args:[${JSON.stringify(peer)}],resolveSession:async()=>({uri:'ahp-session:/owned',nativeSessionId:'native',workingDirectory:${JSON.stringify(root)}})});c.perform(${JSON.stringify(operation)},${JSON.stringify(operation==='read'?{messageIds:['message']}:{commandId:'interrupted-original',reference:{sessionId:'native'}})},{clientId:'owned',account:'owned-account',session:{uri:'ahp-session:/owned'}}).catch(()=>{});for(let n=0;n<200;n++){const audit=await readFile(${JSON.stringify(audit)},'utf8').catch(()=>'');if(audit.includes('_amplifier/message/'+${JSON.stringify(operation)})){console.log(${JSON.stringify(operation+' interrupted')});process.exit(0);}await new Promise(r=>setTimeout(r,10));}throw Error('Passive read not dispatched');`);
 let replacement:any;try{const result=await promisify(execFile)(process.execPath,['--import','tsx',child]);assert.ok(result.stdout.includes(operation+' interrupted'));if(operation==='read')assert.deepEqual(await readFile(file),before);replacement=new MessageConnection(options(root));assert.equal(replacement.activity().uncertain,operation==='reaction');assert.equal(replacement.activity().intakeClosed,operation==='reaction');const db=new DatabaseSync(file,{readOnly:true});try{assert.equal(db.prepare('SELECT count(*) n FROM calls').get()!.n,operation==='read'?0:1);}finally{db.close();}if(operation==='read')assert.ok(await replacement.quiescenceParticipant.acquire(ctx));else{assert.equal(await replacement.quiescenceParticipant.acquire(ctx),null);await assert.rejects(replacement.quiescenceParticipant.abortAdmission(hostShape()),/unknown/);}}finally{if(replacement){replacement.uncertain=false;await replacement.close();}await rm(root,{recursive:true,force:true});}
});
