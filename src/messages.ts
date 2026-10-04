/** Optional account-bound passive native message metadata. No session/worker admission. */
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {Readable,Writable,Transform} from 'node:stream';
import {ClientSideConnection,ndJsonStream} from '@agentclientprotocol/sdk';
import type {Context,Json,RecordValue} from './index.js';
import {validateServiceRelease,serviceIdentity} from './service-lifecycle.js';
import type {AdminFenceContext,AdminReleaseProof,AdminServiceReleaseProof} from './admin.js';
const KEY='amplifier.dev/messagePrincipal',EMOJI=['👍','❤️','😂','🎉','😮','😢','👎','✅'];
const refused=(message:string)=>Object.assign(Error(message),{data:{executed:false,replayed:false,reason:'message-authority-unavailable'}});
const token=(value:unknown,max=200):value is string=>typeof value==='string'&&[...value].length>0&&[...value].length<=max&&!/[\x00-\x1f]/.test(value);
const object=(v:unknown):v is Json=>!!v&&typeof v==='object'&&!Array.isArray(v);
export interface MessageOptions {
 command:string;args?:string[];env?:Record<string,string>;cwd:string;
 /** Server-composed gateway account, never actorId/clientId or user parameters. */
 account:string;
 /** Host-authorized immutable native ID and canonical history cwd. */
 resolveSession:(context:Context)=>Promise<{uri:string;nativeSessionId:string;workingDirectory:string}>;
 timeoutMs?:number;initializationTimeoutMs?:number;
 ownerId?:string;onMayBeIdle?:()=>void;
 onInvalidate?:(topic:'message-metadata',scope:string)=>void;
}
export class MessageConnection {
 private process?:ChildProcessWithoutNullStreams;private client?:ClientSideConnection;private starting?:Promise<boolean>;private closed=false;
 private metadata?:Json;private calls=0;private held?:Readonly<AdminFenceContext>;private uncertain=false;
 private bindings=new Map<string,{scope:string;cwd:string;work:Promise<void>}>();
 private scopes=new Map<string,{scope:string;cwd:string}>();private listeners=new Set<(scope:string,value:Json)=>void>();
 constructor(private options:MessageOptions){
  if(!token(options.account,512))throw refused('A trusted bounded account is required');
  for(const [value,max]of [[options.timeoutMs??10000,120000],[options.initializationTimeoutMs??2000,10000]])if(!Number.isSafeInteger(value)||value<1||value>max)throw refused('Bounded message deadlines must be configured before dispatch');
  if(options.ownerId!==undefined&&!token(options.ownerId))throw refused('Bounded message owner identity required');
  this.options={...options,args:options.args?[...options.args]:undefined,env:options.env?{...options.env}:undefined};
 }
 onUpdate(listener:(scope:string,value:Json)=>void){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
 private authority(context:Context){if(context.account!==this.options.account||!context.session?.uri?.startsWith('ahp-session:/'))throw refused('Authenticated account and selected session required');}
 capabilities=async():Promise<Json|undefined>=>this.tracked(async()=>await this.start()?structuredClone(this.metadata):undefined);
 activity=()=>({calls:this.calls,intakeClosed:!!this.held||this.uncertain||this.closed,uncertain:this.uncertain,closed:this.closed});
 private async tracked<T>(work:()=>Promise<T>):Promise<T>{if(this.held||this.uncertain)throw refused('Message intake is fenced; no new native request dispatched');this.calls++;try{return await work();}finally{this.calls--;if(!this.calls)try{this.options.onMayBeIdle?.();}catch{/* Advisory only. */}}}
 get quiescenceParticipant(){return{id:this.options.ownerId??'native-message-metadata',serviceStop:{version:1 as const},acquire:async(context:Readonly<AdminFenceContext>)=>{
  if(this.calls||this.uncertain||this.closed||this.held)return null;
  for(const key of ['fenceId','commandId','purpose','instanceId','dataScope'] as const)if(!token(context[key]))throw refused('Exact bounded message fence required');
  if(!['recovery','distribution-update','service-stop'].includes(context.purpose))throw refused('Unsupported message fence purpose');
  if(context.purpose==='service-stop'){const identity=serviceIdentity(context.serviceIdentity);if(identity.instanceId!==context.instanceId||identity.dataScope!==context.dataScope)throw refused('Message service identity differs');}
  this.held=structuredClone(context);const held=this.held;return{ownerId:this.options.ownerId??'native-message-metadata',fenceId:held.fenceId,release:async(outcome:'unchanged'|'ready'|'unknown',proof?:AdminReleaseProof|AdminServiceReleaseProof|{kind:'admission-refused'})=>{
   if(this.held!==held||this.calls)throw refused('Message fence identity changed');if(outcome==='unknown'){this.uncertain=true;return;}
   const rollback=outcome==='unchanged'&&proof&&Object.keys(proof).length===1&&'kind'in proof&&proof.kind==='admission-refused';
   if(!rollback){if(held.purpose==='service-stop')validateServiceRelease(held,outcome,proof);else{const p=proof as AdminReleaseProof|undefined;if(!p||p.verified!==true||p.fenceId!==held.fenceId||p.commandId!==held.commandId||p.dataScope!==held.dataScope||p.outcome!==outcome||!token(p.receiptId)||outcome==='unchanged'&&p.instanceId!==held.instanceId)throw refused('Authenticated exact message release proof required');}}
   this.held=undefined;this.uncertain=false;
  }};
 }};}
 describe=async(context:Context):Promise<Json>=>{
  this.authority(context);const selected=await this.options.resolveSession(context);
  if(selected.uri!==context.session!.uri||!token(selected.nativeSessionId)||typeof selected.workingDirectory!=='string'||!selected.workingDirectory.startsWith('/'))throw refused('Trusted canonical native session binding required');
  const m=this.metadata;return{quote:m?.version===1&&m.quoteMeta==='amplifier.dev/messageReply'&&m.privateReplySelection===true&&m.maxQuoteChars===4000?{available:true,referenceMeta:'amplifier.dev/history.messageReference',maxChars:4000}:{available:false}};
 };
 authorizeAccount(account:unknown){if(account!==this.options.account)throw refused('Server-composed message account required');}
 private start():Promise<boolean>{
  if(this.closed)return Promise.reject(refused('Passive message connection closed; inspect receipts before any new work'));
  return this.starting??=(async()=>{
   const p=this.process=spawn(this.options.command,this.options.args??[],{cwd:this.options.cwd,env:{...process.env,...this.options.env},stdio:'pipe'});
   p.stderr.resume();p.on('error',()=>{this.closed=true;});p.on('exit',()=>{this.closed=true;});
   let bytes=0;const guard=new Transform({transform(chunk:Buffer,_encoding,callback){for(const b of chunk){bytes=b===10?0:bytes+1;if(bytes>2*1024*1024)return callback(Error('Native message frame exceeds bound'));}callback(null,chunk);}});guard.on('error',()=>p.kill());p.stdout.pipe(guard);
   this.client=new ClientSideConnection(()=>({sessionUpdate:async()=>{throw Error('Passive messages cannot own session updates');},requestPermission:async()=>({outcome:{outcome:'cancelled' as const}}),extNotification:async(method,params)=>{
    if(method!=='_amplifier/message/update')return;const bound=this.scopes.get(String(params.sessionId));if(!bound||!token(params.messageId)||!Number.isSafeInteger(params.revision)||(params.revision as number)<0||Buffer.byteLength(JSON.stringify(params))>32768)return;
    for(const listener of this.listeners)try{listener(bound.scope,structuredClone(params));}catch{/* Projection cannot alter native outcomes. */}
   }}),ndJsonStream(Writable.toWeb(p.stdin) as WritableStream<Uint8Array>,Readable.toWeb(guard) as ReadableStream<Uint8Array>));
   const initialized=await this.deadline(this.client.initialize({protocolVersion:1,clientInfo:{name:'amplifier-unified-message-metadata',version:'0.1.0'},clientCapabilities:{_meta:{'amplifier.dev/native':{version:1},[KEY]:{version:1,account:this.options.account}}}}),this.options.initializationTimeoutMs??2000);
   const native=initialized.agentCapabilities?._meta?.['amplifier.dev/native'] as Json|undefined,m=native?.messageInteractions;
   const supported=initialized.protocolVersion===1&&native?.version===1&&m?.version===1&&Array.isArray(m.methods)&&['reaction','read','receipt'].every(v=>m.methods.includes(v));
   if(supported)this.metadata=structuredClone(m);return supported;
  })();
 }
 private async deadline<T>(work:Promise<T>,ms:number,mutation=false):Promise<T>{
  if(!Number.isSafeInteger(ms)||ms<1||ms>120000)throw refused('Bounded native message deadline required');let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{this.uncertain=this.uncertain||mutation;this.closed=true;this.process?.stdin.end();this.process?.kill();reject(Error('Native message response timed out; outcome unknown and no command replayed'));},ms);})]);}catch(error){const data=(error as {data?:Json})?.data;if(mutation&&!(object(data)&&data.executed===false&&data.outcome!=='unknown'&&data.applied!==true))this.uncertain=true;throw error;}finally{clearTimeout(timer);}
 }
 perform=async(operation:'reaction'|'read'|'receipt',args:Json,context:Context):Promise<Json>=>this.tracked(async()=>{
  this.authority(context);if(!await this.start())throw refused('Configured peer does not negotiate message metadata');
  const selected=await this.options.resolveSession(context);if(selected.uri!==context.session!.uri||!token(selected.nativeSessionId)||typeof selected.workingDirectory!=='string'||!selected.workingDirectory.startsWith('/'))throw refused('Trusted canonical native session binding required');
  const old=this.scopes.get(selected.nativeSessionId);if(old&&(old.scope!==selected.uri||old.cwd!==selected.workingDirectory))throw refused('Original message scope changed; preserve its receipts');
  const pending=this.bindings.get(selected.nativeSessionId);
  if(pending&&(pending.scope!==selected.uri||pending.cwd!==selected.workingDirectory))throw refused('Concurrent message binding differs from original scope');
  // Original account-bound receipts do not depend on present canonical history.
  if(operation==='receipt')return this.deadline(this.client!.extMethod('_amplifier/message/receipt',{...args,sessionId:selected.nativeSessionId}),this.options.timeoutMs??10000);
  if(!old){
   if(pending)await pending.work;
   else{if(this.scopes.size+this.bindings.size>=128)throw refused('Passive message scope bound exceeded');
    const work=(async()=>{await this.deadline(this.client!.extMethod('_amplifier/history',{sessionId:selected.nativeSessionId,cwd:selected.workingDirectory,limit:1}),this.options.timeoutMs??10000);this.scopes.set(selected.nativeSessionId,{scope:selected.uri,cwd:selected.workingDirectory});})();
    this.bindings.set(selected.nativeSessionId,{scope:selected.uri,cwd:selected.workingDirectory,work});try{await work;}finally{this.bindings.delete(selected.nativeSessionId);}
   }
  }
  if(operation==='reaction'&&args.reference?.sessionId!==selected.nativeSessionId)throw refused('Message reference belongs to another native session');
  return this.deadline(this.client!.extMethod('_amplifier/message/'+operation,{...args,sessionId:selected.nativeSessionId}),this.options.timeoutMs??10000,operation==='reaction');
 });
 async close(){if(this.calls||this.uncertain)throw Error('Message requests remain in flight or uncertain; preserve the connection and inspect original receipts');this.closed=true;this.listeners.clear();this.process?.stdin.end();this.process?.kill();}
}
const id={type:'string',minLength:1,maxLength:200},reference={type:'object',properties:{sessionId:id,messageId:id,position:{type:'integer',minimum:0},historyEpoch:{type:['string','null']},sourceDigest:{type:'string',pattern:'^[a-f0-9]{64}$'}},required:['sessionId','messageId','position','historyEpoch'],additionalProperties:false};
export const MESSAGE_ACTION_SCHEMAS={
 'message.reaction':{description:'Set the account reaction on one exact native message without sending a turn',schema:{type:'object',properties:{reference,emoji:{enum:EMOJI},present:{type:'boolean'}},required:['reference','emoji','present'],additionalProperties:false}},
 'message.read':{description:'Read metadata for at most 50 explicitly selected messages',schema:{type:'object',properties:{messageIds:{type:'array',minItems:1,maxItems:50,items:id}},required:['messageIds'],additionalProperties:false}},
 'message.receipt':{description:'Inspect the original message command without replay',schema:{type:'object',properties:{commandId:id},required:['commandId'],additionalProperties:false}},
};
export class MessageCapabilities {
 readonly manifest:{version:1;topics:Json;actions:Json}={version:1,topics:{},actions:{}};
 readonly quiescenceAccess={'message.read':'read' as const,'message.receipt':'read' as const};private ready=false;private records=new Map<string,RecordValue>();private revision=0;
 get quiescenceParticipant(){return this.connection.quiescenceParticipant;}
 activity=()=>this.connection.activity();
 close=()=>this.connection.close();
 constructor(private connection:MessageConnection,private onInvalidate?:MessageOptions['onInvalidate']){connection.onUpdate((scope,value)=>this.changed(scope,value));}
 private changed(scope:string,value:Json){const old=this.records.get(scope)?.data.changedMessage;if(old?.messageId===value.messageId&&old.revision>=value.revision)return;
  this.records.delete(scope);this.records.set(scope,{topic:'message-metadata',scope,revision:++this.revision,data:{available:true,changedMessage:structuredClone(value)}});while(this.records.size>32)this.records.delete(this.records.keys().next().value!);try{this.onInvalidate?.('message-metadata',scope);}catch{/* Advisory only. */}
 }
 negotiate=async()=>{try{this.ready=!!await this.connection.capabilities();}catch{this.ready=false;}if(this.ready){this.manifest.topics['message-metadata']={uri:'amplifier-capability://native/message-metadata',version:1,watch:true};for(const operation of Object.keys(MESSAGE_ACTION_SCHEMAS))this.manifest.actions[operation]={topic:'message-metadata',operation,method:'x-amplifier/capabilityAction'};}return this.ready;};
 actionSchemas=async()=>this.ready?structuredClone(MESSAGE_ACTION_SCHEMAS):{};
 read=async(request:{topic:string;scope:string;clientId:string;account?:string}):Promise<RecordValue>=>{this.connection.authorizeAccount(request.account);if(!this.ready||request.topic!=='message-metadata'||!request.scope.startsWith('ahp-session:/'))throw refused('Selected negotiated message topic required');const descriptor=await this.connection.describe({clientId:request.clientId,account:request.account,session:{uri:request.scope}});const record=structuredClone(this.records.get(request.scope)??{topic:'message-metadata',scope:request.scope,revision:0,data:{available:true}});record.data={...record.data,...descriptor};return record;};
 action=async(request:Json,context:Context)=>{
  const meta={'amplifier.dev/operation':{id:request.commandId}};
  try{
   if(!this.ready||!Object.keys(MESSAGE_ACTION_SCHEMAS).includes(request.operation)||request.version!==1||request.topic!=='message-metadata'||context.session?.uri!==request.channel||!token(request.commandId))throw refused('Selected negotiated message action required');
   const operation=String(request.operation).replace(/^message\./,''),args=request.args;
   const fields:Record<string,string[]>={reaction:['reference','emoji','present'],read:['messageIds'],receipt:['commandId']},keys=fields[operation];
   if(!keys||!object(args)||Object.keys(args).length!==keys.length||keys.some(k=>!(k in args))||Object.keys(args).some(k=>!keys.includes(k))||Buffer.byteLength(JSON.stringify(args))>32768)throw refused('Exact bounded message arguments required');
   if(operation==='reaction'){const r=args.reference;if(!object(r)||Object.keys(r).some(k=>!['sessionId','messageId','position','historyEpoch','sourceDigest'].includes(k))||!token(r.sessionId)||!token(r.messageId)||!Number.isSafeInteger(r.position)||r.position<0||!(r.historyEpoch===null||token(r.historyEpoch))||r.sourceDigest!==undefined&&!/^[a-f0-9]{64}$/.test(r.sourceDigest)||!EMOJI.includes(args.emoji)||typeof args.present!=='boolean')throw refused('Exact current native reference and reaction required');}
   if(operation==='read'&&(!Array.isArray(args.messageIds)||args.messageIds.length<1||args.messageIds.length>50||args.messageIds.some((v:unknown)=>!token(v))))throw refused('Bounded selected message identities required');
   if(operation==='receipt'&&!token(args.commandId))throw refused('Exact original message command required');
   const result=await this.connection.perform(operation as 'reaction'|'read'|'receipt',operation==='reaction'?{...args,commandId:request.commandId}:args,context);
   if(operation==='reaction'&&result.changed===true)this.changed(request.channel,result);
   return {accepted:true,result:structuredClone(result),updates:[],invalidate:[],_meta:meta};
  }catch(error){const data=(error as {data?:Json}).data;if(object(data)&&data.executed===false&&data.outcome!=='unknown'&&data.applied!==true)return{accepted:false,result:{...structuredClone(data),message:(error as Error).message},updates:[],invalidate:[],_meta:meta};throw error;}
 };
}
export function createMessageCapabilities(options:MessageOptions){const connection=new MessageConnection(options),capabilities=new MessageCapabilities(connection,options.onInvalidate);return{connection,capabilities};}
