import test from 'node:test';import assert from 'node:assert/strict';
const {createNativeCapabilities}=await import(process.env.AMPLIFIER_NATIVE_CAPABILITY_MODULE??'../src/index.js');
const scope='ahp-session:/one',context={clientId:'ui',session:{uri:scope}};
const marker={version:1,method:'_amplifier/naming',passiveMetadata:true,commandIds:true,replayUnknown:false};
const action=(args:any,origin:'ui'|'agent'='ui')=>({request:{channel:scope,topic:'runtime-control',operation:'session.naming',version:1,commandId:'original',args},context:{...context,origin}});
function fixture(){
 let title='Before',revision=0,policyRevision=0,automatic=true,hostRevision='0';const calls:any[]=[];
 const projection=(applied=false)=>({applied,title,naming:{automatic,nameRevision:revision,policyRevision}});
 const options={nativeNamingCapabilities:async()=>marker,nativeControl:async(s:string,op:string,args:any)=>{calls.push([s,op,args]);assert.equal(op,'session.naming.generate');return {name:'Generated',name_revision:revision,name_policy_revision:policyRevision};},
 nativeNaming:async(s:string,op:string,args:any)=>{calls.push([s,op,args]);if(op==='read')return projection();if(op==='commit'){if(args.candidate.name_revision!==revision||args.candidate.name_policy_revision!==policyRevision)return projection();title=args.candidate.name;revision++;return projection(true);}if(op==='policy'){if(args.expectedNameRevision!==revision||args.expectedPolicyRevision!==policyRevision)return projection();automatic=args.automatic;policyRevision++;return projection(true);}throw Error('Unexpected native operation');},
 readSessionTitle:async()=>({title,titleRevision:hostRevision}),commitSessionTitle:async(s:string,expected:any,persist:any)=>{calls.push([s,'host.commit',expected]);if(expected.expectedTitleRevision!==hostRevision)return {applied:false};const result=await persist();if(result.applied&&result.title!==undefined)hostRevision=String(Number(hostRevision)+1);return {...result,titleRevision:hostRevision};}};
 return {options,calls,provider:createNativeCapabilities(options),manual:()=>{title='Manual';revision++;policyRevision++;automatic=false;hostRevision=String(Number(hostRevision)+1);},projection};
}
test('advertisement requires actual peer marker and every canonical host port',async()=>{
 for(const missing of ['nativeNaming','nativeNamingCapabilities','readSessionTitle','commitSessionTitle']){const f=fixture();delete (f.options as any)[missing];const p=createNativeCapabilities(f.options);await p.actionSchemas();assert.equal(p.manifest.actions['session.naming'],undefined);assert.equal(f.calls.length,0);}
 const f=fixture();f.options.nativeNamingCapabilities=async()=>({...marker,replayUnknown:true});const p=createNativeCapabilities(f.options);await p.actionSchemas();assert.equal(p.manifest.actions['session.naming'],undefined);
});
test('one-shot UI and agent call same canonical owner outside generation lock',async()=>{
 for(const origin of ['ui','agent'] as const){const f=fixture(),a=action({id:scope,regenerate:true},origin);const result=await f.provider.action(a.request,a.context);assert.equal(result.accepted,true);assert.equal(result.result.title,'Generated');assert.deepEqual(f.calls.map(c=>c[1]),['session.naming.generate','host.commit','commit','read','read']);assert.equal(f.calls[1][2].commandId,'original');assert.notEqual(f.calls[0][2].commandId,f.calls[2][2].commandId);assert.ok(f.calls[0][2].commandId.startsWith('naming-'));}
});
test('policy update is passive and never generates or projects a title',async()=>{
 const f=fixture(),persist=f.options.commitSessionTitle;f.options.commitSessionTitle=async(s,e,callback)=>persist(s,e,async()=>{const r=await callback();assert.equal(r.title,undefined);return r;});const p=createNativeCapabilities(f.options),a=action({sessionId:scope,automatic:false});const result=await p.action(a.request,a.context);assert.equal(result.accepted,true);assert.equal(result.result.naming.automatic,false);assert.deepEqual(result.invalidate,[]);assert.equal(result.result.titleRevision,'0');assert.ok(!f.calls.some(c=>c[1]==='session.naming.generate'));
});
test('wrong sidebar target and mixed legacy args are refused before native/model calls',async()=>{
 for(const args of [{id:'ahp-session:/other',regenerate:true},{regenerate:true,automatic:false},{automatic:'yes'},{regenerate:false}]){const f=fixture(),a=action(args);await assert.rejects(f.provider.action(a.request,a.context));assert.equal(f.calls.length,0);}
});
test('manual edit while generation is pending prevents native commit',async()=>{
 const f=fixture(),generate=f.options.nativeControl;f.options.nativeControl=async(s,o,a)=>{const candidate=await generate(s,o,a);f.manual();return candidate;};const p=createNativeCapabilities(f.options),a=action({regenerate:true});const r=await p.action(a.request,a.context);assert.equal(r.accepted,false);assert.equal(f.projection().title,'Manual');assert.ok(!f.calls.some(c=>c[1]==='commit'));
});
test('historical successful native receipt cannot overwrite newer manual metadata',async()=>{
 const f=fixture(),native=f.options.nativeNaming;f.options.nativeNaming=async(s,o,a)=>{if(o==='commit'){const old=await native(s,o,a);f.manual();return old;}return native(s,o,a);};const p=createNativeCapabilities(f.options),a=action({regenerate:true});const r=await p.action(a.request,a.context);assert.equal(r.accepted,false);assert.equal(r.result.title,'Manual');assert.equal(r.result.naming.automatic,false);
});
test('new naming generation and mutators cannot bypass canonical host via runtime.control',async()=>{
 const f=fixture();for(const operation of ['session.naming.generate','session.naming.commit','session.naming.policy','session.naming.rename'])await assert.rejects(f.provider.action({channel:scope,topic:'runtime-control',operation:'runtime.control',version:1,commandId:'original',args:{operation,args:{}}},context),/generic native controls/);assert.equal(f.calls.length,0);
});

test('cached Host receipt cannot project an old title after manual rename',async()=>{
 const f=fixture(),persist=f.options.commitSessionTitle;let receipt:any,callbacks=0;
 f.options.commitSessionTitle=async(s,e,callback)=>{if(receipt)return receipt;receipt=await persist(s,e,async()=>{callbacks++;return callback();});return receipt;};
 const generate=f.options.nativeControl;let candidate:any,modelEffects=0;
 f.options.nativeControl=async(s,o,a)=>{if(candidate)return candidate;modelEffects++;candidate=await generate(s,o,a);return candidate;};
 const p=createNativeCapabilities(f.options),a=action({regenerate:true});
 assert.equal((await p.action(a.request,a.context)).accepted,true);
 assert.equal((await p.action(a.request,a.context)).accepted,true);
 f.manual();f.calls.length=0;
 const retry=await p.action(a.request,a.context);
 assert.equal(callbacks,1);assert.equal(modelEffects,1);assert.equal(retry.accepted,false);
 assert.equal(retry.result.title,'Manual');assert.equal(retry.result.naming.automatic,false);
 assert.equal(retry.result.metadata.naming.nameRevision,f.projection().naming.nameRevision);
 assert.equal(retry.result.titleRevision,undefined);
 assert.deepEqual(f.calls.map(c=>c[1]),['read']);
});
