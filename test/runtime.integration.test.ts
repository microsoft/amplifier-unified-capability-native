import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile,chmod,readdir} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {spawn,spawnSync} from 'node:child_process';import {Readable,Writable} from 'node:stream';
import {ClientSideConnection,ndJsonStream} from '@agentclientprotocol/sdk';
const {createNativeCapabilities,AdminConnection}=await import(process.env.AMPLIFIER_NATIVE_CAPABILITY_MODULE??'../src/index.js');
const python=process.env.AMPLIFIER_ACP_PYTHON;
const setup=String.raw`
import importlib.util,json,sys
from pathlib import Path
p=Path(sys.argv[1]);home=p/'home';home.mkdir()
modules={n:Path(importlib.util.find_spec('amplifier_module_'+n.replace('-','_')).origin).parent for n in ['context-simple','provider-fixture']}
plan='bundle:\n  name: bridge-runtime-fixture\n  version: 1.0.0\nsession:\n  orchestrator:\n    module: loop-live\n  context:\n    module: context-simple\n    source: '+json.dumps(str(modules['context-simple']))+'\nproviders:\n  - module: provider-fixture\n    source: '+json.dumps(str(modules['provider-fixture']))+'\n'
if sys.argv[2]=='portable':
    plan=json.dumps({'bundle':{'name':'bridge-runtime-fixture','version':'1.0.0+amplifier-unified.snapshot.1'},'session':{'orchestrator':{'module':'loop-live'},'context':{'module':'context-simple'}},'providers':[{'module':'provider-fixture','config':{'fixtureModels':[{'id':'fixture-model'},{'id':'fixture-alternate'}],'selectedModelAudit':str(p/'provider-calls.log')}}]})
bundle=p/'fixture.yaml';bundle.write_text(plan)
(home/'settings.yaml').write_text('bundle:\n  app: []\n')
(p/'native.json').write_text(json.dumps({'home':str(home),'appHome':str(p/'app'),'bundle':str(bundle),'adminWorkspaceRoots':[str(p/'workspace')],'startupTimeout':60}))
`;
test('installed Core/Foundation native controls preserve selected session, user/agent parity and bundle export boundaries',{skip:!python,timeout:100000},async t=>{
 const dir=await mkdtemp(join(tmpdir(),'native-bridge-runtime-')),workspace=join(dir,'workspace');await mkdir(workspace);
 const env={...process.env,PYTHONDONTWRITEBYTECODE:'1',AMPLIFIER_RUNTIME_IMMUTABLE:'1',AMPLIFIER_SOURCE_STORE:join(dir,'source-store'),AMPLIFIER_SESSION_STATE_HOME:join(dir,'writer-state'),UV_CACHE_DIR:join(dir,'uv-cache')};
 const prepared=spawnSync(python!,['-I','-B','-c',setup,dir,process.env.AMPLIFIER_TEST_PORTABLE_BUNDLE==='1'?'portable':'local'],{env,encoding:'utf8'});assert.equal(prepared.status,0,prepared.stderr);
 const child=spawn(python!,['-I','-B','-m','amplifier_acp','--config',join(dir,'native.json')],{cwd:workspace,env,stdio:'pipe'});
 let stderr='';child.stderr.on('data',chunk=>stderr=(stderr+chunk).slice(-8000));
 let approvalCount=0,unknown=false;
 const client=new ClientSideConnection(()=>({sessionUpdate:async()=>{},requestPermission:async params=>{approvalCount++;return {outcome:{outcome:'selected' as const,optionId:params.options.find(row=>row.kind==='allow_once')?.optionId??params.options[0].optionId}};}}),ndJsonStream(Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>));
 const admin=new AdminConnection({command:python!,args:['-I','-B','-m','amplifier_acp','--config',join(dir,'native.json')],cwd:workspace,env,resolveWorkspace:()=>workspace});
 try{
  const initialized=await client.initialize({protocolVersion:1,clientCapabilities:{_meta:{'amplifier.dev/native':{version:1}}}});
  assert.equal((initialized.agentCapabilities?._meta?.['amplifier.dev/native'] as any).version,1);
  const native=await client.newSession({cwd:workspace,mcpServers:[]});const uri='ahp-session:/owned-runtime',calls:any[]=[];
  const deadline=async<T>(work:Promise<T>):Promise<T>=>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{unknown=true;reject(Error('Native control did not settle within 15s; approvals answered: '+approvalCount+'; native session: '+native.sessionId+'; owned state retained: '+dir));},15000);})]);}finally{if(timer)clearTimeout(timer);}};
  const provider=createNativeCapabilities({nativeAdmin:admin.perform,nativeControl:async(scope:string,operation:string,args:any)=>{assert.equal(scope,uri);calls.push({operation,args});return deadline(client.extMethod('_amplifier/native',{sessionId:native.sessionId,operation,args}) as Promise<any>);}});
  let command=0;const context={clientId:'actual-browser',session:{uri,workingDirectory:workspace},origin:'ui' as const};
  const action=(operation:string,args:any={},origin:'ui'|'agent'='ui')=>provider.action({channel:uri,topic:'runtime-control',operation:'runtime.control',args:{operation,args},commandId:'runtime-'+ ++command,version:1},{...context,origin});
  const caps=await action('capabilities');assert.ok(caps.result.controls.includes('goals.set'));
  const catalog=await action('catalog.inspect');assert.ok(catalog.result.tools.some((row:any)=>row.name==='fixture_permit'));
  assert.ok(Array.isArray(catalog.result.skills));assert.ok(catalog.result.agents);
  const goal=await action('goals.set',{condition:'Keep fixture scope',maxTurns:2});assert.equal(goal.result.goal.cap,2);
  assert.deepEqual((await action('goals.get',{},'agent')).result.goal,goal.result.goal);
  assert.equal((await action('goals.clear',{},'agent')).result.goal,null);
  const budget=await action('budget.set',{maxIterations:-1,contextTokens:6000});assert.equal(budget.result.maxIterations,-1);assert.equal(budget.result.contextTokens,6000);
  assert.equal((await action('budget.get',{},'agent')).result.maxIterations,-1);
  assert.equal((await action('mode.list')).result.available,false);assert.equal((await action('mode.clear')).result.active,null);
  const usage=await action('usage.inspect');assert.equal(usage.result.calls,0);
  const mounted=await provider.action({channel:uri,topic:'configuration',operation:'configuration.inspect',args:{},commandId:'inspect',version:1},context);
  assert.ok(mounted.result.plan.providers.some((row:any)=>row.module==='provider-fixture'));
  if(process.env.AMPLIFIER_TEST_PORTABLE_BUNDLE==='1'){
   const plan=structuredClone(mounted.result.plan);plan.session.context.config={...plan.session.context.config,max_tokens:7777};
   await provider.action({channel:uri,topic:'configuration',operation:'configuration.apply',args:{config:plan,expectedConfigurationRevision:mounted.result.configurationRevision},commandId:'apply',version:1},context);
   const saved=await provider.action({channel:uri,topic:'bundles',operation:'bundle.save',args:{sessionId:uri,name:'bridge-saved',description:'Owned installed consumer'},commandId:'save',version:1},context);
   assert.equal(saved.accepted,true);assert.equal(saved.result.saved.name,'bridge-saved');assert.ok(saved.result.activation.bundle);
   assert.equal(await readFile(saved.result.saved.uri,'utf8'),saved.result.export.content);
   assert.equal(calls.filter(row=>row.operation==='bundle.switch').length,1);
   const current=await action('configuration.inspect');assert.equal(current.result.plan.session.context.config.max_tokens,7777);
   assert.equal((await action('usage.inspect')).result.calls,0);
   await assert.rejects(readFile(join(dir,'provider-calls.log')));
  }else{
  await assert.rejects(provider.action({channel:uri,topic:'bundles',operation:'bundle.save',args:{sessionId:uri,name:'bridge-saved',description:'Owned installed consumer'},commandId:'save',version:1},context),/local source without a portable Git equivalent/);
  assert.equal(calls.filter(row=>row.operation==='bundle.switch').length,0);
  }
  assert.equal((await action('context.clear')).result.cleared,true);
  await t.test('approved tool invocation settles through the installed ACP peer',{skip:process.env.AMPLIFIER_TEST_NATIVE_APPROVAL!=='1'},async()=>{
  for(const origin of ['ui','agent'] as const){const tool=await action('tool.invoke',{name:'fixture_permit',arguments:{},actor:origin==='ui'?'agent':'ui'},origin);assert.equal(tool.result.result.success,true);assert.equal(tool.result.result.output.decision,'allow');assert.equal(calls.at(-1).args.actor,origin);}
   assert.equal(approvalCount,2);
  });
 }catch(error){throw Object.assign(error as Error,{nativeDiagnostic:stderr});}
 finally{await admin.close();child.stdin.end();child.kill('SIGKILL');await new Promise<void>(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',()=>resolve());});if(!unknown){const writable=async(path:string)=>{await chmod(path,0o700);for(const entry of await readdir(path,{withFileTypes:true}))if(entry.isDirectory())await writable(join(path,entry.name));};await writable(dir);await rm(dir,{recursive:true,force:true});}}
});
