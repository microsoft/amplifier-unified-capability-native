import {namingMetadata} from './naming.js';
import {contextClearMetadata,contextClearUnavailable} from './context-clear.js';
import {providerSignInMetadata,signInSelectors,validSignInSelectors,signInSelectorsUnavailable} from './provider-signin.js';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {AsyncLocalStorage} from 'node:async_hooks';
import {Readable,Writable,Transform} from 'node:stream';
import {ClientSideConnection,ndJsonStream} from '@agentclientprotocol/sdk';
import type {Context,Json} from './index.js';
import {serviceIdentity,sameIdentity,validateServiceRelease,evidenceKey,type ServiceIdentity,type ServiceReleaseFields} from './service-lifecycle.js';
export interface AdminOptions {
 command:string;args?:string[];env?:Record<string,string>;cwd:string;
 /** Resolve via trusted host context, never args.cwd. */
 resolveWorkspace:(context:Context)=>Promise<string>|string;
 timeoutMs?:number;
 /** Passive initialization deadline, independent of a later effect timeout. */
 initializationTimeoutMs?:number;
 ownerId?:string;
 onMayBeIdle?:()=>void;
}
export interface AdminAdmissionAbortProof {kind:'distribution-admission-abort';verified:true;purpose:'distribution-update';commandId:string;fenceId:string;instanceId:string;dataScope:string;receiptId:string}
export interface AdminAdmissionAbortReceipt {ownerId:string;status:'released'|'not-acquired';receiptId:string;commandId:string;fenceId:string;instanceId:string;dataScope:string}
export interface AdminFenceContext {fenceId:string;commandId:string;purpose:'recovery'|'distribution-update'|'service-stop';instanceId:string;dataScope:string;serviceIdentity?:ServiceIdentity;}
export interface AdminReleaseProof {verified:true;fenceId:string;commandId:string;outcome:'unchanged'|'ready';instanceId:string;dataScope:string;receiptId:string;}
export type AdminServiceReleaseProof=AdminReleaseProof&ServiceReleaseFields;
type ReleaseProof=AdminReleaseProof|AdminServiceReleaseProof|{kind:'admission-refused'};
const IMPORTS=new Set(['history.import.begin','history.import.chunk','history.import.preview','history.import.commit','history.import.receipt']);
const CACHES=new Set(['maintenance.cache.scan','maintenance.cache.page','maintenance.cache.preview','maintenance.cache.clear']);
const APP_RESETS=new Set(['maintenance.appReset.prepare','maintenance.appReset.apply','maintenance.appReset.inspect','maintenance.appReset.restore']);
const CAPTURES=new Set(['maintenance.capture.acquire','maintenance.capture.inspect','maintenance.capture.release']);
const READS=new Set(['bundle.receipt','maintenance.appReset.inspect','maintenance.capture.inspect','maintenance.cache.page','maintenance.artifact.inspect','maintenance.restore.inspect','maintenance.restore.manifest','permissions.get','permissions.receipt','voice.preferences.receipt','history.import.receipt','maintenance.archive.manifest','voice.configuration','maintenance.receipt','maintenance.artifact.read','maintenance.lease','generations.receipt','generations.inspect','generations.current']);
const MAINTENANCE=new Set([...APP_RESETS,...CAPTURES,...CACHES,'maintenance.artifact.inspect','maintenance.restore.inspect','maintenance.restore.preview','maintenance.restore.manifest','maintenance.restore.apply','maintenance.restore.reconcile','maintenance.archive.create','maintenance.archive.add','maintenance.archive.prepare','maintenance.archive.manifest','maintenance.preview','maintenance.reset.preview','maintenance.acquire','maintenance.snapshot','maintenance.release','maintenance.lease','maintenance.receipt','maintenance.artifact.read','maintenance.reset.apply','maintenance.reset.restore','maintenance.reset.reconcile']);
const fenced=()=>Object.assign(Error('Native administration intake is held; no new effect was admitted'),{data:{executed:false,replayed:false,reason:'admin-quiescence-fenced'}});
/** Private passive ACP connection; held lifecycle proof includes native-owned background writers. */
export class AdminConnection {
 private process?:ChildProcessWithoutNullStreams;private client?:ClientSideConnection;private starting?:Promise<void>;private closed=false;private tail='';private lifecycleSupported=false;private admissionAbortSupported=false;private serviceStopSupported=false;private idleSupported=false;private historyImportSupported=false;private voicePreferencesSupported=false;private permissionsSupported=false;private maintenanceMetadata?:Json;private bundleMetadata?:Json;private contextMetadata?:Json;private generationsMetadata?:Json;private calls=0;
 private providerSignInMetadata?:Json;private namingMetadata?:Json;
 private held?:{context:AdminFenceContext;phase:'checking'|'held'|'unknown';leaseId?:string;adminInstanceId?:string};
 private admissionPending=false;
 private releases=new Map<string,string>();
 private maintenance=new AsyncLocalStorage<{active:boolean;fenceId:string;commandId:string}>();
 constructor(private options:AdminOptions){}
 private idle(){try{this.options.onMayBeIdle?.();}catch{/* Advisory only; never change a completed operation result. */}}
 private async start(){
  if(this.closed)throw Object.assign(Error('Native administration connection closed; no new request was dispatched. Inspect original receipts; earlier outcomes are unchanged.'),{data:{executed:false,replayed:false,reason:'native-admin-connection-closed'}});
  if(this.starting)return this.starting;
  this.starting=(async()=>{
   const process_=this.process=spawn(this.options.command,this.options.args??[],{cwd:this.options.cwd,env:{...process.env,...this.options.env},stdio:'pipe'});
   process_.stderr.on('data',data=>{this.tail=(this.tail+String(data)).slice(-8192);});
   const lost=()=>{this.closed=true;if(this.held)this.held.phase='unknown';};process_.on('error',lost);process_.on('exit',lost);
   let bytes=0;const guard=new Transform({transform(chunk:Buffer,_encoding,callback){for(const byte of chunk){bytes=byte===10?0:bytes+1;if(bytes>2*1024*1024){callback(Error('Native admin frame exceeds 2 MiB'));return;}}callback(null,chunk);}});
   guard.on('error',()=>process_.kill());process_.stdout.pipe(guard);
   this.client=new ClientSideConnection(()=>({extNotification:async(method,params)=>{if(method==='_amplifier/admin/idle'&&this.idleSupported&&params.version===1)this.idle();},sessionUpdate:async()=>{throw Error('Admin connection cannot own session updates.');},requestPermission:async()=>({outcome:{outcome:'cancelled' as const}})}),ndJsonStream(Writable.toWeb(process_.stdin) as WritableStream<Uint8Array>,Readable.toWeb(guard) as ReadableStream<Uint8Array>));
   let initializationTimer:ReturnType<typeof setTimeout>|undefined;
   let init;
   try{
    const deadline=this.options.initializationTimeoutMs??2000;
    if(!Number.isSafeInteger(deadline)||deadline<1||deadline>10000)throw Error('Native administration initialization deadline must be 1 to 10000 ms.');
    init=await Promise.race([this.client.initialize({protocolVersion:1,clientCapabilities:{_meta:{'amplifier.dev/native':{version:1}}},clientInfo:{name:'amplifier-unified-native-capabilities',version:'0.1.0'}}),new Promise<never>((_,reject)=>{initializationTimer=setTimeout(()=>reject(Error('Passive native administration initialization deadline exceeded.')),deadline);})]);
   }catch(error){this.process?.kill('SIGKILL');await this.close();throw error;}finally{if(initializationTimer)clearTimeout(initializationTimer);}

   const native=init.agentCapabilities?._meta?.['amplifier.dev/native'] as Json|undefined;
   if(init.protocolVersion!==1||native?.version!==1||native?.admin?.version!==1){await this.close();throw Object.assign(Error('Agent has no launcher-enabled native administration v1 capability.'),{data:{executed:false,replayed:false,reason:'native-admin-unavailable'}});}
   this.generationsMetadata=native.admin.generations?structuredClone(native.admin.generations):undefined;
   this.namingMetadata=native.naming?structuredClone(native.naming):undefined;
   this.contextMetadata=native.contextClear?structuredClone(native.contextClear):undefined;
   this.bundleMetadata=native.bundleCommands?structuredClone(native.bundleCommands):undefined;
   this.providerSignInMetadata=native.admin.providerSignIn?structuredClone(native.admin.providerSignIn):undefined;
   this.maintenanceMetadata=native.admin.maintenance?structuredClone(native.admin.maintenance):undefined;
   this.historyImportSupported=native.admin.historyImport?.version===1&&native.admin.historyImport?.staged===true;
   this.permissionsSupported=native.admin.permissions?.version===1&&native.admin.permissions?.cas===true&&native.admin.permissions?.receipt===true;
   this.voicePreferencesSupported=native.admin.voice?.preferences?.version===1&&native.admin.voice?.preferences?.cas===true&&native.admin.voice?.preferences?.receipt===true;
   this.idleSupported=native.admin.lifecycle?.idleNotification===true;
   this.lifecycleSupported=native.admin.lifecycle?.version===1&&native.admin.lifecycle?.heldIntake===true&&native.admin.lifecycle?.crossProcessWriterFence===true;
   this.admissionAbortSupported=native.admin.lifecycle?.admissionAbort?.version===1&&native.admin.lifecycle.admissionAbort.durable===true&&native.admin.lifecycle.admissionAbort.receipt===true;
   this.serviceStopSupported=native.admin.lifecycle?.serviceStop?.version===1;
  })();
  return this.starting;
 }
 private async rpc(method:string,params:Json):Promise<Json>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([this.client!.extMethod(method,params) as Promise<Json>,new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{void this.close();reject(Error('Native administration timed out; outcome unknown and no operation was replayed.'));},this.options.timeoutMs??120000);})]);}
  finally{if(timer)clearTimeout(timer);}
 }
 /** Passive negotiated capability metadata; no runtime, archive inventory, or native settings reads. */
 async maintenanceCapabilities():Promise<Json|undefined>{
  this.calls++;try{await this.start();return this.maintenanceMetadata?structuredClone(this.maintenanceMetadata):undefined;}finally{this.calls--;if(!this.calls)this.idle();}
 }
 /** Passive metadata from this connection's initialized engine, not a client assertion. */
 async bundleCommandCapabilities():Promise<Json|undefined>{
  this.calls++;try{await this.start();return this.bundleMetadata?structuredClone(this.bundleMetadata):undefined;}finally{this.calls--;if(!this.calls)this.idle();}
 }
 /** Actual passive naming marker from this initialized administration peer. */
 async namingCapabilities():Promise<Json|undefined>{
  this.calls++;try{await this.start();return namingMetadata(this.namingMetadata)?structuredClone(this.namingMetadata):undefined;}finally{this.calls--;if(!this.calls)this.idle();}
 }
 /** Trusted Host history binding only; no worker or active session admission. */
 async performNaming(input:{sessionId:string;cwd:string;operation:'read'|'rename'|'policy'|'commit'|'receipt';args:Json}):Promise<Json>{
  if(!input||Object.keys(input).sort().join(',')!=='args,cwd,operation,sessionId'||typeof input.sessionId!=='string'||!input.sessionId||input.sessionId.length>200||/[\x00-\x1f]/.test(input.sessionId)||typeof input.cwd!=='string'||!input.cwd.startsWith('/')||input.cwd.length>8192||/[\x00-\x1f]/.test(input.cwd)||!['read','rename','policy','commit','receipt'].includes(input.operation)||!input.args||typeof input.args!=='object'||Array.isArray(input.args)||Buffer.byteLength(JSON.stringify(input.args))>16384)throw Error('Exact bounded trusted naming selectors required');
  const captured=structuredClone(input);
  if(this.held&&!['read','receipt'].includes(captured.operation))throw fenced();
  this.calls++;try{await this.start();if(!namingMetadata(this.namingMetadata))throw Error('Passive naming is unavailable on the configured Native peer');return await this.rpc('_amplifier/naming',captured);}finally{this.calls--;if(!this.calls)this.idle();}
 }
 /** Passive scoped sign-in metadata from this connection's actual initialized peer. */
 async providerSignInCapabilities():Promise<Json|undefined>{
  this.calls++;try{await this.start();return this.providerSignInMetadata?structuredClone(this.providerSignInMetadata):undefined;}finally{this.calls--;if(!this.calls)this.idle();}
 }
 /** Trusted composition supplies host-resolved canonical native identity and history cwd. No worker/session admission. */
 async readBundleReceipt(input:{sessionId:string;cwd:string;commandId:string}):Promise<Json>{
  if(!input||Object.keys(input).some(k=>!['sessionId','cwd','commandId'].includes(k))||typeof input.sessionId!=='string'||!input.sessionId||typeof input.cwd!=='string'||!input.cwd||typeof input.commandId!=='string'||!input.commandId||input.commandId.length>200)throw Error('Exact trusted native bundle receipt selectors required.');
  this.calls++;try{
   await this.start();
   if(this.bundleMetadata?.version!==1||this.bundleMetadata?.passiveReceipt!==true||this.bundleMetadata?.activationReceipt!=='_amplifier/bundle/receipt')throw Object.assign(Error('Native bundle receipts are unavailable on this configured engine.'),{data:{executed:false,replayed:false,reason:'bundle-receipt-unavailable'}});
   return await this.rpc('_amplifier/bundle/receipt',{sessionId:input.sessionId,cwd:input.cwd,commandId:input.commandId});
  }finally{this.calls--;if(!this.calls)this.idle();}
 }
 /** Actual trusted launcher generation-maintenance grant; never grants it implicitly. */
 async generationsCapabilities():Promise<Json|undefined>{
  this.calls++;try{await this.start();return this.generationsMetadata?structuredClone(this.generationsMetadata):undefined;}finally{this.calls--;if(!this.calls)this.idle();}
 }
 /** Read the initialized peer metadata without a worker/session admission. */
 async contextClearCapabilities():Promise<Json|undefined>{
  this.calls++;try{await this.start();return this.contextMetadata?structuredClone(this.contextMetadata):undefined;}finally{this.calls--;if(!this.calls)this.idle();}
 }
 /** Trusted host supplies immutable native history identity and canonical cwd. */
 async readContextReceipt(input:{sessionId:string;cwd:string;commandId:string}):Promise<Json>{
  if(!input||Object.keys(input).some(k=>!['sessionId','cwd','commandId'].includes(k))||typeof input.sessionId!=='string'||!input.sessionId||input.sessionId.length>200||typeof input.cwd!=='string'||!input.cwd||input.cwd.length>8192||typeof input.commandId!=='string'||!input.commandId||input.commandId.length>200||/[\u0000-\u001f]/.test(input.commandId))throw Error('Exact trusted native context receipt selectors required.');
  this.calls++;try{await this.start();if(!contextClearMetadata(this.contextMetadata))throw contextClearUnavailable('Native passive context receipts are unavailable on this configured engine.');return await this.rpc('_amplifier/context/receipt',{...input});}finally{this.calls--;if(!this.calls)this.idle();}
 }
 perform=(operation:string,args:Json,context:Context):Promise<Json>=>this.invoke(operation,args,context);
 /** Trusted composition only: product authorizes this existing workspace; native launcher roots revalidate it. */
 importHistory=(operation:string,args:Json,workingDirectory:string):Promise<Json>=>{
  if(!IMPORTS.has(operation))return Promise.reject(Error('Only native history import operations may select an import workspace.'));
  if(typeof workingDirectory!=='string'||!workingDirectory)return Promise.reject(Error('Authorized existing import workspace required.'));
  return this.invoke(operation,args,{clientId:''},workingDirectory);
 };
 private invoke=async(operation:string,args:Json,context:Context,importWorkspace?:string):Promise<Json>=>{
  const scope=this.maintenance.getStore(),permitted=this.held?.phase==='held'&&scope?.active&&scope.fenceId===this.held.context.fenceId&&scope.commandId===this.held.context.commandId&&MAINTENANCE.has(operation);
  if(this.held&&!READS.has(operation)&&!permitted)throw fenced();
  if(this.closed)throw Object.assign(Error('Native administration connection closed; no new request was dispatched. Inspect original receipts; earlier outcomes are unchanged.'),{data:{executed:false,replayed:false,reason:'native-admin-connection-closed',operation}});
  this.calls++;
  try{
   const cwd=importWorkspace??await this.options.resolveWorkspace(context);await this.start();
   if(signInSelectors(operation,args)&&(!validSignInSelectors(args)||!providerSignInMetadata(this.providerSignInMetadata)))throw signInSelectorsUnavailable();
   if(operation.startsWith('generations.')&&this.generationsMetadata?.version!==1)throw Object.assign(Error('Native runtime updates are unavailable for this installation; the trusted launcher must enable them.'),{data:{executed:false,replayed:false,reason:'native-generations-unavailable'}});
   if(['bundle.save','bundle.export','bundle.default'].includes(operation)&&args.commandId!==undefined&&(this.bundleMetadata?.version!==1||this.bundleMetadata?.passiveReceipt!==true))throw Object.assign(Error('Native bundle command identities are unavailable on this configured engine.'),{data:{executed:false,replayed:false,reason:'bundle-command-unavailable'}});
   if(operation==='bundle.receipt'&&(this.bundleMetadata?.version!==1||this.bundleMetadata?.passiveReceipt!==true))throw Object.assign(Error('Native bundle receipts are unavailable on this configured engine.'),{data:{executed:false,replayed:false,reason:'bundle-receipt-unavailable'}});
   if(operation.startsWith('permissions.')){
    if(args.sessionId!==undefined&&args.sessionId!==context.session?.uri||'workspace' in args||'cwd' in args)throw Object.assign(Error('Permission selectors differ from trusted session authority.'),{data:{executed:false,replayed:false,reason:'permissions-authority'}});
    if(!['permissions.get','permissions.save','permissions.receipt'].includes(operation)||!this.permissionsSupported)throw Object.assign(Error('Native scoped file-access settings are unavailable.'),{data:{executed:false,replayed:false,reason:'permissions-unavailable'}});
    if(context.origin==='agent'&&(!context.session?.uri||operation==='permissions.save'&&(args.scope??'global')==='global'))throw Object.assign(Error('Agent file-access changes are restricted to its own session workspace.'),{data:{executed:false,replayed:false,reason:'permissions-authority'}});
   }
   if(operation.startsWith('maintenance.appReset.')&&(!APP_RESETS.has(operation)||this.maintenanceMetadata?.appReset?.version!==1||this.maintenanceMetadata.appReset.retainedUndo!==true))throw Object.assign(Error('Native app-local reset is unavailable on this configured engine.'),{data:{executed:false,replayed:false,reason:'native-app-reset-unavailable'}});
   if(operation.startsWith('maintenance.capture.')&&(!CAPTURES.has(operation)||this.maintenanceMetadata?.captureScope?.version!==1))throw Object.assign(Error('Native continuous capture exclusion is unavailable on this configured engine.'),{data:{executed:false,replayed:false,reason:'native-capture-unavailable'}});
   if(operation.startsWith('maintenance.cache.')&&(!CACHES.has(operation)||this.maintenanceMetadata?.cacheInventory?.version!==1))throw Object.assign(Error('Native cache inspection and reviewed clearing are unavailable on this configured engine.'),{data:{executed:false,replayed:false,reason:'native-cache-unavailable'}});
   if(IMPORTS.has(operation)&&!this.historyImportSupported)throw Object.assign(Error('Native history import is unavailable on this configured engine.'),{data:{executed:false,replayed:false,reason:'history-import-unavailable'}});
   if(['voice.preferences.update','voice.preferences.receipt'].includes(operation)&&!this.voicePreferencesSupported)throw Object.assign(Error('Native shared voice preferences are unavailable on this configured engine.'),{data:{executed:false,replayed:false,reason:'voice-preferences-unavailable'}});
   const {sessionId:_,id,...values}=args;if(id!==undefined)values.id=id;
   if('home' in values||'appHome' in values||'cwd' in values&&!(permitted&&operation==='maintenance.reset.preview'))throw Error('Native administration launch authority cannot be supplied by clients.');
   const authorization=permitted?{fenceId:this.held!.context.fenceId,commandId:this.held!.context.commandId,leaseId:this.held!.leaseId}:undefined;
   return await this.rpc('_amplifier/admin',{cwd,operation,args:values,...(authorization?{_meta:{'amplifier.dev/admin':authorization}}:{})});
  }finally{this.calls--;if(!this.calls)this.idle();}
 };
 /** Trusted composition only, nested inside host.withQuiescenceMaintenance. No ordinary mutation rights. */
 async withMaintenanceFence<T>(input:{fenceId:string;commandId:string},work:()=>Promise<T>):Promise<T>{
  if(this.held?.phase!=='held'||this.held.context.purpose!=='recovery'||this.held.context.fenceId!==input.fenceId||this.held.context.commandId!==input.commandId)throw fenced();
  const scope={...input,active:true};try{return await this.maintenance.run(scope,work);}finally{scope.active=false;}
 }
 async inspectLifecycle():Promise<Json>{
  await this.start();if(!this.lifecycleSupported)return {supported:false};
  const cwd=await this.options.resolveWorkspace({clientId:''});return this.rpc('_amplifier/admin/lifecycle',{cwd,operation:'inspect',args:{}});
 }
 private async acquire(context:Readonly<AdminFenceContext>){
  context={fenceId:context.fenceId,commandId:context.commandId,purpose:context.purpose,instanceId:context.instanceId,dataScope:context.dataScope,...(context.serviceIdentity!==undefined?{serviceIdentity:serviceIdentity(context.serviceIdentity)}:{})};

  for(const key of ['fenceId','commandId','purpose','instanceId','dataScope'] as const)if(typeof context[key]!=='string'||!context[key]||context[key].length>200)throw Error('Exact bounded administration quiescence context required');
  if(!['recovery','distribution-update','service-stop'].includes(context.purpose))throw Error('Unknown administration quiescence purpose');
  if(context.purpose==='service-stop'){if(!context.serviceIdentity||context.serviceIdentity.instanceId!==context.instanceId||context.serviceIdentity.dataScope!==context.dataScope)throw Error('Service identity must bind the administration context');}
  else if(context.serviceIdentity)throw Error('Service identity requires service-stop purpose');
  if(this.held||this.calls||this.closed){
   if(context.purpose==='distribution-update'){
    await this.start();if(!this.admissionAbortSupported)throw Error('Durable Native admission refusal is unavailable');
    const cwd=await this.options.resolveWorkspace({clientId:''});
    const refused=await this.rpc('_amplifier/admin/lifecycle',{cwd,operation:'refuseAdmission',args:{...context}});
    if(refused.acquired!==false||refused.executed!==false||refused.intakeClosed!==false)throw Error('Original Native admission refusal is unconfirmed');
   }
   return null;
  }
  this.held={context:{...context},phase:'checking'};
  try{
   // Passive process startup is necessary to prove no orphan native admin writer
   // still owns the cross-process home gate. This never opens an ACP session.
   await this.start();if(!this.lifecycleSupported||(context.purpose==='service-stop'&&!this.serviceStopSupported)){this.held=undefined;return null;}
   const cwd=await this.options.resolveWorkspace({clientId:''});
   const result=await this.rpc('_amplifier/admin/lifecycle',{cwd,operation:'acquire',args:{...context}});
   if(result.acquired!==true){if(result.executed===false&&result.intakeClosed===false){this.held=undefined;return null;}throw Error('Native administration acquisition is uncertain');}
   if(!result.lease?.leaseId||!result.adminInstanceId||Object.entries(context).some(([key,value])=>key==='serviceIdentity'?!sameIdentity(serviceIdentity(result.lease[key]),value as ServiceIdentity):result.lease[key]!==value))throw Error('Native administration lease does not bind this coordinator fence');
   this.held={context:{...context},phase:'held',leaseId:result.lease.leaseId,adminInstanceId:result.adminInstanceId};
   return {ownerId:this.options.ownerId??'native-admin',fenceId:context.fenceId,release:(outcome:'unchanged'|'ready'|'unknown',proof?:ReleaseProof)=>this.release(context,outcome,proof,true)};
  }catch(error){if(this.held)this.held.phase='unknown';throw error;}
 }
 private async release(context:Readonly<AdminFenceContext>,outcome:'unchanged'|'ready'|'unknown',proof?:ReleaseProof,liveRollback=false){
  const evidence=evidenceKey({context,outcome,proof}),prior=this.releases.get(context.fenceId);if(prior!==undefined){if(prior!==evidence||this.held)throw Error('Administration release receipt binds different evidence or intake');return;}
  const held=this.held;if(!held||held.context.fenceId!==context.fenceId||held.context.commandId!==context.commandId)throw fenced();
  if(['fenceId','commandId','purpose','instanceId','dataScope'].some(key=>(held.context as any)[key]!== (context as any)[key])||(held.context.serviceIdentity&&!sameIdentity(held.context.serviceIdentity,serviceIdentity(context.serviceIdentity))))throw fenced();
  if(outcome==='unknown'){held.phase='unknown';return;}
  if(this.calls)throw fenced();
  const rollback=liveRollback&&held.phase==='held'&&outcome==='unchanged'&&proof&&Object.keys(proof).length===1&&'kind' in proof&&proof.kind==='admission-refused';
  if(!rollback&&context.purpose==='service-stop')validateServiceRelease(context,outcome,proof);
  else if(!rollback){
   const value=proof as AdminReleaseProof|undefined;
   if(!value||value.verified!==true||value.fenceId!==context.fenceId||value.commandId!==context.commandId||value.dataScope!==context.dataScope||value.outcome!==outcome||!value.receiptId||(outcome==='unchanged'&&value.instanceId!==context.instanceId))throw Error('Authenticated exact host release proof required');
  }
  try{
   const cwd=await this.options.resolveWorkspace({clientId:''});
   const result=await this.rpc('_amplifier/admin/lifecycle',{cwd,operation:'release',args:{fenceId:context.fenceId,commandId:context.commandId,leaseId:held.leaseId,outcome,proof}});
   if(result.released!==true||result.intakeClosed!==false||result.lease?.leaseId!==held.leaseId||result.adminInstanceId!==held.adminInstanceId)throw Error('Native administration release is unconfirmed');
   this.releases.set(context.fenceId,evidence);if(this.releases.size>256)this.releases.delete(this.releases.keys().next().value!);this.held=undefined;
  }catch(error){held.phase='unknown';throw error;}
 }
 /** Settle only the original pre-retirement admission; never reacquire it. */
 async abortAdmission(input:Readonly<AdminFenceContext>&{proof:AdminAdmissionAbortProof}):Promise<AdminAdmissionAbortReceipt>{
  const {proof,...context}=input;
  const keys=['commandId','fenceId','instanceId','dataScope','purpose'];
  const bounded=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=200&&!/[\u0000-\u001f]/.test(v);
  if(Object.keys(context).length!==5||keys.some(k=>!bounded((context as any)[k]))||context.purpose!=='distribution-update'||!proof||Object.keys(proof).sort().join(',')!==[...keys,'kind','verified','receiptId'].sort().join(',')||proof.kind!=='distribution-admission-abort'||proof.verified!==true||!bounded(proof.receiptId)||keys.some(k=>(proof as any)[k] !== (context as any)[k]))throw Error('Exact authenticated admission abort proof required');
  const receipt=(result:Json):AdminAdmissionAbortReceipt=>{
   if(Object.keys(result).sort().join(',')!==['ownerId','status','receiptId','commandId','fenceId','instanceId','dataScope'].sort().join(',')||result.ownerId!=='native-admin'||!['released','not-acquired'].includes(result.status)||!bounded(result.receiptId)||['commandId','fenceId','instanceId','dataScope'].some(k=>result[k] !== (context as any)[k]))throw Error('Native admission abort receipt is unconfirmed');
   return {...result,ownerId:this.options.ownerId??'native-admin'} as AdminAdmissionAbortReceipt;
  };
  if(this.admissionPending||this.calls||this.held?.phase==='checking'||(this.held&&keys.some(k=>(this.held!.context as any)[k] !== (context as any)[k]))){
   // Reading a conclusively completed receipt never settles or changes intake.
   // First settlement still requires the original Node accounting to be idle.
   await this.start();if(!this.admissionAbortSupported)throw Error('Durable Native admission abort is unavailable');
   const cwd=await this.options.resolveWorkspace({clientId:''});
   const prior=await this.rpc('_amplifier/admin/lifecycle',{cwd,operation:'admissionReceipt',args:{...context}});
   if(prior.version!==1||prior.state!=='aborted'||evidenceKey(prior.context)!==evidenceKey(context)||evidenceKey(prior.abortProof)!==evidenceKey(proof)||!prior.abortReceipt)throw fenced();
   return receipt(prior.abortReceipt);
  }
  // Fence before passive startup and workspace resolution can yield.
  this.held??={context:{...context},phase:'unknown'};
  this.admissionPending=true;
  try{
   await this.start();if(!this.admissionAbortSupported)throw Error('Durable Native admission abort is unavailable');
   const cwd=await this.options.resolveWorkspace({clientId:''});
   const result=await this.rpc('_amplifier/admin/lifecycle',{cwd,operation:'abortAdmission',args:{...context,proof}});
   const resultReceipt=receipt(result);
   this.held=undefined;
   return resultReceipt;
  }catch(error){if(this.held)this.held.phase='unknown';throw error;}finally{this.admissionPending=false;}
 }
 get quiescenceParticipant(){return {
  id:this.options.ownerId??'native-admin',abortAdmission:(input:Readonly<AdminFenceContext>&{proof:AdminAdmissionAbortProof})=>this.abortAdmission({...Object.fromEntries(['commandId','fenceId','instanceId','dataScope','purpose'].map(key=>[key,(input as any)[key]])) as unknown as AdminFenceContext,proof:input.proof}),serviceStop:{version:1 as const},acquire:(context:Readonly<AdminFenceContext>)=>this.acquire(context),
  reconcileRelease:async(input:Readonly<AdminFenceContext>&{outcome:'unchanged'|'ready';proof:AdminReleaseProof|AdminServiceReleaseProof})=>{
   const {outcome,proof,...context}=input;
   if(context.purpose==='service-stop')validateServiceRelease(context,outcome,proof);
   if(!this.held&&!this.releases.has(context.fenceId)){const lease=await this.acquire(context);if(!lease)throw Error('Replacement admin cannot prove native writer quiescence');}
   await this.release(context,outcome,proof);
  },
 };}
 async close(){this.closed=true;if(this.held)this.held.phase='unknown';if(!this.process||this.process.exitCode!==null||this.process.signalCode!==null)return;this.process.stdin.end();await new Promise<void>(resolve=>{const timer=setTimeout(()=>{this.process?.kill();resolve();},3000);this.process!.once('exit',()=>{clearTimeout(timer);resolve();});});}
}
