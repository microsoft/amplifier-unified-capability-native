import type {Json} from './index.js';
export function configurationTargetsMetadata(value:unknown):value is Json {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const m=value as Json;return Object.keys(m).length===4&&m.version===1&&m.globalOnly===true&&m.workspaceBound===true&&m.isolatedResults===true;
}
export const configurationOperation=(operation:string)=>/^(providers|routing|modules|sources)\./.test(operation);
export const configurationTargetSchema={oneOf:[{type:'object',properties:{kind:{const:'global'}},required:['kind'],additionalProperties:false},{type:'object',properties:{kind:{const:'workspace'},workspaceId:{type:'string',minLength:1,maxLength:200,pattern:'^[^\\u0000-\\u001f]+$'}},required:['kind','workspaceId'],additionalProperties:false}]};
export function configurationTarget(args:Json,operation:string,scope:string):Json|undefined {
 if(!Object.hasOwn(args,'configurationTarget'))return;
 const t=args.configurationTarget;
 if(!configurationOperation(operation)||scope!=='host'||!t||typeof t!=='object'||Array.isArray(t)||
  !(t.kind==='global'&&Object.keys(t).length===1||t.kind==='workspace'&&Object.keys(t).sort().join(',')==='kind,workspaceId'&&typeof t.workspaceId==='string'&&t.workspaceId.length>0&&t.workspaceId.length<=200&&!/[\x00-\x1f]/.test(t.workspaceId))||
  ['sessionId','workspace','location','nativeProject'].some(k=>Object.hasOwn(args,k))||
  args.scope!==undefined&&!(t.kind==='global'?args.scope==='global':['local','project'].includes(args.scope)))throw configurationTargetUnavailable('Choose one matching configuration owner and scope.');
 return t.kind==='global'?{kind:'global'}:{kind:'workspace',workspaceId:t.workspaceId};
}
export function configurationTargetUnavailable(message='Explicit configuration owners are unavailable on this Native peer.') {return Object.assign(Error(message),{data:{executed:false,replayed:false,reason:'configuration-target-unavailable'}});}
