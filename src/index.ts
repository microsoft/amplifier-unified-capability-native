import {contextClearCommandId,contextClearRevision,contextClearMetadata,exactContextClearReview,exactContextClearResult,exactContextReceipt,contextClearUnavailable} from './context-clear.js';
import {bundleCommandIds,exactBundleReceipt} from './bundle-commands.js';
import {ACTION_SCHEMAS} from './action-schemas.js';
/** Unified presentation capability owner. No host-private or native-engine imports. */
export type Json=Record<string,any>;
export type Topic='configuration'|'provider-catalog'|'bundles'|'runtime-control';
export interface RecordValue {topic:string;scope:string;revision:number;data:Json;}
export interface Context {clientId:string;origin?:'ui'|'agent';session?:{uri:string;workingDirectory?:string;[key:string]:any};}
export interface Options {
 nativeControl:(session:string,operation:string,args:Json)=>Promise<Json>;
 /** Trusted integration resolves/authorizes workspace; this package never accepts a native path as authority. */
 nativeAdmin?:(operation:string,args:Json,context:Context)=>Promise<Json>;
 /** Passive initialization metadata from the configured engine, never caller capability assertions. */
 nativeBundleCommands?:()=>Promise<Json|undefined>;
 /** Exact selected-session receipt route; must not start a worker or invoke active nativeControl. */
 nativeBundleReceipt?:(session:string,commandId:string)=>Promise<Json>;
 /** Passive actual initialization metadata, never a caller capability assertion. */
 nativeContextClear?:()=>Promise<Json|undefined>;
 /** Host binds canonical native session identity/history cwd without opening a worker. */
 nativeContextReceipt?:(session:string,commandId:string)=>Promise<Json>;
 maxScopes?:number;cacheMs?:number;clock?:()=>number;
 onInvalidate?:(topic:Topic,scope:string)=>void;
}
const METHOD='x-amplifier/capabilityAction' as const;
const TOPICS:Topic[]=['configuration','provider-catalog','bundles','runtime-control'];
const ADMIN:Record<string,Topic>={
 'providers.list':'provider-catalog','providers.schema':'provider-catalog','providers.models':'provider-catalog','providers.test':'provider-catalog','providers.testMessage':'provider-catalog','providers.credentials':'provider-catalog','providers.save':'provider-catalog','providers.remove':'provider-catalog','providers.move':'provider-catalog','providers.reorder':'provider-catalog','providers.finishSetup':'provider-catalog','providers.login':'provider-catalog','providers.loginStatus':'provider-catalog','providers.loginCancel':'provider-catalog',
 'routing.list':'provider-catalog','routing.show':'provider-catalog','routing.save':'provider-catalog','routing.use':'provider-catalog',
 'modules.list':'configuration','modules.save':'configuration','modules.remove':'configuration','modules.validate':'configuration','sources.list':'configuration','sources.save':'configuration','sources.remove':'configuration','sources.validate':'configuration',
 'bundles.list':'bundles','bundles.add':'bundles','bundles.remove':'bundles','bundles.toggle':'bundles','bundles.reorder':'bundles','bundles.move':'bundles','bundle.discover':'bundles','bundle.export':'bundles','bundle.save':'bundles','bundle.default':'bundles','configuration.defaults':'provider-catalog'
};
const READS=new Set(['configuration.inspect','configuration.providers','configuration.providerModels','catalog.inspect','usage.inspect','goals.get','budget.get','mode.list','native.status','task.get','task.receipt','task.history','capacity.get','capabilities','bundle.preview']);
const forbiddenFields=new Set(['__proto__','prototype','constructor']);
function object(value:unknown):Json {if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Expected object arguments.');return value as Json;}
function copy<T>(value:T):T {return structuredClone(value);}
function completeModeList(value:Json):boolean {return typeof value.available==='boolean'&&(value.active===null||typeof value.active==='string')&&Array.isArray(value.modes)&&value.modes.every((row:any)=>row&&typeof row==='object'&&!Array.isArray(row)&&typeof row.name==='string'&&typeof row.description==='string'&&typeof row.source==='string');}
function scopeOf(channel:string) {if(channel==='ahp-root://' || channel==='host')return 'host';if(typeof channel!=='string'||!channel.startsWith('ahp-session:/')||channel.length>8192)throw Error('AHP session scope required.');return channel;}
interface Cached {record:RecordValue;at:number;}
interface ScopeState {records:Map<Topic,Cached>;results:Json;overlays:Partial<Record<Topic,Json>>;version:number;used:number;pending:number;}
/** Records contain only the requested topic, are bounded, and expire independently of native durability. */
export class NativeCapabilities {
 readonly manifest:{version:1;topics:Record<string,{uri:string;version:1;watch:true}>;actions:Record<string,{topic:string;operation:string;method:typeof METHOD}>};
 private bundleNegotiation?:Promise<boolean>;private bundleCommands=false;
 private contextNegotiation?:Promise<boolean>;private contextClear=false;
 private contextAvailability:{state:'unnegotiated'|'ready'|'unsupported'|'unavailable';reason?:string}={state:'unnegotiated'};
 contextClearAvailability=()=>copy(this.contextAvailability);
 /** Trusted root composition awaits this before synchronous manifest registration. */
 negotiateContextClear=async():Promise<boolean>=>{
  if(!this.options.nativeContextClear)return false;
  if(!this.contextNegotiation)this.contextNegotiation=(async()=>{
   let metadata:Json|undefined;
   try{metadata=await this.options.nativeContextClear!();}catch{this.contextAvailability={state:'unavailable',reason:'native-context-negotiation-unavailable'};return false;}
   this.contextClear=contextClearMetadata(metadata)&&typeof this.options.nativeContextReceipt==='function';
   this.contextAvailability={state:this.contextClear?'ready':'unsupported'};
   if(this.contextClear)for(const operation of ['context.clear.review','context.clear','context.clear.receipt'])this.manifest.actions[operation]={topic:'runtime-control',operation,method:METHOD};
   return this.contextClear;
  })();
  return this.contextNegotiation;
 };
 private bundleAvailability:{state:'unnegotiated'|'ready'|'unsupported'|'unavailable';reason?:string}={state:'unnegotiated'};
 /** Availability of this initialized peer, not a permanent statement about its configured name. */
 bundleCommandAvailability=()=>copy(this.bundleAvailability);
 private scopes=new Map<string,ScopeState>();private inflight=new Map<string,Promise<RecordValue>>();private revision=0;
 constructor(private options:Options){
  const actions:Record<string,{topic:string;operation:string;method:typeof METHOD}>={};
  for(const [name,topic] of Object.entries({'runtime.control':'runtime-control','configuration.inspect':'configuration','configuration.apply':'configuration','configuration.toggle':'configuration','configuration.cancel':'configuration','bundle.preview':'bundles','bundle.switch':'bundles'}))actions[name]={topic,operation:name,method:METHOD};
  if(options.nativeAdmin)for(const [name,topic]of Object.entries(ADMIN))actions[name]={topic,operation:name,method:METHOD};
  this.manifest={version:1,topics:Object.fromEntries(TOPICS.map(topic=>[topic,{uri:`amplifier-capability://native/${topic}`,version:1 as const,watch:true as const}])),actions};
 }
 /** Trusted composition awaits this before registering the synchronous manifest. */
 negotiateBundleCommands=async():Promise<boolean>=>{
  if(!this.options.nativeBundleCommands)return false;
  if(!this.bundleNegotiation)this.bundleNegotiation=(async()=>{
   let m:Json|undefined;
   try{m=await this.options.nativeBundleCommands!();}
   catch{
    this.bundleAvailability={state:'unavailable',reason:'native-admin-negotiation-unavailable'};
    // A passive connection failure cannot poison schemas or controls owned by a
    // different healthy engine. This instance's advertisement stays stable;
    // explicit reconstruction after restoration negotiates a fresh connection.
    return false;
   }
   this.bundleCommands=m?.version===1&&m.commandId==='optional-legacy-required-for-receipt'&&m.passiveReceipt===true&&m.replayUnknown===false&&m.maxResultBytes===524288&&m.adminReceipt==='bundle.receipt'&&m.activationReceipt==='_amplifier/bundle/receipt'&&m.activation==='bundle.switch'&&['bundle.save','bundle.export','bundle.default'].every(op=>m.adminOperations?.includes(op));
   this.bundleAvailability={state:this.bundleCommands?'ready':'unsupported'};
   if(this.bundleCommands&&this.options.nativeAdmin&&this.options.nativeBundleReceipt)this.manifest.actions['bundle.receipt']={topic:'bundles',operation:'bundle.receipt',method:METHOD};
   return this.bundleCommands;
  })();
  return this.bundleNegotiation;
 };
 actionSchemas=async()=>{await this.negotiateBundleCommands();await this.negotiateContextClear();return Object.fromEntries(Object.keys(this.manifest.actions).map(name=>{const value=ACTION_SCHEMAS[name];if(!value)throw Error(`Missing public native action schema: ${name}`);return [name,copy(value)];}));};
 private now(){return(this.options.clock??Date.now)();}
 private state(scope:string){
  let value=this.scopes.get(scope);if(!value){
   const max=this.options.maxScopes??32;
   if(this.scopes.size>=max){const oldest=[...this.scopes].filter(([,s])=>!s.pending).sort((a,b)=>a[1].used-b[1].used)[0];if(!oldest)throw Error('Native capability scope capacity reached.');this.scopes.delete(oldest[0]);}
   value={records:new Map(),results:{},overlays:{},version:0,used:this.now(),pending:0};this.scopes.set(scope,value);
  }value.used=this.now();return value;
 }
 private record(scope:string,topic:Topic,data:Json,state:ScopeState):RecordValue {
  if(Buffer.byteLength(JSON.stringify(data))>768*1024)throw Error('Native capability record exceeds bounded topic size.');
  const record={topic,scope,revision:++this.revision,data:copy(data)};state.records.set(topic,{record,at:this.now()});return copy(record);
 }
 private async native(scope:string,operation:string,args:Json={}) {if(scope==='host')throw Error('Select an Amplifier session for runtime controls.');return this.options.nativeControl(scope,operation,args);}
 private runtime(scope:string,s:ScopeState,result?:Json){return {runtimeControl:{[scope]:{...s.results,...result}}};}
 private async load(topic:Topic,scope:string,context:Context,s:ScopeState):Promise<Json>{
  await this.negotiateBundleCommands();
  if(this.bundleAvailability.state==='unavailable'&&(topic==='bundles'||topic==='provider-catalog'||topic==='configuration'&&scope==='host'))return {nativeAdministration:copy(this.bundleAvailability)};
  if(topic==='configuration'){
   if(scope!=='host'){const value=await this.native(scope,'configuration.inspect');const {registry,...overlay}=s.overlays.configuration??{};return {configuration:{sessionId:scope,...overlay,...value},configurationRevision:s.version,...(registry?{registry}:{})};}
   if(!this.options.nativeAdmin)throw Error('This host has no native administration capability.');
   return {registry:{...await this.options.nativeAdmin('modules.list',{},context),...(s.overlays.configuration?.registry??{})},configurationRevision:s.version};
  }
  if(topic==='provider-catalog'){
   if(!this.options.nativeAdmin&&scope!=='host'){const value=await this.native(scope,'configuration.providers');s.results['configuration.providers']=value;return {setup:{...value,...s.overlays['provider-catalog']}};}
   if(!this.options.nativeAdmin)throw Error('This host has no native administration capability.');
   const setup={...s.overlays['provider-catalog'],...await this.options.nativeAdmin('providers.list',{},context)};s.overlays['provider-catalog']=setup;return {setup};
  }
  if(topic==='bundles'){
   if(!this.options.nativeAdmin)throw Error('This host has no native bundle catalog administration capability.');
   const value=await this.options.nativeAdmin('bundles.list',{},context);
   return {...Object.fromEntries(['bundles','registeredBundles','bundleDefaults','bundleOptions'].filter(k=>k in value).map(k=>[k,value[k]])),...s.overlays.bundles};
  }
  const value=await this.native(scope,'catalog.inspect');s.results['catalog.inspect']=value;return this.runtime(scope,s);
 }
 read=async(request:{uri:string;topic:string;scope:string;clientId:string}):Promise<RecordValue>=>{
  if(!TOPICS.includes(request.topic as Topic))throw Error('Unknown native capability topic.');const topic=request.topic as Topic,scope=scopeOf(request.scope),s=this.state(scope);
  const cached=s.records.get(topic);if(cached&&this.now()-cached.at<(this.options.cacheMs??15000))return copy(cached.record);
  const key=JSON.stringify([scope,topic]);if(this.inflight.has(key))return copy(await this.inflight.get(key)!);
  const pending=(async()=>{s.pending++;try{const before=s.version;const data=await this.load(topic,scope,{clientId:request.clientId,session:scope==='host'?undefined:{uri:scope}},s);if(before!==s.version)throw Error('Native configuration changed during this read; refresh the panel.');return this.record(scope,topic,data,s);}finally{s.pending--;this.inflight.delete(key);}})();
  this.inflight.set(key,pending);return copy(await pending);
 };
 /** Invalidate after a known authoritative native commit/event; never starts an eager read. */
 invalidate(scope:string,topics:Topic[]=TOPICS){const s=this.scopes.get(scopeOf(scope));if(!s)return;s.version++;for(const topic of topics){s.records.delete(topic);this.options.onInvalidate?.(topic,scope);}}
 action=async(request:Json,context:Context):Promise<{accepted:boolean;updates:RecordValue[];invalidate:string[];result:Json;_meta:Json}>=>{
  const scope=scopeOf(request.channel),args=object(request.args??{}),s=this.state(scope),topic=request.topic as Topic;
  if(request.version!==1||!TOPICS.includes(topic)||typeof request.commandId!=='string'||!request.commandId)throw Error('Valid capability version and command identity required.');
  if(scope!=='host'&&context.session?.uri!==scope)throw Error('Authenticated session context must match the requested scope.');
  if(args.sessionId&&args.sessionId!==scope)throw Error('Session selector disagrees with authenticated scope.');
  await this.negotiateBundleCommands();await this.negotiateContextClear();
  if(['context.clear.review','context.clear','context.clear.receipt'].includes(request.operation)&&!this.contextClear)throw contextClearUnavailable();
  const advertised=Object.values(this.manifest.actions).find(row=>row.operation===request.operation&&row.topic===topic);if(!advertised)throw Error('Native action not advertised.');
  if(['context.clear.review','context.clear','context.clear.receipt'].includes(request.operation)){
   if(scope==='host')throw contextClearUnavailable('Select an admitted native session for context clearing.');
   const operation=request.operation,meta={'amplifier.dev/operation':{id:request.commandId}};
   if(operation==='context.clear.receipt'){
    if(Object.keys(args).some(k=>k!=='commandId'))throw Error('Exact original context command identity required.');
    const commandId=contextClearCommandId(scope,args.commandId);
    const receipt=exactContextReceipt(await this.options.nativeContextReceipt!(scope,commandId),commandId);
    return {accepted:true,updates:[],invalidate:[],result:{commandId:args.commandId,operation:'context.clear',receipt},_meta:meta};
   }
   let nativeArgs:Json={};
   if(operation==='context.clear.review'){if(Object.keys(args).length)throw Error('Context clear review takes no arguments.');}
   else{
    if(Object.keys(args).some(k=>!['expectedHistoryRevision','expectedControlRevision'].includes(k))||!contextClearRevision(args.expectedHistoryRevision)||!contextClearRevision(args.expectedControlRevision))throw Error('Exact reviewed history and control revisions required.');
    nativeArgs={...args,commandId:contextClearCommandId(scope,request.commandId)};
   }
   s.pending++;
   try{
    const raw=await this.native(scope,operation,nativeArgs);
    const result=operation==='context.clear.review'?exactContextClearReview(raw):exactContextClearResult(raw);
    s.results[operation]=copy(result);
    if(operation==='context.clear'){delete s.results['context.clear.review'];delete s.results['goals.get'];delete s.results['goals.set'];delete s.results['goals.clear'];this.invalidate(scope);}
    const updates=[this.record(scope,'runtime-control',this.runtime(scope,s),s)];
    return {accepted:true,updates,invalidate:operation==='context.clear'?TOPICS.filter(t=>t!=='runtime-control'):[],result,_meta:meta};
   }finally{s.pending--;}
  }
  if(request.operation==='bundle.receipt'){
   const original=args.operation,ids=bundleCommandIds(scope,original,args.commandId);
   if(original==='bundle.switch'&&scope==='host')throw Error('Selected session required for activation receipt.');
   const receipts:Json={};
   const inspect=async(effect:string,id:string,activation:boolean)=>{
    const value=activation?await this.options.nativeBundleReceipt!(scope,id):await this.options.nativeAdmin!('bundle.receipt',{commandId:id},context);
    return exactBundleReceipt(value,effect,id);
   };
   receipts.command=await inspect(original,ids.commandId,original==='bundle.switch');
   if(ids.activationCommandId)receipts.activation=await inspect('bundle.switch',ids.activationCommandId,true);
   return {accepted:true,updates:[],invalidate:[],result:{commandId:args.commandId,operation:original,receipts},_meta:{'amplifier.dev/operation':{id:request.commandId}}};
  }
  let op=request.operation,arguments_=args,result:Json;
  s.pending++;
  try {
   if(op==='runtime.control'){op=args.operation;arguments_=object(args.args??{});if(typeof op!=='string'||forbiddenFields.has(op))throw Error('Native operation required.');
    if(['context.clear','context.clear.review','context.clear.receipt','history.edit','history.revise','steer','steer.submit','session.relocate'].includes(op)||['question.','schedule.','observation.','memory.','operations.','kernels.'].some(prefix=>op.startsWith(prefix)))throw Error('Use the admitted capability owned by this operation; generic native controls cannot bypass its lifecycle or receipts.');
    if(op==='tool.invoke')arguments_={...arguments_,actor:context.origin??'ui'};
   }else{const {sessionId:_selector,...values}=arguments_;arguments_=values;}
   if(request.operation==='runtime.control'||['configuration.inspect','configuration.apply','configuration.toggle','configuration.cancel','bundle.preview','bundle.switch'].includes(op)){
    const caps=await this.native(scope,'capabilities');if(![...(caps.controls??[]),'capabilities',...(caps.workerOperations??[]),'steer'].includes(op))throw Error(`The connected agent does not support ${op}.`);
    if(op==='configuration.apply'&&!/^[a-f0-9]{64}$/.test(arguments_.expectedConfigurationRevision??''))return {accepted:false,updates:[],invalidate:[],result:{applied:false,executed:false,reason:'configuration-revision-required',message:'Inspect and review the current mount plan before applying a configuration draft.'},_meta:{'amplifier.dev/operation':{id:request.commandId}}};
    if(op==='bundle.switch'&&this.bundleCommands)arguments_={...arguments_,commandId:bundleCommandIds(scope,op,request.commandId).commandId};
    if(op==='configuration.apply'||['task.create','task.update','task.pause','task.resume','task.block','task.complete'].includes(op))arguments_={...arguments_,commandId:request.commandId};
    try{result=await this.native(scope,op,arguments_);}catch(error){
     const data=(error as {data?:Json}).data;
     if(op.startsWith('task.')&&data?.reason==='task-preflight-refused'&&data.executed===false)return {accepted:false,updates:[],invalidate:[],result:{applied:false,executed:false,replayed:false,reason:data.reason,message:(error as Error).message},_meta:{'amplifier.dev/operation':{id:request.commandId}}};
     if(op==='configuration.apply'&&data?.reason==='configuration-conflict'&&data.executed===false){
      this.invalidate(scope,['configuration']);
      return {accepted:false,updates:[],invalidate:['configuration'],result:{applied:false,executed:false,replayed:false,reason:'configuration-conflict',configurationRevision:data.configurationRevision,message:(error as Error).message},_meta:{'amplifier.dev/operation':{id:request.commandId}}};
     }
     throw error;
    }
    s.results[op]=result;
    if(['provider.select','provider.reset','configuration.apply','bundle.switch'].includes(op)&&!result.cancelled&&!result.requiresModelChoice){
     // Refresh only this selected runtime after its confirmed mutation. A failed
     // read cannot make the completed mutation unknown or leave stale truth.
     delete s.results['configuration.providers'];
     try{s.results['configuration.providers']=await this.native(scope,'configuration.providers');}catch{s.results['configuration.providers']={available:false,reason:'refresh-unavailable'};}
    }
    if(op==='mode.set'||op==='mode.clear'){
     // Native mode mutations return a full list after checkpoint. Keep that
     // authoritative projection while preserving the original action result.
     // A partial peer response cannot replace a complete catalog or leave its
     // old active mode visible; refresh only this selected runtime, never retry.
     if(completeModeList(result))s.results['mode.list']=copy(result);
     else{
      delete s.results['mode.list'];
      try{const modes=await this.native(scope,'mode.list');if(!completeModeList(modes))throw Error('Incomplete mode list');s.results['mode.list']=modes;}
      catch{s.results['mode.list']={available:false,reason:'refresh-unavailable'};}
     }
    }
    if(op.startsWith('goals.'))s.results['goals.get']=result;if(op==='budget.set')s.results['budget.get']=result;if(op.startsWith('task.')&&!['task.receipt','task.history'].includes(op))s.results['task.get']=result;if(op.startsWith('capacity.'))s.results['capacity.get']=result;
    if(op==='configuration.providers')s.overlays['provider-catalog']={...(s.overlays['provider-catalog']??{})};
    if(op==='configuration.providerModels'){const id=String(result.provider);s.results.modelCatalogs={...(s.results.modelCatalogs??{}),[id]:{...result,phase:'ready'}};}
    if(op==='bundle.preview')s.overlays.configuration={...(s.overlays.configuration??{}),bundlePreview:result};
    if(op==='bundle.switch')s.overlays.configuration={...(s.overlays.configuration??{}),...(result.requiresModelChoice?{bundlePreview:result.preview}:{}),bundleChange:{phase:result.requiresModelChoice?'needs-model':'ready',action:'bundle.switch'},...(result.bundle?{bundle:result.bundle}:{}),...(result.configuration??{})};
   }else{
    if(!this.options.nativeAdmin)throw Error('Native administration unavailable.');
    if(this.bundleCommands&&['bundle.save','bundle.export','bundle.default'].includes(op))arguments_={...arguments_,commandId:bundleCommandIds(scope,op,request.commandId).commandId};
    // The injected owner resolves context; args.workspace is only a requested selector.
    if(['bundle.export','bundle.save'].includes(op)&&scope!=='host'){const config=await this.native(scope,'configuration.inspect');arguments_={...arguments_,effectiveConfig:config.plan,rootBundle:config.bundle,resources:await this.native(scope,'configuration.exportResources')};}
    if(['providers.login','providers.loginStatus','providers.loginCancel'].includes(op)&&scope!=='host'){
     const providers=await this.options.nativeAdmin('providers.list',{},context);const selected=providers.providers?.find((row:Json)=>row.id===args.id);
     if(selected&&selected.module!=='provider-openai-chatgpt'){const operation=op==='providers.login'?'configuration.providerLogin':op==='providers.loginStatus'?'configuration.providerLoginStatus':'configuration.providerLoginCancel';const login=await this.native(scope,operation,{provider:args.id,...(args.restart?{restart:true}:{})});result={providerId:args.id,login:{...login,providerId:args.id}};}
     else result=await this.options.nativeAdmin(op,arguments_,context);
    }else result=await this.options.nativeAdmin(op,arguments_,context);
    if(topic==='provider-catalog'){
     const overlay=s.overlays[topic]??{};
     if(result.modelsProviderId){const id=String(result.modelsProviderId);overlay.providerCatalogs={...(overlay.providerCatalogs??{}),[id]:{models:result.models,metadata:result.providerMetadata,phase:'ready'}};}
     if(result.modelsProviderId)overlay.modelCatalogs={...(overlay.modelCatalogs??{}),[result.modelsProviderId]:result.models};
     if(result.providerMetadata)overlay.metadata={...(overlay.metadata??{}),[result.providerMetadata.module]:result.providerMetadata};
     if(result.messageTest)overlay.messageTests={...(overlay.messageTests??{}),[args.id]:result.messageTest};
     const operationKey=op+':'+(['providers.credentials','providers.schema'].includes(op)?args.module:args.id??'');
     overlay.operations={...(overlay.operations??{}),[operationKey]:{commandId:request.commandId,phase:'ready',action:op,id:args.id??args.module??''}};
     while(Object.keys(overlay.operations).length>64)delete overlay.operations[Object.keys(overlay.operations)[0]];
     Object.assign(overlay,result);s.overlays[topic]=overlay;
    }
    if(op==='bundle.save'&&scope!=='host'&&result.saved?.name){
     // Saving and activation are distinct effects. A settled save must stay
     // inspectable even when activation needs input or loses its reply.
     let activated:Json;
     try{activated=await this.native(scope,'bundle.switch',{bundle:result.saved.name,...(this.bundleCommands?{commandId:bundleCommandIds(scope,'bundle.save',request.commandId).activationCommandId}:{})});}
     catch(error){const data=(error as {data?:Json}).data;activated=data?.executed===false
      ?{state:'failed',executed:false,reason:data.reason??'activation-refused'}
      :{state:'unknown',reason:'activation-outcome-unknown'};}
     result={...result,activation:activated};
     const phase=activated.requiresModelChoice?'needs-model':activated.state==='unknown'?'unknown':activated.state==='failed'?'error':'ready';
     s.overlays.configuration={...(phase==='unknown'?{}:s.overlays.configuration??{}),...(phase==='ready'?{...activated.configuration,...(activated.bundle?{bundle:activated.bundle}:{})}:{}),...(activated.requiresModelChoice?{bundlePreview:activated.preview}:{}),bundleChange:{phase,action:op}};
     if(phase==='unknown')s.results['configuration.providers']={available:false,reason:'activation-outcome-unknown'};
     if(phase==='ready'){
      delete s.results['configuration.providers'];
      try{s.results['configuration.providers']=await this.native(scope,'configuration.providers');}catch{s.results['configuration.providers']={available:false,reason:'refresh-unavailable'};}
     }
    }
    if(topic==='configuration')s.overlays.configuration={...(s.overlays.configuration??{}),registry:{...(s.overlays.configuration?.registry??{}),...result}};
    if(topic==='bundles')s.overlays.bundles={...(s.overlays.bundles??{}),...Object.fromEntries(['bundles','registeredBundles','bundleDefaults'].filter(k=>k in result).map(k=>[k,result[k]])),...(result.discovery?{bundleDiscovery:result.discovery}:{})};
   }
   const changed=!result.cancelled&&!READS.has(op)&&!(op.endsWith('.list')||op.endsWith('.models')||op.endsWith('.show')||op.endsWith('.schema')||op.endsWith('.loginStatus'));
   const invalidates:Topic[]=changed?[...TOPICS]:[];
   if(changed){if(ADMIN[op]){for(const key of this.scopes.keys())this.invalidate(key,invalidates);}else this.invalidate(scope,invalidates);}
   const updates:RecordValue[]=[];
   if(scope!=='host')updates.push(this.record(scope,'runtime-control',this.runtime(scope,s),s));
   if(!result.cancelled&&(op==='configuration.inspect'||op==='configuration.apply'||op==='configuration.toggle'||op==='bundle.preview'||op==='bundle.switch')){
    const configuration=op==='configuration.inspect'||op==='configuration.toggle'?result:op==='configuration.apply'?result.configuration:result.configuration;
    updates.push(this.record(scope,'configuration',{configuration:{sessionId:scope,...s.overlays.configuration,...(configuration??{})},configurationRevision:s.version},s));
   }
   if(topic==='provider-catalog'&&s.overlays[topic]){const data:Json={setup:s.overlays[topic]};if(op==='configuration.defaults'){const key=JSON.stringify([args.workspace??context.session?.workingDirectory??'',args.bundle??'']);data.draftDefaults={[key]:result};}updates.push(this.record(scope,topic,data,s));}
   if(topic==='configuration'&&s.overlays.configuration?.registry)updates.push(this.record(scope,topic,{registry:s.overlays.configuration.registry,configurationRevision:s.version},s));
   if(op==='bundle.save'&&s.overlays.configuration)updates.push(this.record(scope,'configuration',{configuration:{sessionId:scope,...s.overlays.configuration},configurationRevision:s.version},s));
   if(topic==='bundles'&&s.overlays.bundles)updates.push(this.record(scope,topic,s.overlays.bundles,s));
   return {accepted:true,updates,invalidate:invalidates.filter(t=>!updates.some(u=>u.topic===t)),result:copy(result),_meta:{'amplifier.dev/operation':{id:request.commandId}}};
  }catch(error){
   // An authoritative no-effect proof is a refusal, not a lost result. Never
   // infer that proof from an RPC code/message or contradict an unknown outcome.
   const data=(error as {data?:Json}).data;
   if(['bundle.switch','bundle.save','bundle.export','bundle.default','provider.select','provider.reset'].includes(op)&&data&&typeof data==='object'&&!Array.isArray(data)&&data.executed===false&&data.outcome!=='unknown'&&data.applied!==true){
    return {accepted:false,updates:[],invalidate:[],result:{applied:false,...copy(data),message:(error as Error).message},_meta:{'amplifier.dev/operation':{id:request.commandId}}};
   }
   throw error;
  }finally{s.pending--;}
 };
}
export function createNativeCapabilities(options:Options){return new NativeCapabilities(options);}
export {AdminConnection,type AdminOptions,type AdminFenceContext,type AdminReleaseProof,type AdminServiceReleaseProof} from './admin.js';
export type {ServiceIdentity,ServiceReleaseFields} from './service-lifecycle.js';

export {PermissionsCapabilities,createPermissionsCapabilities,PERMISSION_ACTION_SCHEMAS,type PermissionsOptions} from './permissions.js';
