import {createHash} from 'node:crypto';
export type Value=Record<string,any>;
export interface NamingPorts {
 nativeNaming?:(scope:string,operation:string,args:Value)=>Promise<Value>;
 nativeNamingCapabilities?:()=>Promise<Value|undefined>;
 readSessionTitle?:(scope:string)=>Promise<{title:string;titleRevision:string}>;
 commitSessionTitle?:(scope:string,expected:{commandId:string;expectedTitleRevision?:string},persist:()=>Promise<{applied:boolean;title?:string;metadata?:Value}>)=>Promise<{applied:boolean;title?:string;titleRevision?:string;metadata?:Value}>;
}
export function namingMetadata(value:Value|undefined):boolean {
 return !!value&&value.version===1&&value.method==='_amplifier/naming'&&value.passiveMetadata===true&&value.commandIds===true&&value.replayUnknown===false;
}
export function namingArguments(scope:string,args:Value):'generate'|'policy' {
 if(Object.keys(args).some(k=>!['id','sessionId','regenerate','automatic'].includes(k))||['id','sessionId'].some(k=>Object.hasOwn(args,k)&&args[k]!==scope))throw Error('Naming target must match the authenticated session.');
 if(Object.hasOwn(args,'regenerate')===Object.hasOwn(args,'automatic'))throw Error('Choose either generate a name or update automatic naming.');
 if(Object.hasOwn(args,'regenerate')){if(args.regenerate!==true)throw Error('Explicit naming generation required.');return 'generate';}
 if(typeof args.automatic!=='boolean')throw Error('Automatic naming policy must be boolean.');return 'policy';
}
function child(scope:string,command:string,phase:string):string {
 if(typeof command!=='string'||!command||command.length>200||/[\x00-\x1f]/.test(command))throw Error('Original naming command identity required.');
 return 'naming-'+createHash('sha256').update(JSON.stringify([scope,command,phase])).digest('hex');
}
function current(value:Value):boolean {
 return typeof value?.title==='string'&&value.title.length<=200&&typeof value?.naming?.automatic==='boolean'&&Number.isSafeInteger(value.naming.nameRevision)&&value.naming.nameRevision>=0&&Number.isSafeInteger(value.naming.policyRevision)&&value.naming.policyRevision>=0;
}
export async function performNaming(options:NamingPorts&{nativeControl:(scope:string,operation:string,args:Value)=>Promise<Value>},scope:string,args:Value,command:string):Promise<Value> {
 const mode=namingArguments(scope,args);
 const before=await options.readSessionTitle!(scope);
 if(typeof before.titleRevision!=='string'||!before.titleRevision)throw Error('Canonical title revision is unavailable.');
 let nativeArgs:Value,operation:string;
 if(mode==='generate'){
  // Model generation happens outside the canonical title mutation lock.
  const candidate=await options.nativeControl(scope,'session.naming.generate',{commandId:child(scope,command,'generate')});
  nativeArgs={candidate,commandId:child(scope,command,'commit')};operation='commit';
 }else{
  const inspected=await options.nativeNaming!(scope,'read',{});
  if(!current(inspected))throw Error('Canonical naming metadata is incomplete.');
  nativeArgs={automatic:args.automatic,expectedNameRevision:inspected.naming.nameRevision,expectedPolicyRevision:inspected.naming.policyRevision,commandId:child(scope,command,'policy')};operation='policy';
 }
 let nativeResult:Value|undefined;
 const committed=await options.commitSessionTitle!(scope,{commandId:command,expectedTitleRevision:before.titleRevision},async()=>{
  nativeResult=await options.nativeNaming!(scope,operation,nativeArgs);
  if(!current(nativeResult)||typeof nativeResult.applied!=='boolean')throw Error('Canonical naming commit response is incomplete.');
  // An original success receipt can outlive a newer manual edit. Never project
  // that historical title over the current canonical native metadata.
  const latest=await options.nativeNaming!(scope,'read',{});
  if(!current(latest))throw Error('Canonical naming reconciliation is incomplete.');
  const same=latest.naming.nameRevision===nativeResult.naming.nameRevision&&latest.naming.policyRevision===nativeResult.naming.policyRevision&&latest.title===nativeResult.title;
  if(!same){nativeResult={...latest,applied:false,reason:'naming-revision-conflict'};}
  return {applied:nativeResult.applied,...(mode==='generate'?{title:nativeResult.title}:{}),metadata:{naming:nativeResult.naming}};
 });
 return {...committed,...(nativeResult?{title:nativeResult.title,naming:nativeResult.naming}:{}),...(!committed.applied?{reason:nativeResult?.reason??'naming-revision-conflict'}:{})};
}
