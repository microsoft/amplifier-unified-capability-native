/** A negotiated view of Native's recording policy; no second settings store. */
import type {Context,Json,RecordValue} from './index.js';
import {nativeRefusal} from './refusals.js';

const descriptor={version:1,cas:true,receipt:true,application:'next-runtime-preparation'};
export function providerRecordingMetadata(value:unknown):boolean{
 return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===Object.keys(descriptor).sort().join(',')&&Object.entries(descriptor).every(([key,v])=>(value as Json)[key]===v);
}
const text={type:'string',minLength:1,maxLength:200};
const object=(properties:Json={},required:string[]=[])=>({type:'object',properties,required,additionalProperties:false});
export const RECORDING_SCHEMAS={
 'diagnostics.recording.get':{description:'Read the saved provider request recording choice; no runtime is started',schema:object()},
 'diagnostics.recording.configure':{description:'Explicitly save provider request recording for the next runtime preparation; existing calls and explicit provider opt-outs are unchanged',schema:object({expectedRevision:{type:'string',pattern:'^[a-f0-9]{64}$'},enabled:{type:'boolean'}},['expectedRevision','enabled'])},
 'diagnostics.recording.receipt':{description:'Inspect the exact original recording policy receipt without repeating the change',schema:object({commandId:text},['commandId'])},
};
export interface RecordingOptions{
 nativeAdmin:(operation:string,args:Json,context:Context)=>Promise<Json>;
 nativeCapabilities:()=>Promise<Json|undefined>;
 onInvalidate?:(topic:string,scope:string)=>void;
}
const refused=(message:string)=>Object.assign(Error(message),{data:{executed:false,replayed:false,reason:'provider-recording-unavailable'}});
const identity=(value:unknown)=>typeof value==='string'&&value.length>0&&value.length<=200&&!/[\x00-\x1f]/.test(value);

export async function createProviderRecordingCapabilities(options:RecordingOptions){
 let metadata:Json|undefined;
 try{metadata=await options.nativeCapabilities();}catch{return undefined;}
 if(!providerRecordingMetadata(metadata))return undefined;
 const uri='amplifier-capability://native/provider-recording';let revision=0;
 const manifest={version:1 as const,topics:{'provider-recording':{uri,version:1 as const,watch:true as const,scope:'host' as const}},actions:Object.fromEntries(Object.keys(RECORDING_SCHEMAS).map(operation=>[operation,{topic:'provider-recording',operation,method:'x-amplifier/capabilityAction'}]))};
 return {
  manifest,actionSchemas:async()=>structuredClone(RECORDING_SCHEMAS),
  quiescenceAccess:{'diagnostics.recording.get':'read' as const,'diagnostics.recording.receipt':'read' as const},
  read:async(request:{topic:string;scope:string;uri:string;clientId:string}):Promise<RecordValue>=>{
   const selected=new URL(request.uri);selected.search='';selected.hash='';
   if(request.topic!=='provider-recording'||!['host','ahp-root://'].includes(request.scope)||selected.href!==uri)throw refused('Recording policy is a host setting');
   const policy=await options.nativeAdmin('provider.recording.get',{}, {clientId:request.clientId});
   return {topic:'provider-recording',scope:'host',revision:++revision,data:{providerRecording:policy}};
  },
  action:async(request:Json,context:Context)=>{
   const {operation,channel}=request,args=structuredClone(request.args??{});
   if(request.version!==1||request.topic!=='provider-recording'||!identity(request.commandId)||!Object.hasOwn(RECORDING_SCHEMAS,operation)||!(channel==='host'||channel==='ahp-root://'||context.session?.uri&&channel===context.session.uri))throw refused('An authorized recording action and scope are required');
   const fields=operation.endsWith('.configure')?['enabled','expectedRevision']:operation.endsWith('.receipt')?['commandId']:[];
   if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).sort().join(',')!==fields.sort().join(','))throw refused('Unexpected recording policy arguments');
   if(operation.endsWith('.configure')&&(typeof args.enabled!=='boolean'||typeof args.expectedRevision!=='string'||!/^[a-f0-9]{64}$/.test(args.expectedRevision)))throw refused('Exact recording revision and boolean choice required');
   if(operation.endsWith('.receipt')&&!identity(args.commandId))throw refused('Exact original recording command identity required');
   let result;
   try{result=await options.nativeAdmin(operation.replace('diagnostics.recording.','provider.recording.'),operation.endsWith('.configure')?{...args,commandId:request.commandId}:args,context);}
   catch(error){const known=nativeRefusal(error);if(known)return {accepted:false,result:known,updates:[],invalidate:[]};throw error;}
   if(operation.endsWith('.configure')&&result?.status==='succeeded')try{options.onInvalidate?.('provider-recording','host');}catch{/* A projection notification cannot undo the recorded effect. */}
   return {accepted:result?.status!=='failed',result,updates:[],invalidate:[]};
  },
 };
}
