import test from 'node:test';
import assert from 'node:assert/strict';
import {AdminConnection} from '../src/index.js';

test('storage discovery omits older peers and stays passive under held intake',async()=>{
 const admin=new AdminConnection({command:'/must/not/start',cwd:'/owned',resolveWorkspace:()=>'/owned'}),calls:any[]=[];
 const internal=admin as any;internal.start=async()=>{};
 internal.rpc=async(method:string,args:any)=>{calls.push([method,args]);return {version:1,roots:[]};};
 assert.equal(await admin.storageRoots({clientId:'settings'}),undefined);
 await assert.rejects(admin.perform('storage.roots',{}, {clientId:'settings'}),/unavailable/);
 assert.equal(calls.length,0);
 internal.storageRootsSupported=true;internal.held={phase:'held'};
 assert.deepEqual(await admin.storageRoots({clientId:'settings'}),{version:1,roots:[]});
 assert.deepEqual(calls,[['_amplifier/admin',{cwd:'/owned',operation:'storage.roots',args:{}}]]);
 assert.equal(internal.calls,0);
});
