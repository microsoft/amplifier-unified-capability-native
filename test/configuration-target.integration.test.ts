import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
const {AdminConnection,createNativeCapabilities}=await import(process.env.AMPLIFIER_NATIVE_CAPABILITY_MODULE??'../src/index.js');
const python=process.env.AMPLIFIER_ACP_PYTHON;
test('installed native keeps global, workspace and sign-in owners separate for user and agent callers',{skip:!python},async()=>{
 const root=await mkdtemp(join(tmpdir(),'configuration-owner-')),home=join(root,'home'),a=join(root,'a'),b=join(root,'b'),source=join(root,'provider'),pkg=join(source,'amplifier_module_provider_openai_chatgpt');
 for(const path of [home,join(a,'.amplifier'),join(b,'.amplifier'),pkg])await mkdir(path,{recursive:true});
 await writeFile(join(pkg,'__init__.py'),'');await writeFile(join(source,'pyproject.toml'),'[project]\nname="amplifier-module-provider-openai-chatgpt"\nversion="0.0.1"\n');
 await writeFile(join(pkg,'oauth.py'),"import asyncio\nasync def login(token_file_path,print_fn):\n print_fn('Open https://auth.openai.com/codex/device')\n await asyncio.Event().wait()\n");
 const token=join(root,'tokens.json');await writeFile(token,'{}');
 const settings=(model:string)=>`bundle:\n  app: []\nconfig:\n  providers:\n    - id: same\n      module: provider-openai-chatgpt\n      config:\n        default_model: ${model}\n        token_file_path: ${JSON.stringify(token)}\n        auth_mode: chatgpt_codex\n`;
 await writeFile(join(home,'settings.yaml'),settings('global-model'));await writeFile(join(a,'.amplifier','settings.yaml'),settings('workspace-model'));
 const config=join(root,'native.json');await writeFile(config,JSON.stringify({home,appHome:join(root,'app'),registryHome:join(root,'registry'),runtimeImmutable:true,adminWorkspaceRoots:[a,b],moduleSources:{'provider-openai-chatgpt':source}}));
 const admin=new AdminConnection({command:python!,args:['-I','-B','-m','amplifier_acp','--config',config],cwd:a,env:{HOME:root,PYTHONDONTWRITEBYTECODE:'1',AMPLIFIER_RUNTIME_IMMUTABLE:'1',AMPLIFIER_SESSION_STATE_HOME:join(root,'writers'),AMPLIFIER_SOURCE_STORE:join(root,'sources')},resolveWorkspace:async context=>context.workingDirectory??a});
 const p=createNativeCapabilities({nativeConfigurationTargets:()=>admin.configurationTargetCapabilities(),nativeProviderSignIn:()=>admin.providerSignInCapabilities(),nativeAdmin:(operation,args,context)=>admin.perform(operation,args,{...context,workingDirectory:args.configurationTarget?.kind==='workspace'&&args.configurationTarget.workspaceId==='b'?b:a}),nativeControl:async()=>{throw Error('No worker route');}});
 const owners=[{kind:'global'},{kind:'workspace',workspaceId:'a'},{kind:'workspace',workspaceId:'b'}];
 const call=(operation:string,args:any,owner:any,origin:'ui'|'agent')=>p.action({version:1,channel:'ahp-root://',topic:'provider-catalog',operation,args:{...args,configurationTarget:owner},commandId:crypto.randomUUID()},{clientId:'fixture',origin,...(origin==='agent'?{session:{uri:'ahp-session:/origin',workingDirectory:b}}:{})});
 try{
  await p.negotiateConfigurationTargets();assert.equal(p.manifest.topics['provider-catalog'].configurationTargets?.isolatedResults,true);
  for(const origin of ['ui','agent']as const){
   const values=[];for(const owner of owners){const result=await call('providers.list',{},owner,origin);assert.deepEqual(result.result.configurationTarget,owner);values.push(result.result.providers.find((row:any)=>row.id==='same').config.default_model);}
   assert.deepEqual(values,['global-model','workspace-model','global-model']);
   const start=await call('providers.login',{id:'same',scope:'local',authMode:'chatgpt_codex'},owners[1],origin);assert.equal(start.result.login.status,'starting');
   let status:any;for(let i=0;i<100;i++){status=await call('providers.loginStatus',{id:'same',scope:'local'},owners[1],origin);if(status.result.login.url)break;await new Promise(resolve=>setTimeout(resolve,10));}
   assert.equal(status.result.login.status,'waiting');const loginId=status.result.login.loginId;
   const unrelated=await call('providers.loginCancel',{id:'same',scope:'local'},owners[2],origin);assert.equal(unrelated.result.login.status,'idle');
   assert.equal((await call('providers.loginStatus',{id:'same',scope:'local',loginId},owners[1],origin)).result.login.status,'waiting');
   assert.equal((await call('providers.loginCancel',{id:'same',scope:'local',loginId},owners[1],origin)).result.login.status,'cancelled');
  }
  assert.equal(await readFile(token,'utf8'),'{}');
 }finally{await admin.close();}
});
