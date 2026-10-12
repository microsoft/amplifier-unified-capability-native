import test from 'node:test';
import assert from 'node:assert/strict';
import {AdminConnection} from '../src/index.js';

test('history cleanup crosses only the negotiated, exact held maintenance boundary',async()=>{
 const admin=new AdminConnection({command:'/must/not/start',cwd:'/owned',resolveWorkspace:()=>'/owned'}),internal=admin as any,calls:any[]=[];
 internal.start=async()=>{};internal.rpc=async(method:string,args:any)=>{calls.push({method,args});return {review:true};};
 const context={fenceId:'fence',commandId:'original',purpose:'recovery'},selection={project:'owned-project'};
 internal.maintenanceMetadata={historyCleanup:{version:1,previewRequired:true,receipt:true,requiresRecoveryAdminLease:true,trustedOwnerCensus:true,workspacePreserved:true,stableLocksPreserved:true,automaticReplay:false}};
 await assert.rejects(admin.perform('maintenance.history.preview',{selection},{clientId:'review'}),/held recovery/);
 internal.held={phase:'held',context,leaseId:'native-lease'};
 await assert.rejects(admin.perform('maintenance.history.remove',{selection},{clientId:'review'}),/intake is held/);
 await admin.withMaintenanceFence(context,()=>admin.perform('maintenance.history.preview',{selection,reviewed:true},{clientId:'review'}));
 assert.deepEqual(calls,[{method:'_amplifier/admin',args:{cwd:'/owned',operation:'maintenance.history.preview',args:{selection,reviewed:true},_meta:{'amplifier.dev/admin':{fenceId:'fence',commandId:'original',leaseId:'native-lease'}}}}]);
 internal.maintenanceMetadata.historyCleanup.automaticReplay=true;
 await assert.rejects(admin.withMaintenanceFence(context,()=>admin.perform('maintenance.history.remove',{selection},{clientId:'review'})),/negotiated/);
 assert.equal(calls.length,1);
 internal.maintenanceMetadata.historyCleanup.automaticReplay=false;
 await admin.withMaintenanceFence(context,()=>admin.perform('maintenance.history.census',{selection},{clientId:'review'}));
 assert.equal(calls.at(-1).args.operation,'maintenance.history.census');
 await assert.rejects(admin.withMaintenanceFence(context,()=>admin.perform('maintenance.history.arbitrary',{selection},{clientId:'review'})),/intake is held/);
 assert.equal(calls.length,2);
 await assert.rejects(admin.withMaintenanceFence({...context,commandId:'other'},async()=>{}),/intake is held/);
});
