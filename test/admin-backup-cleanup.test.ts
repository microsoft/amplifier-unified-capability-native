import test from 'node:test';import assert from 'node:assert/strict';import {AdminConnection} from '../src/index.js';
test('backup retirement requires every negotiated protection and an exact held recovery scope',async()=>{
 const admin=new AdminConnection({command:'/must/not/start',cwd:'/owned',resolveWorkspace:()=>'/owned'}),internal=admin as any,calls:any[]=[];
 internal.start=async()=>{};internal.rpc=async(method:string,args:any)=>{calls.push({method,args});return {};};
 const context={fenceId:'fence',commandId:'original',purpose:'recovery'};
 internal.maintenanceMetadata={backupCleanup:{version:1,previewRequired:true,receipt:true,requiresRecoveryAdminLease:true,newestProtected:true,recoveryReferencesProtected:true,automaticReplay:false}};
 await assert.rejects(admin.perform('maintenance.backups.inspect',{}, {clientId:'one'}),/held recovery/);
 internal.held={phase:'held',context,leaseId:'native-lease'};
 await admin.withMaintenanceFence(context,()=>admin.perform('maintenance.backups.inspect',{}, {clientId:'one'}));
 assert.equal(calls.length,1);assert.deepEqual(calls[0].args._meta['amplifier.dev/admin'],{fenceId:'fence',commandId:'original',leaseId:'native-lease'});
 internal.maintenanceMetadata.backupCleanup.newestProtected=false;
 await assert.rejects(admin.withMaintenanceFence(context,()=>admin.perform('maintenance.backups.remove',{}, {clientId:'one'})),/negotiated/);
 assert.equal(calls.length,1);
});
