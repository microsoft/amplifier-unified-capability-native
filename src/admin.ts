import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {Readable,Writable,Transform} from 'node:stream';
import {ClientSideConnection,ndJsonStream} from '@agentclientprotocol/sdk';
import type {Context,Json} from './index.js';
export interface AdminOptions {
 command:string;args?:string[];env?:Record<string,string>;cwd:string;
 /** Resolve via host.inspectSession for session scopes, configured default for host. Never args.cwd. */
 resolveWorkspace:(context:Context)=>Promise<string>|string;
 timeoutMs?:number;
}
/** One optional admin connection. It never opens an ACP session or execution worker. */
export class AdminConnection {
 private process?:ChildProcessWithoutNullStreams;private client?:ClientSideConnection;private starting?:Promise<void>;private closed=false;private tail='';
 constructor(private options:AdminOptions){}
 private async start(){
  if(this.closed)throw Error('Native administration connection closed; an uncertain operation is never replayed.');
  if(this.starting)return this.starting;
  this.starting=(async()=>{
   const process_=this.process=spawn(this.options.command,this.options.args??[],{cwd:this.options.cwd,env:{...process.env,...this.options.env},stdio:'pipe'});
   process_.stderr.on('data',data=>{this.tail=(this.tail+String(data)).slice(-8192);});
   process_.on('error',()=>{this.closed=true;});process_.on('exit',()=>{this.closed=true;});
   let bytes=0;const guard=new Transform({transform(chunk:Buffer,_encoding,callback){for(const byte of chunk){bytes=byte===10?0:bytes+1;if(bytes>2*1024*1024){callback(Error('Native admin frame exceeds 2 MiB'));return;}}callback(null,chunk);}});
   guard.on('error',()=>process_.kill());process_.stdout.pipe(guard);
   this.client=new ClientSideConnection(()=>({sessionUpdate:async()=>{throw Error('Admin connection cannot own session updates.');},requestPermission:async()=>({outcome:{outcome:'cancelled' as const}})}),ndJsonStream(Writable.toWeb(process_.stdin) as WritableStream<Uint8Array>,Readable.toWeb(guard) as ReadableStream<Uint8Array>));
   const init=await this.client.initialize({protocolVersion:1,clientCapabilities:{_meta:{'amplifier.dev/native':{version:1}}},clientInfo:{name:'amplifier-unified-native-capabilities',version:'0.1.0'}});
   const native=init.agentCapabilities?._meta?.['amplifier.dev/native'] as Json|undefined;
   if(init.protocolVersion!==1||native?.version!==1||native?.admin?.version!==1){await this.close();throw Error('Agent has no launcher-enabled native administration v1 capability.');}
  })();
  return this.starting;
 }
 perform=async(operation:string,args:Json,context:Context):Promise<Json>=>{
  const cwd=await this.options.resolveWorkspace(context);await this.start();
  const {sessionId:_,id, ...values}=args;
  // IDs used by provider/module operations remain selectors; only sessionId is removed.
  if(id!==undefined)values.id=id;
  if('cwd' in values||'home' in values||'appHome' in values)throw Error('Native administration launch authority cannot be supplied by clients.');
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([this.client!.extMethod('_amplifier/admin',{cwd,operation,args:values}) as Promise<Json>,new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{this.close();reject(Error('Native administration timed out; outcome unknown and no operation was replayed.'));},this.options.timeoutMs??120000);})]);}
  finally{if(timer)clearTimeout(timer);}
 };
 async close(){this.closed=true;if(!this.process||this.process.exitCode!==null)return;this.process.stdin.end();await new Promise<void>(resolve=>{const timer=setTimeout(()=>{this.process?.kill();resolve();},3000);this.process!.once('exit',()=>{clearTimeout(timer);resolve();});});}
}
