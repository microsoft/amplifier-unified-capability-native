import test from 'node:test';
import assert from 'node:assert/strict';
import {bundleCommandIds} from '../src/bundle-commands.js';
test('bundle child identities survive reconstruction and distinguish authority, effect and original operation',()=>{
 const id=bundleCommandIds('ahp-session:/owned','bundle.save','outer-command');
 assert.deepEqual(bundleCommandIds('ahp-session:/owned','bundle.save','outer-command'),id);
 assert.notEqual(id.commandId,id.activationCommandId);assert.ok(id.commandId.length<200);
 const different=[bundleCommandIds('ahp-session:/foreign','bundle.save','outer-command'),bundleCommandIds('ahp-session:/owned','bundle.save','another-command'),bundleCommandIds('ahp-session:/owned','bundle.switch','outer-command')];
 for(const row of different)assert.notEqual(row.commandId,id.commandId);
 assert.equal(bundleCommandIds('host','bundle.save','outer-command').activationCommandId,undefined);
 assert.throws(()=>bundleCommandIds('host','bundle.save','x'.repeat(257)),/Bounded/);
});
