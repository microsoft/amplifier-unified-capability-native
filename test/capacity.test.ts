import test from 'node:test';import assert from 'node:assert/strict';
import {createNativeCapabilities} from '../src/index.js';
const session='ahp-session:/fixture',marker={version:1,passivePolicy:true,admission:'native-owner-snapshot'};
const req=(operation:string,args:any={},commandId='same')=>({version:1,channel:session,topic:'runtime-control',operation,args,commandId});
const context={clientId:'browser',session:{uri:session},origin:'ui' as const};
test('capacity only advertises the negotiated passive policy and actual Host accounting port',async()=>{
 for(const value of [undefined,{},true,{...marker,version:true},{...marker,passivePolicy:false}]){
  let calls=0;const owner=createNativeCapabilities({nativeControl:async()=>{calls++;return {};},nativeCapacity:async()=>value as any,readCapacity:async()=>{calls++;return {};}});
  assert.equal((await owner.actionSchemas())['capacity.read'],undefined);await assert.rejects(owner.action(req('capacity.read'),context));assert.equal(calls,0);
 }
 const owner=createNativeCapabilities({nativeControl:async()=>({}),nativeCapacity:async()=>marker});assert.equal((await owner.actionSchemas())['capacity.set'],undefined);
});
test('UI and agent use the same bounded passive view and owner mutation; runtime wrapper cannot bypass it',async()=>{
 for(const origin of ['ui','agent'] as const){
  const writes:any[]=[],reads:any[]=[];
  const owner=createNativeCapabilities({nativeCapacity:async()=>marker,nativeControl:async(session,operation,args)=>{writes.push({session,operation,args});return {revision:1};},readCapacity:async(session,args)=>{reads.push({session,args});return {budget:{revision:1},usage:{calls:0}};}});
  const schemas=await owner.actionSchemas();assert.equal(schemas['capacity.read'].schema.properties.limit.maximum,500);
  await owner.action(req('capacity.read',{sessionId:session,offset:100,limit:5}),{...context,origin});assert.equal(writes.length,0);assert.deepEqual(reads[0],{session,args:{offset:100,limit:5}});
  await owner.action(req('capacity.set',{sessionId:session,expectedRevision:0,enabled:true,maxTotalTokens:100},'edit'),{...context,origin});assert.deepEqual(writes[0],{session,operation:'capacity.set',args:{expectedRevision:0,enabled:true,maxTotalTokens:100,commandId:'edit',origin}});
  await assert.rejects(owner.action(req('runtime.control',{operation:'capacity.set',args:{enabled:false}}),{...context,origin}),/cannot bypass/);
  await assert.rejects(owner.action(req('capacity.read',{sessionId:'ahp-session:/other'}),context),/selector disagrees/);
  await assert.rejects(owner.action(req('capacity.read',{usage:{calls:0}}),context),/Unknown/);
 }
});
test('successful budget write remains acknowledged when receipt refresh fails',async()=>{
 let writes=0;const owner=createNativeCapabilities({nativeCapacity:async()=>marker,nativeControl:async()=>{writes++;return {revision:2,enabled:true};},readCapacity:async()=>{throw Error('cold read unavailable');}});
 const value=await owner.action(req('capacity.set',{expectedRevision:1,enabled:true,maxTotalTokens:100}),context);
 assert.equal(value.accepted,true);assert.equal(value.result.applied,true);assert.equal(value.result.refreshUnavailable,true);assert.equal(value.result.budget.revision,2);assert.equal(writes,1);
});
