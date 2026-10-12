import test from 'node:test';import assert from 'node:assert/strict';
import {AdminConnection} from '../src/index.js';
const marker={version:1,method:'_amplifier/naming',passiveMetadata:true,commandIds:true,replayUnknown:false};
function fixture(){const admin=new AdminConnection({command:'/must/not/start',cwd:'/owned',resolveWorkspace:()=>'/owned'}),calls:any[]=[];const internal=admin as any;internal.start=async()=>{};internal.namingMetadata=marker;internal.rpc=async(method:string,input:any)=>{calls.push([method,input]);return {title:'Canonical'};};return {admin,internal,calls};}
test('passive naming captures trusted selectors before initialization and returns detached actual metadata',async()=>{
 const {admin,internal,calls}=fixture();let ready!:()=>void;internal.start=()=>new Promise<void>(r=>ready=r);
 const input={sessionId:'selected',cwd:'/owned',operation:'rename' as const,args:{commandId:'original',title:'Original'}};
 const pending=admin.performNaming(input);input.sessionId='foreign';input.args.title='Foreign';ready();await pending;
 assert.deepEqual(calls,[['_amplifier/naming',{sessionId:'selected',cwd:'/owned',operation:'rename',args:{commandId:'original',title:'Original'}}]]);assert.equal(internal.calls,0);
 internal.start=async()=>{};const first=await admin.namingCapabilities();first!.version=99;assert.equal((await admin.namingCapabilities())!.version,1);
});
test('held intake refuses naming writes and permits passive read/receipt on the same owner',async()=>{
 const {admin,internal,calls}=fixture();internal.held={phase:'held'};
 for(const operation of ['rename','policy','commit'] as const)await assert.rejects(admin.performNaming({sessionId:'selected',cwd:'/owned',operation,args:{}}),/intake is held/);
 assert.equal(calls.length,0);for(const operation of ['read','receipt'] as const)await admin.performNaming({sessionId:'selected',cwd:'/owned',operation,args:{}});assert.equal(calls.length,2);assert.equal(internal.calls,0);
});
test('malformed selectors and absent or misadvertised actual marker never dispatch naming',async()=>{
 const {admin,internal,calls}=fixture();for(const input of [{sessionId:'selected',cwd:'relative',operation:'read',args:{}},{sessionId:'selected',cwd:'/owned',operation:'read',args:{},home:'/spoof'},{sessionId:'selected',cwd:'/owned',operation:'generate',args:{}}])await assert.rejects(admin.performNaming(input as any));
 for(const metadata of [undefined,{...marker,replayUnknown:true}]){internal.namingMetadata=metadata;assert.equal(await admin.namingCapabilities(),undefined);await assert.rejects(admin.performNaming({sessionId:'selected',cwd:'/owned',operation:'read',args:{}}),/unavailable/);}assert.equal(calls.length,0);
});

test('cold backfill requires exact peer support and remains tracked until settled',async()=>{
 const {admin,internal,calls}=fixture(),input={sessionId:'selected',cwd:'/owned',operation:'backfill' as const,args:{}};
 await assert.rejects(admin.performNaming(input),/Cold naming is unavailable/);assert.equal(calls.length,0);
 internal.namingMetadata={...marker,backfill:{version:1,cold:true,boundedExcerpt:true,durableAttempts:true}};
 let finish!:()=>void;internal.rpc=()=>new Promise<void>(resolve=>finish=resolve);
 const pending=admin.performNaming(input);await new Promise(r=>setImmediate(r));assert.equal(internal.calls,1);finish();await pending;assert.equal(internal.calls,0);
 internal.held={phase:'held'};await assert.rejects(admin.performNaming(input),/intake is held/);
});
