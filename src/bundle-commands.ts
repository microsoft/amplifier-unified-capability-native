import {createHash} from 'node:crypto';
/** Stable native child identities; no paths, settings, result storage, or effects. */
export function bundleCommandIds(scope:string,operation:string,commandId:string):{commandId:string;activationCommandId?:string} {
 if(!['bundle.save','bundle.export','bundle.default','bundle.switch'].includes(operation)||typeof commandId!=='string'||!commandId||commandId.length>256)throw Error('Bounded original bundle command identity required.');
 const child=(effect:string)=>'unified-bundle-v1:'+createHash('sha256').update(JSON.stringify(['unified-native-capabilities',1,scope,operation,commandId,effect])).digest('hex');
 return {commandId:child(operation),...(operation==='bundle.save'&&scope!=='host'?{activationCommandId:child('bundle.switch')}:{})};
}
