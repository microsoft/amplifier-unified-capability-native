import test from 'node:test';
import assert from 'node:assert/strict';
import {AdminConnection,MessageConnection} from '../src/index.js';

// A missing optional peer must reject its handshake without writing to a failed
// subprocess. node:test also detects stray EPIPE exceptions/rejections.
test('missing optional peers reject before ACP writes and cannot replay a launch',async()=>{
 const base={command:'/impossible/native-capability-peer',cwd:process.cwd()};
 const admin=new AdminConnection({...base,resolveWorkspace:()=>process.cwd()});
 const messages=new MessageConnection({...base,account:'owned-startup-test',resolveSession:async()=>{throw Error('No session may be resolved during passive discovery');}});
 try{
  await assert.rejects(admin.maintenanceCapabilities(),{code:'ENOENT'});
  await assert.rejects(messages.capabilities(),{code:'ENOENT'});
  await assert.rejects(admin.maintenanceCapabilities(),/closed/);
  await assert.rejects(messages.capabilities(),/closed/);
 }finally{await admin.close();await messages.close();}
});
