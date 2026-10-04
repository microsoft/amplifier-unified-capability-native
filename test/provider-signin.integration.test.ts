import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
const {AdminConnection,createNativeCapabilities}=await import(process.env.AMPLIFIER_NATIVE_CAPABILITY_MODULE??'../src/index.js');
const current=process.env.AMPLIFIER_ACP_PYTHON,old=process.env.AMPLIFIER_SIGNIN_OLD_PYTHON;
const req=(operation:string,args:any,channel='host')=>({version:1,topic:'provider-catalog',operation,args,channel,commandId:'owned-'+operation});
async function fixture(){
 const root=await mkdtemp(join(process.env.AMPLIFIER_SIGNIN_TEST_HOME??tmpdir(),'signin-native-'));
 const a=join(root,'workspace-a'),b=join(root,'workspace-b'),home=join(root,'home'),source=join(root,'provider'),pkg=join(source,'amplifier_module_provider_openai_chatgpt');
 for(const p of [a,b,home,pkg])await mkdir(p,{recursive:true});
 await writeFile(join(pkg,'__init__.py'),'');
 await writeFile(join(source,'pyproject.toml'),'[project]\nname="amplifier-module-provider-openai-chatgpt"\nversion="0.0.1"\n');
 await writeFile(join(pkg,'oauth.py'),"import asyncio\nasync def login(token_file_path,print_fn):\n print_fn('Open https://auth.openai.com/codex/device')\n await asyncio.Event().wait()\n");
 const original=join(root,'original.json');await writeFile(original,'{}');
 await writeFile(join(home,'settings.yaml'),`bundle:\n  app: []\nconfig:\n  providers:\n    - id: same-id\n      module: provider-openai-chatgpt\n      config:\n        token_file_path: ${JSON.stringify(original)}\n        auth_mode: chatgpt_codex\n`);
 const config=join(root,'native.json');await writeFile(config,JSON.stringify({home,appHome:join(root,'app'),registryHome:join(root,'registry'),runtimeImmutable:true,adminWorkspaceRoots:[a,b],moduleSources:{'provider-openai-chatgpt':source}}));
 return{root,a,b,config,original};
}
test('actual old initialized peer refuses new selectors before an administration RPC even if callback claims support',{skip:!old},async()=>{
 const f=await fixture();const admin=new AdminConnection({command:old!,args:['-I','-B','-m','amplifier_acp','--config',f.config],cwd:f.a,env:{HOME:f.root,PYTHONDONTWRITEBYTECODE:'1',AMPLIFIER_RUNTIME_IMMUTABLE:'1',AMPLIFIER_SESSION_STATE_HOME:join(f.root,'writers'),AMPLIFIER_SOURCE_STORE:join(f.root,'sources')},resolveWorkspace:async()=>f.a});
 let rpc=0;const nativeRpc=(admin as any).rpc.bind(admin);(admin as any).rpc=(...args:any[])=>{rpc++;return nativeRpc(...args);};
 try{
  assert.equal(await admin.providerSignInCapabilities(),undefined);
  for(const origin of ['ui','agent']as const){
   const p=createNativeCapabilities({nativeAdmin:admin.perform,nativeProviderSignIn:async()=>({version:1,workspaceBound:true,scopedAttempts:true}),nativeControl:async()=>{throw Error('No worker route');}});
   const r=await p.action(req('providers.loginCancel',{id:'same-id',scope:'local',loginId:'a'.repeat(32)}),{clientId:'owned',origin});
   assert.equal(r.accepted,false);assert.equal(r.result.executed,false);assert.equal(r.result.reason,'provider-signin-selectors-unavailable');
  }
  assert.equal(rpc,0);assert.equal(await readFile(f.original,'utf8'),'{}');
 }finally{await admin.close();}
});
test('actual negotiated native fixture keeps user and agent controls on the original workspace flow',{skip:!current},async()=>{
 for(const origin of ['ui','agent']as const){const f=await fixture();const contextA={clientId:'owned',origin,session:{uri:'ahp-session:/owned-a',workingDirectory:f.a}},contextB={clientId:'owned',origin,session:{uri:'ahp-session:/owned-b',workingDirectory:f.b}};
  const admin=new AdminConnection({command:current!,args:['-I','-B','-m','amplifier_acp','--config',f.config],cwd:f.a,env:{HOME:f.root,PYTHONDONTWRITEBYTECODE:'1',AMPLIFIER_RUNTIME_IMMUTABLE:'1',AMPLIFIER_SESSION_STATE_HOME:join(f.root,'writers'),AMPLIFIER_SOURCE_STORE:join(f.root,'sources')},resolveWorkspace:async context=>context.session?.workingDirectory??f.a});
  const p=createNativeCapabilities({nativeAdmin:admin.perform,nativeProviderSignIn:()=>admin.providerSignInCapabilities(),nativeControl:async()=>{throw Error('No resident worker route');}});
  const call=(op:string,args:any,c=contextA)=>p.action(req(op,args,c.session.uri),c);
  try{
   const schemas=await p.actionSchemas();assert.ok(schemas['providers.loginCancel'].schema.properties.loginId);
   const initial=await call('providers.login',{id:'same-id',scope:'local',authMode:'chatgpt_codex'});assert.equal(initial.result.login.status,'starting');
   let status:any;
   for(let i=0;i<100;i++){status=await call('providers.loginStatus',{id:'same-id',scope:'local'});if(status.result.login.url)break;await new Promise(r=>setTimeout(r,10));}
   const loginId=status.result.login.loginId;assert.equal(status.result.login.status,'waiting');assert.equal(status.result.login.url,'https://auth.openai.com/codex/device');
   const other=await call('providers.loginCancel',{id:'same-id',scope:'local'},contextB);assert.equal(other.result.login.status,'idle');
   assert.equal((await call('providers.loginStatus',{id:'same-id',scope:'local',loginId})).result.login.status,'waiting');
   const cancelled=await call('providers.loginCancel',{id:'same-id',sessionId:contextA.session.uri,scope:'local',loginId});assert.equal(cancelled.result.login.status,'cancelled');
   assert.equal(cancelled.result.login.loginId,loginId);assert.equal(await readFile(f.original,'utf8'),'{}');
  }finally{await admin.close();}
 }
});
