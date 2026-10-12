import test from 'node:test';import assert from 'node:assert/strict';
import {createNativeCapabilities} from '../src/index.js';
const marker={version:1,globalOnly:true,workspaceBound:true,isolatedResults:true};
const global={kind:'global'},workspace={kind:'workspace',workspaceId:'registered'};
const request=(operation:string,args:any,channel='ahp-root://')=>({version:1,channel,topic:operation.startsWith('modules')?'configuration':'provider-catalog',operation,args,commandId:crypto.randomUUID()});
const read=(owner:any,topic='provider-catalog')=>({uri:'amplifier-capability://native/'+topic+'?configurationTarget='+encodeURIComponent(JSON.stringify(owner)),topic,scope:'host',clientId:'test'});
test('owner records, pending reads, catalogs and watches remain separate even with identical provider IDs',async()=>{
 const calls:any[]=[];let release:any;const pending=new Promise<void>(resolve=>release=resolve);
 const p=createNativeCapabilities({nativeConfigurationTargets:async()=>marker,nativeControl:async()=>{throw Error('no worker')},nativeAdmin:async(op,args,ctx)=>{calls.push({op,args,ctx});if(op==='providers.models'&&args.configurationTarget.kind==='workspace')await pending;return {configurationTarget:args.configurationTarget,providers:[{id:'same',config:{default_model:args.configurationTarget.kind}}],...(op==='providers.models'?{modelsProviderId:'same',models:[{id:'workspace-only'}]}:{})};}});
 await p.negotiateConfigurationTargets();assert.deepEqual(p.manifest.topics['provider-catalog'].configurationTargets,marker);
 const [a,b]=await Promise.all([p.read(read(global)),p.read(read(workspace))]);assert.equal(a.data.setup.providers[0].config.default_model,'global');assert.equal(b.data.setup.providers[0].config.default_model,'workspace');assert.deepEqual(a.configurationTarget,global);assert.deepEqual(b.configurationTarget,workspace);
 const slow=p.action(request('providers.models',{id:'same',configurationTarget:workspace}),{clientId:'browser'});
 await p.action(request('providers.list',{configurationTarget:global}),{clientId:'browser'});release();const r=await slow;assert.ok(r.updates.every(u=>JSON.stringify(u.configurationTarget)===JSON.stringify(workspace)));
 assert.equal((await p.read(read(global))).data.setup.modelCatalogs,undefined);assert.equal((await p.read(read(workspace))).data.setup.modelCatalogs.same[0].id,'workspace-only');
 assert.ok(calls.every(c=>!c.ctx.session));
});
test('closed proof and exact owner reject before dispatch; no selected-chat fallback',async()=>{
 for(const metadata of [undefined,{}, {...marker,extra:true}]){let effects=0;const p=createNativeCapabilities({nativeConfigurationTargets:async()=>metadata,nativeControl:async()=>{effects++;return{}},nativeAdmin:async()=>{effects++;return{}}});assert.equal((await p.actionSchemas())['providers.list'].schema.properties.configurationTarget,undefined);await assert.rejects(p.read(read(global)));await assert.rejects(p.action(request('providers.list',{configurationTarget:global}),{clientId:'test'}));assert.equal(effects,0);}
 let effects=0;const p=createNativeCapabilities({nativeConfigurationTargets:async()=>marker,nativeControl:async()=>{effects++;return{}},nativeAdmin:async()=>{effects++;return{}}});
 for(const args of [{configurationTarget:global,scope:'project'},{configurationTarget:workspace,scope:'global'},{configurationTarget:global,sessionId:'ahp-session:/other'},{configurationTarget:global,workspace:'/other'},{configurationTarget:{...global,workspaceId:'extra'}}])await assert.rejects(p.action(request('providers.save',args),{clientId:'test'}));assert.equal(effects,0);
 await assert.rejects(p.action(request('providers.list',{configurationTarget:global},'ahp-session:/selected'),{clientId:'test',session:{uri:'ahp-session:/selected'}}));assert.equal(effects,0);
});
test('trusted agent uses the same explicit root owner and scoped sign-in selectors as the UI',async()=>{
 const calls:any[]=[];const p=createNativeCapabilities({nativeConfigurationTargets:async()=>marker,nativeProviderSignIn:async()=>({version:1,workspaceBound:true,scopedAttempts:true}),nativeControl:async()=>{throw Error('no resident route')},nativeAdmin:async(op,args,ctx)=>{calls.push({op,args,ctx});return {configurationTarget:args.configurationTarget}}});
 const args={configurationTarget:workspace,id:'same',scope:'local',loginId:'a'.repeat(32)};
 for(const origin of ['ui','agent'] as const)await p.action(request('providers.loginStatus',args),{clientId:'test',origin,...(origin==='agent'?{session:{uri:'ahp-session:/origin'}}:{})});
 assert.equal(calls.length,2);assert.ok(calls.every(c=>!c.ctx.session));assert.deepEqual(calls[0].args,args);assert.deepEqual(calls[1].args,args);
});
