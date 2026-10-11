import test from 'node:test';import assert from 'node:assert/strict';
const {createNativeCapabilities}=await import(process.env.AMPLIFIER_NATIVE_CAPABILITY_MODULE??'../src/index.js');
const marker={version:1,catalog:'provider-image-models',preservesChat:true,exclusive:true};
const request=(op:string,args:any={id:'one'},channel='host')=>({version:1,channel,topic:'provider-catalog',operation:op,args,commandId:'image-'+op});
test('only exact peer evidence advertises image setup and older peers dispatch nothing',async()=>{
 for(const value of [undefined,{},true,{...marker,version:true},{...marker,exclusive:1},{...marker,extra:true}]){
  let effects=0;const owner=createNativeCapabilities({nativeImageSetup:async()=>value as any,nativeAdmin:async()=>{effects++;return {};},nativeControl:async()=>{throw Error('No resident dispatch');}});
  const schemas=await owner.actionSchemas();
  for(const op of ['providers.imageModels','providers.configureImages']){
   assert.equal(schemas[op],undefined);
   await assert.rejects(owner.action(request(op),{clientId:'browser'}),(e:any)=>e.data?.executed===false);
  }
  assert.equal(effects,0);
 }
});
test('image catalog is independent of chat catalog and user and agent share the same owner',async()=>{
 for(const origin of ['ui','agent']as const){
  const effects:any[]=[];const owner=createNativeCapabilities({nativeImageSetup:async()=>marker,nativeAdmin:async(op,args,context)=>{
   effects.push([op,args,context.origin]);
   if(op==='providers.models')return {modelsProviderId:args.id,models:[{id:'chat'}]};
   if(op==='providers.imageModels')return {imageModelsProviderId:args.id,imageModels:[{id:'image'}],imageModelsSupported:true,providerMetadata:{module:'fixture',imageGeneration:{schemaVersion:1,configKey:'image_generation'}}};
   return {imageSetupCompletion:{id:args.id,enabled:true,takesEffect:'new_sessions'}};
  },nativeControl:async()=>{throw Error('Images must not remount a conversation');}});
  assert.ok((await owner.actionSchemas())['providers.configureImages']);
  await owner.action(request('providers.models'),{clientId:'browser',origin});
  const result=await owner.action(request('providers.imageModels'),{clientId:'browser',origin});
  assert.deepEqual(result.invalidate,[]);
  const setup=result.updates.find((row:any)=>row.topic==='provider-catalog')!.data.setup;
  assert.deepEqual(setup.providerCatalogs.one.models,[{id:'chat'}]);assert.deepEqual(setup.imageCatalogs.one.models,[{id:'image'}]);assert.equal(setup.imageCatalogs.one.supported,true);
  const args={id:'one',model:'image',enabled:true,exclusive:true,scope:'local'};
  const saved=await owner.action(request('providers.configureImages',args),{clientId:'browser',origin});
  assert.equal(saved.result.imageSetupCompletion.takesEffect,'new_sessions');
  assert.deepEqual(effects.at(-1),['providers.configureImages',args,origin]);
 }
});

test('a slow image catalog cannot become shared truth after a configuration write',async()=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 const owner=createNativeCapabilities({nativeImageSetup:async()=>marker,nativeAdmin:async(op,args)=>{
  if(op==='providers.imageModels'){await gate;return {imageModelsProviderId:args.id,imageModels:[{id:'old'}],imageModelsSupported:true};}
  return {configurationChanged:true};
 },nativeControl:async()=>({})});
 const reading=owner.action(request('providers.imageModels'),{clientId:'browser'});
 await new Promise(resolve=>setTimeout(resolve,0));
 await owner.action(request('providers.configureImages',{id:'one',enabled:false}),{clientId:'browser'});
 release();const result=await reading;
 assert.deepEqual(result.updates,[]);assert.deepEqual(result.invalidate,['provider-catalog']);
});

test('installed administration peers negotiate image setup without creating a worker',{skip:!process.env.AMPLIFIER_ACP_PYTHON||!process.env.AMPLIFIER_IMAGE_OLD_PYTHON},async()=>{
 const {mkdtemp,mkdir,writeFile,stat,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {AdminConnection}=await import(process.env.AMPLIFIER_NATIVE_CAPABILITY_MODULE??'../src/index.js');
 for(const [python,available] of [[process.env.AMPLIFIER_ACP_PYTHON,true],[process.env.AMPLIFIER_IMAGE_OLD_PYTHON,false]]as const){
  const root=await mkdtemp(join(tmpdir(),'image-admin-')),workspace=join(root,'workspace'),home=join(root,'home'),config=join(root,'native.json');await mkdir(workspace);await mkdir(home);
  await writeFile(config,JSON.stringify({home,appHome:join(root,'app'),runtimeImmutable:true,adminWorkspaceRoots:[workspace],workerCommand:['/impossible/no-worker']}));
  const admin=new AdminConnection({command:python!,args:['-I','-B','-m','amplifier_acp','--config',config],cwd:workspace,resolveWorkspace:()=>workspace,env:{PYTHONDONTWRITEBYTECODE:'1',AMPLIFIER_RUNTIME_IMMUTABLE:'1'}});
  try{assert.deepEqual(await admin.imageSetupCapabilities(),available?{...marker,preferences}:undefined);
   if(available)for(const mode of ['automatic','off']){
    const result=await admin.perform('providers.configureImages',{mode,scope:'global'},{clientId:'test'});
    assert.equal(result.imagePreference,mode);
   }
   if(!available)await assert.rejects(admin.perform('providers.configureImages',{id:'one',enabled:false},{clientId:'test'}),(e:any)=>e.data?.executed===false&&e.data?.replayed===false);
   await assert.rejects(stat(join(home,'projects')));
  }finally{await admin.close();await rm(root,{recursive:true,force:true});}
 }
});

const preferences={version:1,modes:['automatic','selected','off'],application:'new-sessions'};
test('automatic image selection is optional and user/agent writes retain the native scope',async()=>{
 for(const origin of ['ui','agent']as const){
  const effects:any[]=[];
  const owner=createNativeCapabilities({nativeImageSetup:async()=>({...marker,preferences}),nativeAdmin:async(op,args,context)=>{
   effects.push([op,args,context.origin]);return {imagePreference:args.mode,configurationChanged:true};
  },nativeControl:async()=>{throw Error('No image runtime dispatch');}});
  const schema=(await owner.actionSchemas())['providers.configureImages'].schema;
  assert.deepEqual(schema.properties.mode.enum,['automatic','off']);assert.equal(schema.required,undefined);
  for(const mode of ['automatic','off']){
   const result=await owner.action({...request('providers.configureImages',{mode,scope:'local'}),commandId:mode},{clientId:'test',origin});
   assert.deepEqual(effects.at(-1),['providers.configureImages',{mode,scope:'local'},origin]);
   assert.equal(result.result.imagePreference,mode);
   assert.equal(result.updates.find((r:any)=>r.topic==='provider-catalog')?.data.setup.imagePreferences.available,true);
  }
 }
});
test('older image peers retain selected controls and refuse automatic preferences before dispatch',async()=>{
 let effects=0;
 const owner=createNativeCapabilities({nativeImageSetup:async()=>marker,nativeAdmin:async()=>{effects++;return{};},nativeControl:async()=>({})});
 const schema=(await owner.actionSchemas())['providers.configureImages'].schema;
 assert.equal(schema.properties.mode,undefined);assert.deepEqual(schema.required,['id','enabled']);
 await assert.rejects(owner.action(request('providers.configureImages',{mode:'automatic'}),{clientId:'test'}),(e:any)=>e.data?.executed===false);
 assert.equal(effects,0);
 await owner.action(request('providers.configureImages',{id:'one',enabled:false}),{clientId:'test'});
 assert.equal(effects,1);
});
