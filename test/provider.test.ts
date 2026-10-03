import test from 'node:test';import assert from 'node:assert/strict';
const {createNativeCapabilities}=await import(process.env.AMPLIFIER_NATIVE_CAPABILITY_MODULE??'../src/index.js');
const session='ahp-session:/one';const context={clientId:'browser',session:{uri:session,workingDirectory:'/owned'}};
function fixture(){let calls:Array<[string,string,any]>=[];const provider=createNativeCapabilities({nativeControl:async(scope,op,args)=>{calls.push([scope,op,args]);if(op==='capabilities')return {controls:['goals.get','goals.set','configuration.inspect','configuration.apply','configuration.providers','configuration.providerModels','bundle.preview']};if(op==='configuration.inspect')return {plan:{providers:[]},bundle:'test'};if(op==='goals.set')return {goal:args};if(op==='configuration.providerModels')return {provider:'p',models:[{id:'m'}]};return {tools:[],capabilities:{goals:true}};}});return {provider,calls};}
const request=(topic:string,scope=session)=>({uri:`amplifier-capability://native/${topic}`,topic,scope,clientId:'browser'});
const action=(topic:string,operation:string,args:any={},channel=session)=>({channel,topic,operation,version:1,commandId:'command-1',args});
test('lazy records, scoped dedup, copy isolation and invalidation',async()=>{const {provider,calls}=fixture();assert.equal(calls.length,0);const [a,b]=await Promise.all([provider.read(request('configuration')),provider.read(request('configuration'))]);assert.equal(calls.length,1);assert.equal(a.revision,b.revision);a.data.configuration.plan.providers.push('x');assert.deepEqual((await provider.read(request('configuration'))).data.configuration.plan.providers,[]);provider.invalidate(session);const c=await provider.read(request('configuration'));assert.equal(calls.length,2);assert.ok(c.revision>a.revision);await provider.read(request('configuration','ahp-session:/two'));assert.equal(calls.length,3);});
test('authenticated scope and advertised native capability gate mutations',async()=>{const {provider,calls}=fixture();await assert.rejects(provider.action(action('runtime-control','runtime.control',{sessionId:'ahp-session:/other',operation:'goals.set'}),context),/scope/);await assert.rejects(provider.action(action('runtime-control','runtime.control',{operation:'unavailable'}),context),/does not support/);assert.equal(calls.filter(row=>row[1]==='unavailable').length,0);});
test('native results retain runtime selectors and stale reads are replaced',async()=>{const {provider}=fixture();const result=await provider.action(action('runtime-control','runtime.control',{operation:'goals.set',args:{condition:'done'}}),context);assert.equal(result.accepted,true);assert.equal(result.updates[0].data.runtimeControl[session]['goals.get'].goal.condition,'done');assert.equal(result._meta['amplifier.dev/operation'].id,'command-1');const models=await provider.action(action('runtime-control','runtime.control',{operation:'configuration.providerModels',args:{instance:'p'}}),context);assert.equal(models.updates[0].data.runtimeControl[session].modelCatalogs.p.models[0].id,'m');});
test('admin setup and registry use bounded topic leaves and operation receipts',async()=>{const calls:any[]=[];const provider=createNativeCapabilities({nativeControl:async()=>({}),nativeAdmin:async(op,args)=>{calls.push([op,args]);return op==='providers.models'?{modelsProviderId:'p',models:[{id:'m'}],providerMetadata:{module:'provider-p'}}:{modules:[{id:'tool'}]};}});const result=await provider.action(action('provider-catalog','providers.models',{id:'p'}),context);const setup=result.updates.find(u=>u.topic==='provider-catalog')!.data.setup;assert.equal(setup.operations['providers.models:p'].phase,'ready');assert.equal(setup.modelCatalogs.p[0].id,'m');assert.equal(setup.providerCatalogs.p.metadata.module,'provider-p');const registry=await provider.action(action('configuration','modules.list',{}),context);assert.equal(registry.updates.find(u=>u.topic==='configuration')!.data.registry.modules[0].id,'tool');assert.equal(calls.length,2);});
test('unsupported admin is explicit and unadvertised',async()=>{const {provider}=fixture();assert.equal(provider.manifest.actions['providers.save'],undefined);await assert.rejects(provider.read(request('bundles')),/no native bundle catalog/);});
test('mounted provider sign-in uses native public control, standalone account setup uses admin',async()=>{const calls:string[]=[];const provider=createNativeCapabilities({nativeControl:async(_uri,op)=>{calls.push(op);return {phase:'waiting',loginId:'sign-in'};},nativeAdmin:async op=>{calls.push(op);return {providers:[{id:'custom',module:'provider-custom'}]};}});const result=await provider.action(action('provider-catalog','providers.login',{id:'custom'}),context);assert.equal(result.result.login.loginId,'sign-in');assert.deepEqual(calls,['providers.list','configuration.providerLogin']);});

test('action discovery is lazy and forbidden input/control bypasses never dispatch',async()=>{const {provider,calls}=fixture();const schemas=await provider.actionSchemas();assert.equal(calls.length,0);assert.ok(schemas['runtime.control'].schema.properties.operation);assert.equal(schemas['voice.credential'],undefined);for(const operation of ['history.edit','history.revise','steer','steer.submit','schedule.submit','observation.submit','operations.submit','kernels.execute','memory.consolidate','session.relocate'])await assert.rejects(provider.action(action('runtime-control','runtime.control',{operation,args:{}}),context),/generic native controls/);assert.equal(calls.length,0);});
test('admin schema catalog covers only advertised actions',async()=>{const provider=createNativeCapabilities({nativeControl:async()=>({}),nativeAdmin:async()=>({})});const schemas=await provider.actionSchemas();assert.deepEqual(Object.keys(schemas).sort(),Object.keys(provider.manifest.actions).sort());assert.equal(schemas['voice.configure'],undefined);});

test('configuration apply retains native CAS and classifies only explicit conflict as no effect',async()=>{
 const old='a'.repeat(64),current='b'.repeat(64),calls:any[]=[];
 const provider=createNativeCapabilities({nativeControl:async(_scope,op,args)=>{
  calls.push([op,args]);
  if(op==='capabilities')return {controls:['configuration.apply','configuration.inspect']};
  if(op==='configuration.inspect')return {configurationRevision:current,plan:{}};
  if(op==='configuration.providers')return {selection:{model:'fresh'}};
  if(args.expectedConfigurationRevision===old)throw Object.assign(new Error('Review the newer mount plan'),{data:{reason:'configuration-conflict',executed:false,configurationRevision:current}});
  if(args.config.transport)throw Object.assign(new Error('Transport ended'),{data:{outcome:'unknown'}});
  return {remounted:true,configuration:{configurationRevision:current,plan:args.config}};
 }});
 const schemas=await provider.actionSchemas();assert.ok(schemas['configuration.apply'].schema.required.includes('expectedConfigurationRevision'));
 const missing=await provider.action(action('configuration','configuration.apply',{config:{}}),context);
 assert.equal(missing.accepted,false);assert.equal(missing.result.reason,'configuration-revision-required');assert.ok(!calls.some(([op])=>op==='configuration.apply'));
 const conflict=await provider.action(action('configuration','configuration.apply',{config:{},expectedConfigurationRevision:old}),context);
 assert.equal(conflict.accepted,false);assert.equal(conflict.result.executed,false);assert.equal(conflict.result.configurationRevision,current);assert.deepEqual(conflict.invalidate,['configuration']);
 const applied=await provider.action(action('configuration','configuration.apply',{config:{value:1},expectedConfigurationRevision:current}),context);
 assert.equal(applied.accepted,true);assert.equal(applied.updates.find(u=>u.topic==='configuration')!.data.configuration.configurationRevision,current);
 assert.equal(calls.find(([op,args])=>op==='configuration.apply'&&args.config.value===1)[1].expectedConfigurationRevision,current);
 assert.equal(calls.find(([op,args])=>op==='configuration.apply'&&args.config.value===1)[1].commandId,'command-1');
 await assert.rejects(provider.action(action('configuration','configuration.apply',{config:{transport:true},expectedConfigurationRevision:current}),context),/Transport ended/);
});

test('fresh configuration plan and CAS revision supersede prior bundle overlay',async()=>{
 const previous='a'.repeat(64),current='b'.repeat(64);
 const provider=createNativeCapabilities({nativeControl:async(_scope,op)=>{
  if(op==='capabilities')return {controls:['configuration.inspect','bundle.switch']};
  if(op==='bundle.switch')return {bundle:'older',configuration:{configurationRevision:previous,plan:{name:'older'}}};
  return {configurationRevision:current,plan:{name:'current'}};
 }});
 await provider.action(action('bundles','bundle.switch',{bundle:'older'}),context);
 const inspected=await provider.action(action('configuration','configuration.inspect'),context);
 const record=inspected.updates.find(u=>u.topic==='configuration')!.data.configuration;
 assert.equal(record.configurationRevision,current);assert.equal(record.plan.name,'current');
 assert.equal(record.bundlePreview,undefined);
});


test('effective provider is refreshed only for selected confirmed mutations and lost read never claims old truth',async()=>{
 const calls:any[]=[];let model='first',fail=false;
 const provider=createNativeCapabilities({nativeControl:async(scope,op,args)=>{
  calls.push([scope,op,args]);
  if(op==='capabilities')return {controls:['provider.select','provider.reset','configuration.providers']};
  if(op==='provider.select'){model=args.model;return {selection:{model}};}
  if(op==='provider.reset'){model='default';return {selection:null};}
  if(op==='configuration.providers'){if(fail)throw Error('Lost read');return {selection:{model}};}
  return {};
 }});
 const selected=await provider.action(action('runtime-control','runtime.control',{operation:'provider.select',args:{model:'second'}}),context);
 assert.equal(selected.updates[0].data.runtimeControl[session]['configuration.providers'].selection.model,'second');
 fail=true;
 const reset=await provider.action(action('runtime-control','runtime.control',{operation:'provider.reset'}),context);
 assert.equal(reset.accepted,true);assert.deepEqual(reset.updates[0].data.runtimeControl[session]['configuration.providers'],{available:false,reason:'refresh-unavailable'});
 assert.ok(calls.every(row=>row[0]===session));
});

test('task mutations use outer command identity, exact receipts do not replace task projection',async()=>{
 const calls:any[]=[];const provider=createNativeCapabilities({nativeControl:async(_scope,op,args)=>{
  calls.push([op,args]);if(op==='capabilities')return {controls:['task.create','task.pause','task.receipt','task.get']};
  if(op==='task.pause')throw Object.assign(new Error('Stale task revision'),{data:{reason:'task-preflight-refused',executed:false}});
  if(op==='task.receipt')return {available:true,commandId:args.commandId,receipt:{state:'succeeded'}};
  return {task:{id:'task',revision:1,objective:'Preserve',status:'active'},historyCount:0};
 }});
 const created=await provider.action(action('runtime-control','runtime.control',{operation:'task.create',args:{expectedRevision:0,objective:'Preserve'}}),context);
 assert.equal(calls.find(row=>row[0]==='task.create')[1].commandId,'command-1');assert.equal(created.accepted,true);
 const receipt=await provider.action(action('runtime-control','runtime.control',{operation:'task.receipt',args:{commandId:'original-id'}}),context);
 assert.equal(calls.find(row=>row[0]==='task.receipt')[1].commandId,'original-id');assert.equal(receipt.updates[0].data.runtimeControl[session]['task.get'].task.id,'task');
 const refused=await provider.action(action('runtime-control','runtime.control',{operation:'task.pause',args:{expectedRevision:0}}),context);
 assert.equal(refused.accepted,false);assert.equal(refused.result.executed,false);
});


test('settled custom bundle save preserves explicit model choice and original mounted truth',async()=>{
 const calls:any[]=[];let saves=0;
 const provider=createNativeCapabilities({nativeControl:async(scope,op,args)=>{
  calls.push([scope,op,args]);
  if(op==='capabilities')return {controls:['bundle.switch']};
  if(op==='configuration.inspect')return {plan:{providers:[]},bundle:'original'};
  if(op==='configuration.exportResources')return {contexts:[]};
  if(op==='bundle.switch')return args.bundle==='original'
   ?{bundle:'original',configuration:{plan:{name:'original'},configurationRevision:'a'.repeat(64)}}
   :{requiresModelChoice:true,preview:{bundle:'saved',models:['pick-explicitly']}};
  throw Error('Unexpected runtime dispatch '+op);
 },nativeAdmin:async(op,args)=>{
  assert.equal(op,'bundle.save');saves++;assert.equal(args.rootBundle,'original');
  return {saved:{name:'saved'},registeredBundles:{saved:'local:saved'}};
 }});
 await provider.action(action('bundles','bundle.switch',{bundle:'original'}),context);
 const result=await provider.action(action('bundles','bundle.save',{name:'saved',sessionId:session}),context);
 assert.equal(result.accepted,true);assert.equal(result.result.saved.name,'saved');
 assert.equal(result.result.activation.requiresModelChoice,true);
 const configuration=result.updates.find(u=>u.topic==='configuration')!.data.configuration;
 assert.equal(configuration.bundle,'original');assert.equal(configuration.plan.name,'original');
 assert.equal(configuration.bundleChange.phase,'needs-model');assert.equal(configuration.bundlePreview.bundle,'saved');
 assert.equal(saves,1);assert.equal(calls.filter(row=>row[1]==='bundle.switch'&&row[2].bundle==='saved').length,1);
 assert.equal(result._meta['amplifier.dev/operation'].id,'command-1');
});

for(const outcome of ['refused','unknown'] as const)test('settled bundle save remains completed after '+outcome+' activation without replay',async()=>{
 let saves=0,switches=0;const provider=createNativeCapabilities({nativeControl:async(_scope,op)=>{
  if(op==='configuration.inspect')return {plan:{providers:[]},bundle:'original'};
  if(op==='configuration.exportResources')return {};
  if(op==='bundle.switch'){switches++;throw outcome==='refused'
   ?Object.assign(Error('Not admitted'),{data:{executed:false,reason:'native-busy'}})
   :Error('Reply lost after switch');}
  if(op==='configuration.providers')return {selection:{model:'observed-after-loss'}};
  throw Error(op);
 },nativeAdmin:async()=>{saves++;return {saved:{name:'saved'}};}});
 const result=await provider.action(action('bundles','bundle.save',{name:'saved',sessionId:session}),context);
 assert.equal(result.accepted,true);assert.equal(result.result.saved.name,'saved');
 assert.equal(result.result.activation.state,outcome==='refused'?'failed':'unknown');
 assert.equal(result.result.activation.executed,outcome==='refused'?false:undefined);
 assert.equal(result.updates.find(u=>u.topic==='configuration')!.data.configuration.bundleChange.phase,outcome==='refused'?'error':'unknown');
 assert.equal(saves,1);assert.equal(switches,1);
});

test('generic tool authority always comes from authenticated user or agent context',async()=>{
 const actors:string[]=[];const provider=createNativeCapabilities({nativeControl:async(_scope:string,operation:string,args:any)=>{
  if(operation==='capabilities')return {controls:['tool.invoke']};
  assert.equal(operation,'tool.invoke');actors.push(args.actor);return {success:true};
 }});
 for(const origin of ['ui','agent'] as const)await provider.action(action('runtime-control','runtime.control',{operation:'tool.invoke',args:{name:'fixture',arguments:{},actor:origin==='ui'?'agent':'ui'}}),{...context,origin});
 assert.deepEqual(actors,['ui','agent']);
});

const bundleMetadata={version:1,commandId:'optional-legacy-required-for-receipt',adminOperations:['bundle.default','bundle.export','bundle.save'],activation:'bundle.switch',adminReceipt:'bundle.receipt',activationReceipt:'_amplifier/bundle/receipt',passiveReceipt:true,maxResultBytes:524288,replayUnknown:false};
test('negotiated bundle children remain independently inspectable after activation reply loss and provider reconstruction',async()=>{
 const stored=new Map<string,any>(),effects:string[]=[],queries:string[]=[];
 const nativeAdmin=async(op:string,args:any)=>{
  if(op==='bundle.receipt'){queries.push(args.commandId);return {receipt:stored.get(args.commandId)??null};}
  assert.equal(op,'bundle.save');effects.push(op);
  const result={saved:{name:'exact'},export:{content:'original bytes'}};
  stored.set(args.commandId,{version:1,commandId:args.commandId,operation:op,status:'succeeded',createdAt:1,completedAt:2,replayed:false,result});return result;
 };
 const nativeBundleReceipt=async(_scope:string,id:string)=>{queries.push(id);return {receipt:stored.get(id)??null};};
 const options={nativeAdmin,nativeBundleReceipt,nativeBundleCommands:async()=>bundleMetadata,nativeControl:async(_scope:string,op:string,args:any)=>{
  if(op==='configuration.inspect')return {plan:{},bundle:'original'};if(op==='configuration.exportResources')return {};
  assert.equal(op,'bundle.switch');effects.push(op);stored.set(args.commandId,{version:1,commandId:args.commandId,operation:op,status:'succeeded',createdAt:2,completedAt:3,replayed:false,result:{bundle:'exact',applied:true}});throw Error('Activation reply lost');
 }};
 const first=createNativeCapabilities(options);assert.equal(first.manifest.actions['bundle.receipt'],undefined);
 await first.negotiateBundleCommands();assert.ok(first.manifest.actions['bundle.receipt']);
 const saved=await first.action(action('bundles','bundle.save',{name:'exact'}),context);assert.equal(saved.result.activation.state,'unknown');
 const replacement=createNativeCapabilities({...options,nativeControl:async()=>{throw Error('Receipt must not start active runtime');}});
 const recovered=await replacement.action(action('bundles','bundle.receipt',{operation:'bundle.save',commandId:'command-1'}),context);
 assert.equal(recovered.result.receipts.command.result.export.content,'original bytes');assert.equal(recovered.result.receipts.activation.result.applied,true);
 assert.notEqual(queries[0],queries[1]);assert.deepEqual(effects,['bundle.save','bundle.switch']);assert.deepEqual(recovered.updates,[]);assert.deepEqual(recovered.invalidate,[]);
});
test('older peers and unconfigured passive transport cannot advertise recovery; mismatched native receipt fails closed',async()=>{
 for(const metadata of [undefined,{...bundleMetadata,replayUnknown:true}]){
  const p=createNativeCapabilities({nativeAdmin:async()=>({}),nativeControl:async()=>{throw Error('No active runtime');},nativeBundleCommands:async()=>metadata,nativeBundleReceipt:async()=>({receipt:null})});
  await p.negotiateBundleCommands();assert.equal(p.manifest.actions['bundle.receipt'],undefined);
  await assert.rejects(p.action(action('bundles','bundle.receipt',{operation:'bundle.save',commandId:'original'}),context),/not advertised/);
 }
 const noPassive=createNativeCapabilities({nativeAdmin:async()=>({}),nativeControl:async()=>({}),nativeBundleCommands:async()=>bundleMetadata});await noPassive.negotiateBundleCommands();assert.equal(noPassive.manifest.actions['bundle.receipt'],undefined);
 const wrong=createNativeCapabilities({nativeAdmin:async()=>({receipt:{version:1,commandId:'foreign',operation:'bundle.save',status:'succeeded',replayed:false,result:{}}}),nativeControl:async()=>{throw Error('No active runtime');},nativeBundleCommands:async()=>bundleMetadata,nativeBundleReceipt:async()=>({receipt:null})});
 await assert.rejects(wrong.action(action('bundles','bundle.receipt',{operation:'bundle.save',commandId:'original'}),context),/exact child/);
});
test('passive receipt recovery retains native refusal, unknown and needs-model without inferred completion or activation',async()=>{
 for(const status of ['refused','unknown','needs-model'] as const){
  const provider=createNativeCapabilities({nativeBundleCommands:async()=>bundleMetadata,nativeControl:async()=>{throw Error('Recovery cannot dispatch');},nativeAdmin:async(_op:string,args:any)=>({receipt:{version:1,commandId:args.commandId,operation:'bundle.save',status:'succeeded',createdAt:1,completedAt:2,replayed:false,result:{saved:{name:'original'}}}}),nativeBundleReceipt:async(_scope:string,id:string)=>({receipt:{version:1,commandId:id,operation:'bundle.switch',status:status==='needs-model'?'succeeded':status,createdAt:2,replayed:false,...(status==='unknown'?{}:status==='refused'?{completedAt:3,executed:false,reason:'bundle-preflight-refused'}:{completedAt:3,result:{requiresModelChoice:true,applied:false,preview:{exact:true}}})}})});
  const recovered=await provider.action(action('bundles','bundle.receipt',{operation:'bundle.save',commandId:'original'}),context);
  const activation=recovered.result.receipts.activation;
  assert.equal(activation.status,status==='needs-model'?'succeeded':status);assert.equal(activation.replayed,false);
  if(status==='needs-model')assert.equal(activation.result.applied,false);else assert.equal(activation.result,undefined);
  assert.deepEqual(recovered.updates,[]);assert.deepEqual(recovered.invalidate,[]);
 }
});
