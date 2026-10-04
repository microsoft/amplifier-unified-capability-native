import test from 'node:test';import assert from 'node:assert/strict';
const {createNativeCapabilities}=await import(process.env.AMPLIFIER_NATIVE_CAPABILITY_MODULE??'../src/index.js');
const scope='ahp-session:/owned-refusal',context={clientId:'owned',session:{uri:scope,workingDirectory:'/owned'}};
const request=(op:string,id:string)=>({channel:scope,topic:op.startsWith('bundle.')?'bundles':'runtime-control',operation:op.startsWith('bundle.')?op:'runtime.control',args:op.startsWith('bundle.')?{bundle:'refused'}:{operation:op,args:{instance:'refused',model:'fixture-model'}},commandId:id,version:1});
test('explicit bundle and provider no-effect refusals remain rejected capability results with original proof and command',async()=>{
 for(const op of ['bundle.switch','bundle.save','bundle.export','bundle.default','provider.select','provider.reset']){
  const calls:string[]=[],data={executed:false,replayed:false,reason:'native-fixture-refusal',commandId:'native-child',detail:{preflight:true}},error=Object.assign(Error('No change was made'),{data});
  const provider=createNativeCapabilities({nativeControl:async(_scope:string,operation:string)=>{calls.push(operation);if(operation==='capabilities')return {controls:[op]};if(operation==='configuration.inspect')return {plan:{},bundle:'fixture'};if(operation==='configuration.exportResources')return {};throw error;},nativeAdmin:async(operation:string)=>{calls.push(operation);throw error;}});
  const result=await provider.action(request(op,'outer-'+op),context);assert.equal(result.accepted,false);assert.deepEqual(result.result,{applied:false,...data,message:'No change was made'});assert.equal(result._meta['amplifier.dev/operation'].id,'outer-'+op);assert.deepEqual(result.updates,[]);assert.deepEqual(result.invalidate,[]);assert.equal(calls.filter(operation=>operation===op).length,1);assert.ok(!calls.includes('configuration.providers'));
 }
});
test('unknown transport generic errors and contradictory proof never become definite refusal or trigger replay',async()=>{
 for(const data of [undefined,{outcome:'unknown',replayed:false},{executed:false,outcome:'unknown'},{executed:false,applied:true}]){
  let effects=0;const error=Object.assign(Error('Original uncertain transport'),{data}),provider=createNativeCapabilities({nativeControl:async(_scope:string,op:string)=>{if(op==='capabilities')return {controls:['bundle.switch']};effects++;throw error;}});
  await assert.rejects(provider.action(request('bundle.switch','original-unknown'),context),(value:any)=>value===error);assert.equal(effects,1);
 }
});
test('successful model result survives selected catalog refresh failure unchanged without resending selection',async()=>{
 const calls:string[]=[],native={selection:{instance:'fixture',model:'alternate',effort:'low'},scope:'main session'};
 const provider=createNativeCapabilities({nativeControl:async(_scope:string,op:string,args:any)=>{calls.push(op);if(op==='capabilities')return {controls:['provider.select']};if(op==='provider.select'){assert.deepEqual(args,{instance:'refused',model:'fixture-model'});return structuredClone(native);}throw Error('Catalog read unavailable');}});
 const result=await provider.action(request('provider.select','original-selection'),context);assert.equal(result.accepted,true);assert.deepEqual(result.result,native);assert.equal(result._meta['amplifier.dev/operation'].id,'original-selection');assert.equal(calls.filter(op=>op==='provider.select').length,1);assert.deepEqual(result.updates[0].data.runtimeControl[scope]['configuration.providers'],{available:false,reason:'refresh-unavailable'});
});
