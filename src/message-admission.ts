/** Capability-owned durable intake journal; never owns Native message effects. */
import {DatabaseSync} from 'node:sqlite';
import {lstatSync,mkdirSync,existsSync} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {evidenceKey} from './service-lifecycle.js';
import type {AdminFenceContext,AdminAdmissionAbortProof,AdminAdmissionAbortReceipt} from './admin.js';
type Held={context:Readonly<AdminFenceContext>;phase:'held'|'unknown'};
export class MessageAdmission {
 private db!:DatabaseSync;private lock:DatabaseSync;
 constructor(directory:string,private ownerId:string,account:string){
  if(!isAbsolute(directory))throw Error('Absolute trusted message admission directory required');
  mkdirSync(directory,{recursive:true,mode:0o700});
  if(!lstatSync(directory).isDirectory()||lstatSync(directory).isSymbolicLink())throw Error('Trusted existing message admission directory required');
  for(const name of ['message-owner-lock.sqlite3','message-admission.sqlite3','message-admission.sqlite3-wal','message-admission.sqlite3-shm','message-admission.sqlite3-journal'])try{const stat=lstatSync(join(directory,name));if(!stat.isFile()||stat.isSymbolicLink())throw Error('Message journal must be a regular owned file');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  const existing=existsSync(join(directory,'message-admission.sqlite3'));
  this.lock=new DatabaseSync(join(directory,'message-owner-lock.sqlite3'));
  try{this.lock.exec('PRAGMA busy_timeout=0; CREATE TABLE IF NOT EXISTS owner(id INTEGER); BEGIN EXCLUSIVE');}catch(e){this.lock.close();throw e;}
  try{
   this.db=new DatabaseSync(join(directory,'message-admission.sqlite3'));
   if(existing){const tables=this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r=>String(r.name));if(tables.join(',')!=='attempts,calls,held,identity,releases')throw Error('Existing message admission schema is unconfirmed');for(const table of tables){const columns=this.db.prepare('PRAGMA table_info('+table+')').all().map(r=>String(r.name));if(columns.join(',')!==(table==='calls'?'id':'id,value'))throw Error('Existing message admission columns are unconfirmed');}if(this.db.prepare('PRAGMA quick_check').get()?.quick_check!=='ok')throw Error('Message journal integrity is unconfirmed');}
   this.db.exec('PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS identity(id INTEGER PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS held(id INTEGER PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS releases(id TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS calls(id TEXT PRIMARY KEY);');
   const identity=evidenceKey({ownerId,account}),prior=this.db.prepare('SELECT value FROM identity WHERE id=1').get();
   if(prior&&prior.value!==identity)throw Error('Message admission identity changed');
   this.db.prepare('INSERT OR IGNORE INTO identity VALUES(1,?)').run(identity);
   const held=this.held();if(held)this.saveHeld({...held,phase:'unknown'});
  }catch(e){this.db!?.close();this.lock.close();throw e;}
 }
 private transaction<T>(work:()=>T):T{this.db.exec('BEGIN IMMEDIATE');try{const value=work();this.db.exec('COMMIT');return value;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 held():Held|undefined{const r=this.db.prepare('SELECT value FROM held WHERE id=1').get();return r?JSON.parse(String(r.value)):undefined;}
 unknownCalls(){return Number(this.db.prepare('SELECT count(*) n FROM calls').get()!.n)>0;}
 begin(){const id=randomUUID();this.db.prepare('INSERT INTO calls VALUES(?)').run(id);return id;}
 end(id:string,unknown:boolean){if(!unknown)this.db.prepare('DELETE FROM calls WHERE id=?').run(id);}
 saveHeld(value:Held){this.db.prepare('INSERT OR REPLACE INTO held VALUES(1,?)').run(evidenceKey(value));}
 releaseEvidence(id:string):string|undefined{const r=this.db.prepare('SELECT value FROM releases WHERE id=?').get(id);return r?String(r.value):undefined;}
 private attempt(context:Readonly<AdminFenceContext>):any{const r=this.db.prepare('SELECT value FROM attempts WHERE id=?').get(context.fenceId);const prior=r?JSON.parse(String(r.value)):undefined;if(prior&&evidenceKey(prior.context)!==evidenceKey(context))throw Error('Original message admission context differs');return prior;}
 acquire(context:Readonly<AdminFenceContext>,busy:boolean):boolean{
  const prior=context.purpose==='distribution-update'?this.attempt(context):undefined;
  if(prior?.abortReceipt||prior?.state==='released'||this.releaseEvidence(context.fenceId))throw Error('Completed message admission cannot be acquired again');
  if(prior?.state==='refused')return false;
  if(this.held()||busy||this.unknownCalls()){if(context.purpose==='distribution-update'&&!prior)this.db.prepare('INSERT INTO attempts VALUES(?,?)').run(context.fenceId,evidenceKey({context,state:'refused'}));return false;}
  this.transaction(()=>{if(context.purpose==='distribution-update')this.db.prepare('INSERT INTO attempts VALUES(?,?)').run(context.fenceId,evidenceKey({context,state:'acquired'}));this.saveHeld({context,phase:'held'});});return true;
 }
 released(context:Readonly<AdminFenceContext>,evidence:string,outcome:string){this.transaction(()=>{const prior=context.purpose==='distribution-update'?this.attempt(context):undefined;if(prior){if(prior.abortReceipt)throw Error('Original message admission already aborted');this.db.prepare('UPDATE attempts SET value=? WHERE id=?').run(evidenceKey({...prior,state:outcome==='unchanged'?'released':'changed'}),context.fenceId);}this.db.prepare('INSERT INTO releases VALUES(?,?)').run(context.fenceId,evidence);this.db.exec('DELETE FROM held WHERE id=1');});}
 abort(context:Readonly<AdminFenceContext>,proof:AdminAdmissionAbortProof,blocked:boolean):AdminAdmissionAbortReceipt{
  const prior=this.attempt(context),signature=evidenceKey(proof);
  if(!prior)throw Error('Original durable message admission is unconfirmed');
  if(prior.abortReceipt){if(prior.abortProof!==signature)throw Error('Message admission abort proof changed');return structuredClone(prior.abortReceipt);}
  const held=this.held(),owns=held&&evidenceKey(held.context)===evidenceKey(context);
  if(blocked||this.unknownCalls())throw Error('Message admission work remains active or unknown');
  if((held&&!owns&&prior.state!=='released')||(!held&&prior.state==='acquired')||!['acquired','released','refused'].includes(prior.state))throw Error('Original message admission hold is unconfirmed');
  if(owns&&prior.state!=='acquired')throw Error('Message admission disposition contradicts its hold');
  const {purpose,...binding}=context;
  const receipt={...binding,ownerId:this.ownerId,status:prior.state==='refused'?'not-acquired' as const:'released' as const,receiptId:createHash('sha256').update(evidenceKey({ownerId:this.ownerId,context,signature})).digest('hex')};
  this.transaction(()=>{this.db.prepare('UPDATE attempts SET value=? WHERE id=?').run(evidenceKey({...prior,state:'aborted',abortProof:signature,abortReceipt:receipt}),context.fenceId);if(owns)this.db.exec('DELETE FROM held WHERE id=1');});return receipt;
 }
 close(){this.db.close();this.lock.close();}
}
