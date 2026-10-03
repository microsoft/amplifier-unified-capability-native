/** Native-owned write-path settings; the host binds workspace authority. */
import type {Context,Json,RecordValue} from './index.js';
export interface PermissionsOptions {
 nativeAdmin:(operation:string,args:Json,context:Context)=>Promise<Json>;
 onInvalidate?:(topic:'permissions',scope:string)=>void;
}
const sessionId={type:'string',minLength:1,maxLength:8192};
const scopeSchema={enum:['global','project','local']};
const text={type:'string',minLength:1,maxLength:200};
const paths={type:'array',maxItems:64,items:{type:'string',minLength:1,maxLength:4096}};
export const PERMISSION_ACTION_SCHEMAS={
 'permissions.get':{description:'Read scoped write-path preferences and their settings-only source explanation; does not inspect or start a runtime',schema:{type:'object',properties:{scope:scopeSchema,sessionId},additionalProperties:false}},
 'permissions.save':{description:'Save explicit write-path preferences with selected-scope revision CAS; active work retains its current mounted restrictions',schema:{type:'object',properties:{scope:scopeSchema,sessionId,expectedRevision:{type:'string',pattern:'^[a-f0-9]{64}$'},allowed:paths,denied:paths},required:['scope','expectedRevision','allowed','denied'],additionalProperties:false}},
 'permissions.receipt':{description:'Read the exact original file-access save receipt without repeating its effect',schema:{type:'object',properties:{commandId:text,sessionId},required:['commandId'],additionalProperties:false}},
};
const refused=(message:string)=>Object.assign(Error(message),{data:{executed:false,replayed:false,reason:'permissions-authority'}});
const fieldSets:Record<string,string[]>={'permissions.get':['scope','sessionId'],'permissions.save':['scope','expectedRevision','allowed','denied','sessionId'],'permissions.receipt':['commandId','sessionId']};
export class PermissionsCapabilities {
 readonly manifest={version:1 as const,topics:{permissions:{uri:'amplifier-capability://native/permissions',version:1 as const,watch:true as const,scope:'host' as const}},actions:Object.fromEntries(Object.keys(PERMISSION_ACTION_SCHEMAS).map(operation=>[operation,{topic:'permissions',operation,method:'x-amplifier/capabilityAction'}]))};
 private revision=0;
 constructor(private options:PermissionsOptions){}
 actionSchemas=async()=>structuredClone(PERMISSION_ACTION_SCHEMAS);
 private scope(channel:string){if(channel==='host'||channel==='ahp-root://')return 'host';if(typeof channel!=='string'||!channel.startsWith('ahp-session:/')||channel.length>8192)throw refused('An authorized session or host scope is required');return channel;}
 private validate(operation:string,args:Json,scope:string,context:Context){
  if(!fieldSets[operation]||!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!fieldSets[operation].includes(k)))throw refused('Unexpected file-access field');
  if(args.sessionId!==undefined&&args.sessionId!==scope)throw refused('Session selector differs from authenticated channel');
  if(scope!=='host'&&context.session?.uri!==scope)throw refused('Session selector differs from authenticated context');
  if(context.origin==='agent'){
   if(scope==='host'||context.session?.uri!==scope)throw refused('An agent may only inspect or change its current session workspace');
   if(operation==='permissions.save'&&(args.scope??'global')==='global')throw refused('An agent cannot change global file-access preferences');
  }
  if(operation!=='permissions.receipt'&&!['global','project','local'].includes(args.scope??'global'))throw refused('Choose global, project, or local scope');
  if(operation==='permissions.receipt'&&(typeof args.commandId!=='string'||!args.commandId||args.commandId.length>200))throw refused('Exact bounded original command identity required');
  if(Buffer.byteLength(JSON.stringify(args))>262144)throw refused('File-access request exceeds 256 KiB');
  if(operation==='permissions.save'){
   if(!/^[a-f0-9]{64}$/.test(args.expectedRevision??''))throw refused('Exact selected-scope revision required');
   for(const field of ['allowed','denied'])if(!Array.isArray(args[field])||args[field].length>64||args[field].some((v:unknown)=>typeof v!=='string'||!v.length||v.length>4096||/[\x00-\x1f]/.test(v)))throw refused('Choose at most 64 bounded directories per list');
  }
 }
 read=async(request:{topic:string;scope:string;clientId:string}):Promise<RecordValue>=>{
  if(request.topic!=='permissions'||this.scope(request.scope)!=='host')throw refused('File-access change metadata is host-scoped');
  const view=await this.options.nativeAdmin('permissions.get',{scope:'global'},{clientId:request.clientId});
  return {topic:'permissions',scope:'host',revision:++this.revision,data:{permissionsCapability:{version:1,available:true,scopes:view.scopes,limits:view.limits,application:view.application,revision:this.revision}}};
 };
 action=async(request:Json,context:Context)=>{
  const scope=this.scope(request.channel),operation=request.operation,args=request.args??{};
  if(request.version!==1||request.topic!=='permissions'||typeof request.commandId!=='string'||!request.commandId||request.commandId.length>200)throw refused('Bounded permission action identity and version required');
  this.validate(operation,args,scope,context);
  const {sessionId:_selector,...values}=args;
  const result=await this.options.nativeAdmin(operation,operation==='permissions.save'?{...values,commandId:request.commandId}:values,context);
  if(operation==='permissions.save'&&result.status==='succeeded')this.options.onInvalidate?.('permissions','host');
  return {accepted:result?.status!=='failed',result:structuredClone(result),updates:[],invalidate:[],_meta:{'amplifier.dev/operation':{id:request.commandId}}};
 };
}
export function createPermissionsCapabilities(options:PermissionsOptions){return new PermissionsCapabilities(options);}
