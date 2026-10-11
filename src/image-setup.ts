import type {Json} from './index.js';
export const IMAGE_OPERATIONS=['providers.imageModels','providers.configureImages'];
/** Only the initialized administration peer can advertise image setup. */
export function imageSetupMetadata(value:unknown):value is Json {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const m=value as Json;
 return Object.keys(m).length===4&&m.version===1&&m.catalog==='provider-image-models'&&m.preservesChat===true&&m.exclusive===true;
}
export function imageSetupUnavailable(){return Object.assign(Error('Image setup is unavailable on the configured Native peer.'),{data:{executed:false,replayed:false,reason:'image-setup-unavailable'}});}
