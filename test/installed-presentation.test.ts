import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const {AdminConnection,createNativeCapabilities}=await import(process.env.AMPLIFIER_NATIVE_CAPABILITY_MODULE??'../src/index.js');

test('installed native presentation preserves providers, all five module sections, source scopes and bundle defaults without a runtime',{skip:!process.env.AMPLIFIER_ACP_PYTHON},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'native-presentation-')),workspace=join(dir,'workspace'),home=join(dir,'home');
 await mkdir(workspace);await mkdir(home);await mkdir(join(dir,'foreign')); 
 const config=join(dir,'native.json');
 await writeFile(config,JSON.stringify({home,appHome:join(dir,'app'),adminWorkspaceRoots:[workspace],workerCommand:['/never-start-a-worker']}));
 const admin=new AdminConnection({command:process.env.AMPLIFIER_ACP_PYTHON!,args:['-I','-B','-m','amplifier_acp','--config',config],cwd:workspace,resolveWorkspace:()=>workspace,env:{PYTHONDONTWRITEBYTECODE:'1',AMPLIFIER_SOURCE_STORE:join(dir,'sources'),AMPLIFIER_SESSION_STATE_HOME:join(dir,'writer-state')}});
 let controls=0;const invalidations:any[]=[];
 const provider=createNativeCapabilities({nativeAdmin:admin.perform,nativeControl:async()=>{controls++;throw Error('Administration must not start a session');},onInvalidate:(...args:any[])=>invalidations.push(args)});
 let command=0;const context={clientId:'owned-browser',origin:'ui' as const};
 const action=(topic:string,operation:string,args:any={})=>provider.action({channel:'ahp-root://',topic,operation,args,version:1,commandId:'presentation-'+ ++command},context);
 try{
  const schemas=await provider.actionSchemas();assert.ok(schemas['providers.save']);assert.ok(schemas['modules.save']);assert.ok(schemas['bundle.default']);
  const secret='fixture-only-bridge-key-value';
  const saved=await action('provider-catalog','providers.save',{module:'provider-fixture',id:'fixture',scope:'project',config:{default_model:'offline',customOption:{preserved:true}},apiKey:secret});
  assert.equal(saved.accepted,true);assert.ok(!JSON.stringify(saved).includes(secret));
  assert.ok(saved.result.providers.find((row:any)=>row.id==='fixture'));
  const finished=await action('provider-catalog','providers.finishSetup',{id:'fixture',model:'offline-next',scope:'project'});
  assert.equal(finished.result.setupCompletion.model,'offline-next');
  const listed=await action('provider-catalog','providers.list');
  assert.equal(listed.result.providers.find((row:any)=>row.id==='fixture').config.customOption.preserved,true);
  for(const section of ['tools','hooks','providers','orchestrator','context']){
   const result=await action('configuration','modules.save',{section,module:'fixture-'+section,scope:'project',config:{nested:{retained:true}}});
   const row=result.result.modules.find((row:any)=>row.section===section&&row.module==='fixture-'+section);assert.equal(row.config.nested.retained,true);
   assert.equal(result.updates.find((row:any)=>row.topic==='configuration').data.registry.scope,'project');
  }
  await action('configuration','sources.save',{kind:'module',name:'fixture-tools',source:workspace,scope:'local'});
  const sources=await action('configuration','sources.list',{scope:'local'});assert.equal(sources.result.sources[0].name,'fixture-tools');
  const modules=await action('configuration','modules.list',{scope:'project'});assert.equal(modules.result.modules.filter((row:any)=>row.module.startsWith('fixture-')).length,5);
  await action('bundles','bundle.default',{bundle:'local-fixture',scope:'workspace'});
  const bundles=await action('bundles','bundles.list');assert.equal(bundles.result.bundleDefaults.workspace,'local-fixture');
  // Registration preferences only: these fixture aliases are never mounted.
  const firstFile='fixture:first',secondFile='fixture:second';
  const first=await action('bundles','bundles.add',{uri:firstFile,role:'behavior',name:'first'});
  const firstId=first.result.bundles.find((row:any)=>row.name==='first').id;
  const second=await action('bundles','bundles.add',{uri:secondFile,role:'behavior',name:'second'});
  const secondId=second.result.bundles.find((row:any)=>row.name==='second').id;
  assert.equal(second.result.takesEffect,'new_sessions');
  const reordered=await action('bundles','bundles.reorder',{ids:[secondId,firstId],expectedIds:[firstId,secondId]});
  assert.deepEqual(reordered.result.bundles.map((row:any)=>row.id),[secondId,firstId]);
  const disabled=await action('bundles','bundles.toggle',{id:firstId,enabled:false});assert.equal(disabled.result.bundles.find((row:any)=>row.id===firstId).enabled,false);
  const removed=await action('bundles','bundles.remove',{id:secondId});assert.equal(removed.result.bundles.some((row:any)=>row.id===secondId),false);
  const removedProvider=await action('provider-catalog','providers.remove',{id:'fixture',scope:'project'});assert.equal(removedProvider.result.providers.find((row:any)=>row.id==='fixture')?.enabled??false,false);
  assert.equal(controls,0);assert.ok(invalidations.length>0);
  await assert.rejects(stat(join(home,'projects')));
  const before=await readFile(join(workspace,'.amplifier','settings.yaml'));
  const refused=await action('provider-catalog','providers.list',{workspace:join(dir,'foreign')});
  assert.equal(refused.accepted,false);assert.equal(refused.result.executed,false);
  assert.match(refused.result.message,/outside launcher-authorized roots/);
  assert.deepEqual(refused.updates,[]);assert.deepEqual(refused.invalidate,[]);
  assert.deepEqual(await readFile(join(workspace,'.amplifier','settings.yaml')),before);
 }finally{await admin.close();await rm(dir,{recursive:true,force:true});}
});
