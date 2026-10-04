import test from 'node:test';import assert from 'node:assert/strict';
const {createNativeCapabilities}=await import(process.env.AMPLIFIER_NATIVE_CAPABILITY_MODULE??'../src/index.js');
const marker={version:1,workspaceBound:true,scopedAttempts:true},loginId='a'.repeat(32);
const request=(op:string,args:any,channel='host')=>({version:1,channel,topic:'provider-catalog',operation:op,args,commandId:'owned-signin-'+op});

test('closed peer proof controls selector advertisement and refuses old or malformed peers before dispatch',async()=>{
 for(const m of [undefined,{},true,{...marker,version:true},{...marker,workspaceBound:1},{...marker,scopedAttempts:1},{...marker,extra:true}]){
  for(const origin of ['ui','agent']as const){let effects=0;
   const p=createNativeCapabilities({nativeProviderSignIn:async()=>m as any,nativeAdmin:async()=>{effects++;return {};},nativeControl:async()=>{effects++;return {};}});
   const schemas=await p.actionSchemas();
   for(const op of ['providers.loginStatus','providers.loginCancel']){
    assert.equal(schemas[op].schema.properties.scope,undefined);assert.equal(schemas[op].schema.properties.loginId,undefined);
    await assert.rejects(p.action(request(op,{id:'original',scope:'local',loginId}),{clientId:'owned',origin}),(e:any)=>e.data.executed===false&&e.data.reason==='provider-signin-selectors-unavailable');
   }
   assert.equal(effects,0);
  }
 }
});

test('negotiated user and agent admin actions preserve exact original selectors and command identity',async()=>{
 for(const origin of ['ui','agent']as const)for(const op of ['providers.loginStatus','providers.loginCancel']){
  const calls:any[]=[];const args={id:'original',scope:'local',loginId};
  const p=createNativeCapabilities({nativeProviderSignIn:async()=>marker,nativeControl:async()=>{throw Error('No resident route');},nativeAdmin:async(operation,values,context)=>{calls.push({operation,values,origin:context.origin});return {providerId:'original',login:{providerId:'original',scope:'local',loginId,status:op.endsWith('Cancel')?'cancelled':'waiting'}};}});
  const schemas=await p.actionSchemas();assert.ok(schemas[op].schema.properties.scope);assert.ok(schemas[op].schema.properties.loginId);
  const r=await p.action(request(op,args),{clientId:'owned',origin});assert.equal(r.accepted,true);assert.equal(r._meta['amplifier.dev/operation'].id,'owned-signin-'+op);
  assert.deepEqual(calls,[{operation:op,values:args,origin}]);assert.equal(r.result.login.loginId,loginId);
 }
});

test('explicit selectors cannot be dropped into a resident provider route and legacy controls still use it',async()=>{
 for(const origin of ['ui','agent']as const){const scope='ahp-session:/owned';let effects=0;const adminCalls:string[]=[];
  const p=createNativeCapabilities({nativeProviderSignIn:async()=>marker,nativeAdmin:async(op)=>{adminCalls.push(op);return {providers:[{id:'resident',module:'provider-anthropic'}]};},nativeControl:async()=>{effects++;return {status:'waiting'};}});
  const context={clientId:'owned',origin,session:{uri:scope}};
  await assert.rejects(p.action(request('providers.loginCancel',{id:'resident',scope:'local',loginId},scope),context),(e:any)=>e.data.executed===false);
  assert.equal(effects,0);assert.deepEqual(adminCalls,['providers.list']);
  assert.equal((await p.action(request('providers.loginCancel',{id:'resident'},scope),context)).accepted,true);assert.equal(effects,1);
 }
});

test('invalid scope or attempt never reaches a verified admin peer',async()=>{
 let effects=0;const p=createNativeCapabilities({nativeProviderSignIn:async()=>marker,nativeAdmin:async()=>{effects++;return {};},nativeControl:async()=>({})});
 for(const args of [{scope:'session'},{scope:1},{loginId:'old'},{loginId:true},{loginId:'A'.repeat(32)}])await assert.rejects(p.action(request('providers.loginCancel',{id:'original',...args}),{clientId:'owned'}),(e:any)=>e.data.executed===false);
 assert.equal(effects,0);
});

test('public provider resource closes availability after native and result overlays',async()=>{
 for(const available of [false,true]){
  const p=createNativeCapabilities({nativeProviderSignIn:async()=>available?marker:undefined,nativeAdmin:async()=>({providerSignIn:{available:!available,evil:true}}),nativeControl:async()=>({})});
  const expected={version:1,available,route:'administration',provider:'provider-openai-chatgpt',selectors:available?['sessionId','scope','loginId']:[]};
  const read=()=>p.read({uri:'amplifier-capability://native/provider-catalog',topic:'provider-catalog',scope:'ahp-root://',clientId:'owned'});
  assert.deepEqual((await read()).data.setup.providerSignIn,expected);
  const r=await p.action(request('providers.list',{}),{clientId:'owned'});
  assert.deepEqual(r.updates.find((u:any)=>u.topic==='provider-catalog')?.data.setup.providerSignIn,expected);
  assert.deepEqual((await read()).data.setup.providerSignIn,expected);
 }
});

test('original channel selector is presence-checked, requires attempt binding and is stripped before dispatch',async()=>{
 for(const origin of ['ui','agent']as const){
  let effects=0;const calls:any[]=[];
  const p=createNativeCapabilities({nativeProviderSignIn:async()=>marker,nativeAdmin:async(op,args)=>{effects++;calls.push({op,args});return {};},nativeControl:async()=>{effects++;return {};}});
  for(const sessionId of [undefined,null,'',false,'ahp-session:/other'])await assert.rejects(p.action(request('providers.loginCancel',{id:'original',sessionId,scope:'local',loginId}),{clientId:'owned',origin}));
  await assert.rejects(p.action(request('providers.loginCancel',{id:'original',sessionId:'ahp-root://'}),{clientId:'owned',origin}));
  await assert.rejects(p.action(request('providers.loginCancel',{id:'original',sessionId:'host',scope:'local',loginId},'ahp-root://'),{clientId:'owned',origin}));
  assert.equal(effects,0);
  const r=await p.action(request('providers.loginCancel',{id:'original',sessionId:'ahp-root://',scope:'local',loginId},'ahp-root://'),{clientId:'owned',origin});
  assert.equal(r.accepted,true);assert.deepEqual(calls,[{op:'providers.loginCancel',args:{id:'original',scope:'local',loginId}}]);
  const old=createNativeCapabilities({nativeAdmin:async()=>{effects++;return {};},nativeControl:async()=>({})});
  await assert.rejects(old.action(request('providers.loginCancel',{id:'original',sessionId:'ahp-root://',scope:'local',loginId}),{clientId:'owned',origin}),(e:any)=>e.data.executed===false);
  assert.equal(effects,1);assert.equal((await old.actionSchemas())['providers.loginCancel'].schema.properties.sessionId,undefined);
 }
});
