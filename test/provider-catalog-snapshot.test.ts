import test from 'node:test';import assert from 'node:assert/strict';
const {createNativeCapabilities}=await import(process.env.AMPLIFIER_NATIVE_CAPABILITY_MODULE??'../src/index.js');
const session='ahp-session:/snapshot';
const context={clientId:'owned',session:{uri:session,workingDirectory:'/owned'}};
const req=(operation:string,args:any={},channel=session)=>({version:1,channel,topic:'provider-catalog',operation,args,commandId:'snapshot-'+operation});
const read=(scope=session)=>({uri:'amplifier-capability://native/provider-catalog',topic:'provider-catalog',scope,clientId:'owned'});
const key=(workspace:string,bundle:string)=>JSON.stringify([workspace,bundle]);
const defaults={models:[{id:'offline'}],defaultModel:'offline',opaque:{preserve:true}};
function fixture(){const calls:any[]=[];const provider=createNativeCapabilities({cacheMs:0,nativeControl:async()=>{throw Error('No runtime work');},nativeAdmin:async(op:string,args:any,ctx:any)=>{calls.push([op,structuredClone(args),ctx.session?.uri]);if(op==='configuration.defaults')return structuredClone(defaults);if(op==='providers.models')return {modelsProviderId:'fixture',models:[{id:'offline'}],providerMetadata:{module:'provider-fixture'}};return {providers:[{id:'fixture',module:'provider-openai-chatgpt'}],lastRead:op};}});return {provider,calls};}
test('provider reads publish complete defaults; mutations invalidate derived choices',async()=>{
 const {provider,calls}=fixture();const first=await provider.action(req('configuration.defaults',{bundle:'one'}),context);
 assert.deepEqual(first.updates.find((u:any)=>u.topic==='provider-catalog').data.draftDefaults,{[key('/owned','one')]:defaults});
 const operations=['providers.models','providers.list','providers.schema','providers.test','providers.testMessage','providers.credentials','providers.save','providers.remove','providers.move','providers.reorder','providers.finishSetup','providers.login','providers.loginStatus','providers.loginCancel','routing.list','routing.show','routing.save','routing.use'];
 for(const op of operations){
  const result=await provider.action(req(op,{id:'fixture',module:'provider-fixture'}),context);
  const data=result.updates.find((u:any)=>u.topic==='provider-catalog').data;
  const mutation=!['providers.models','providers.list','providers.schema','providers.credentials','providers.test','providers.testMessage','providers.loginStatus','routing.list','routing.show'].includes(op);
  assert.deepEqual(data.draftDefaults,mutation?undefined:{[key('/owned','one')]:defaults},op);
  if(mutation)assert.ok(result.invalidate.includes('provider-catalog'),'defaults discovery invalidation '+op);
  assert.equal(data.setup.operations[op+':'+(['providers.credentials','providers.schema'].includes(op)?'provider-fixture':'fixture')].phase,'ready');
  assert.deepEqual((await provider.read(read())).data.draftDefaults,data.draftDefaults,'uncached '+op);
  if(mutation)await provider.action(req('configuration.defaults',{bundle:'one'}),context);
 }
 assert.equal(calls.filter(row=>row[0]==='configuration.defaults').length,10);
});
test('defaults retain separate workspace/bundle keys with copied bounded scoped projections',async()=>{
 const {provider}=fixture();const host={clientId:'owned'};
 for(const workspace of ['/a','/b'])for(const bundle of ['one','two'])await provider.action(req('configuration.defaults',{workspace,bundle},'host'),host);
 const result=await provider.action(req('providers.models',{id:'fixture'},'host'),host),data=result.updates[0].data;
 assert.deepEqual(Object.keys(data.draftDefaults).sort(),['/a','/b'].flatMap(w=>['one','two'].map(b=>key(w,b))).sort());
 data.draftDefaults[key('/a','one')].opaque.preserve=false;
 assert.equal((await provider.read(read('host'))).data.draftDefaults[key('/a','one')].opaque.preserve,true);
 assert.equal((await provider.read(read())).data.draftDefaults,undefined);
 for(let n=0;n<70;n++)await provider.action(req('configuration.defaults',{workspace:'/bounded',bundle:String(n)},'host'),host);
 const bounded=(await provider.read(read('host'))).data;
 assert.equal(Object.keys(bounded.draftDefaults).length,64);assert.ok(bounded.draftDefaults[key('/bounded','69')]);assert.equal(bounded.draftDefaults[key('/bounded','0')],undefined);
 assert.ok(Buffer.byteLength(JSON.stringify(bounded))<=768*1024);
 await provider.action(req('configuration.defaults',{workspace:'/bounded',bundle:'0'},'host'),host);
 assert.deepEqual((await provider.read(read('host'))).data.draftDefaults[key('/bounded','0')],defaults);
});
test('foreign selectors and uncertain or refused actions cannot replace retained defaults',async()=>{
 let dispatches=0,fail=false,refuse=false;const provider=createNativeCapabilities({cacheMs:0,nativeControl:async()=>({}),nativeAdmin:async(op:string)=>{dispatches++;if(refuse)throw Object.assign(Error('Refused before effect'),{data:{executed:false,replayed:false,reason:'owned-preflight-refused'}});if(fail)throw Error('Original result unknown');return op==='configuration.defaults'?defaults:{providers:[]};}});
 await provider.action(req('configuration.defaults',{bundle:'one'}),context);
 const before=dispatches;await assert.rejects(provider.action(req('providers.models',{sessionId:'ahp-session:/foreign'}),context),/scope/);assert.equal(dispatches,before);
 fail=true;await assert.rejects(provider.action(req('providers.models',{id:'fixture'}),context),/Original result unknown/);
 fail=false;refuse=true;const refused=await provider.action(req('providers.save',{id:'fixture'}),context);assert.equal(refused.accepted,false);assert.equal(refused.result.executed,false);assert.deepEqual(refused.updates,[]);refuse=false;assert.deepEqual((await provider.read(read())).data.draftDefaults,{[key('/owned','one')]:defaults});assert.equal(dispatches,before+3);
});

test('runtime-only provider reads keep fresh mounted truth without administration snapshots',async()=>{
 let model='first';const provider=createNativeCapabilities({cacheMs:0,nativeControl:async(_scope:string,op:string)=>{assert.equal(op,'configuration.providers');return {selection:{model}};}});
 assert.equal((await provider.read(read())).data.setup.selection.model,'first');model='second';
 const next=await provider.read(read());assert.equal(next.data.setup.selection.model,'second');assert.equal(next.data.draftDefaults,undefined);
});

test('authoritative invalidation drops derived defaults and explicit reload restores the original key',async()=>{
 const {provider,calls}=fixture();await provider.action(req('configuration.defaults',{bundle:'one'}),context);
 provider.invalidate(session,['configuration']);assert.equal((await provider.read(read())).data.draftDefaults,undefined);
 await provider.action(req('configuration.defaults',{bundle:'one'}),context);
 assert.deepEqual((await provider.read(read())).data.draftDefaults,{[key('/owned','one')]:defaults});
 assert.equal(calls.filter(row=>row[0]==='configuration.defaults').length,2);
});

test('large derived choices evict older keys before exceeding the topic byte bound',async()=>{
 const result={phase:'ready',content:'x'.repeat(48*1024)};
 const provider=createNativeCapabilities({cacheMs:0,nativeControl:async()=>({}),nativeAdmin:async(op:string)=>op==='configuration.defaults'?result:{providers:[]}});
 for(let n=0;n<20;n++)await provider.action(req('configuration.defaults',{bundle:String(n)}),context);
 const data=(await provider.read(read())).data;
 assert.ok(Object.keys(data.draftDefaults).length<20);assert.equal(data.draftDefaults[key('/owned','0')],undefined);assert.deepEqual(data.draftDefaults[key('/owned','19')],result);
 assert.ok(Buffer.byteLength(JSON.stringify(data.draftDefaults))<=512*1024);assert.ok(Buffer.byteLength(JSON.stringify(data))<=768*1024);
});

test('late successful defaults read cannot overwrite newer authoritative invalidation',async()=>{
 let finish:(value:any)=>void,started:()=>void;const began=new Promise<void>(r=>started=r),pending=new Promise<any>(r=>finish=r);
 const provider=createNativeCapabilities({cacheMs:0,nativeControl:async()=>({}),nativeAdmin:async(op:string)=>{if(op==='configuration.defaults'){started();return pending;}return {providers:[]};}});
 const late=provider.action(req('configuration.defaults',{bundle:'one'}),context);await began;
 await provider.action(req('providers.save',{id:'fixture'}),context);finish(defaults);
 const result=await late;assert.equal(result.accepted,true);assert.deepEqual(result.result,defaults);assert.deepEqual(result.updates,[]);assert.deepEqual(result.invalidate,['provider-catalog']);
 assert.equal((await provider.read(read())).data.draftDefaults,undefined);
});
