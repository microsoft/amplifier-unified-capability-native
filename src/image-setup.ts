import type {Json} from './index.js';
export const IMAGE_OPERATIONS=['providers.imageModels','providers.configureImages'];
/** Only the initialized administration peer can advertise image setup. */
export function imageSetupMetadata(value:unknown):value is Json {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const m=value as Json;
 return Object.keys(m).every(key=>['version','catalog','preservesChat','exclusive','preferences'].includes(key))&&(!Object.hasOwn(m,'preferences')||imagePreferencesMetadata(m.preferences))&&m.version===1&&m.catalog==='provider-image-models'&&m.preservesChat===true&&m.exclusive===true;
}
export function imageSetupUnavailable(){return Object.assign(Error('Image setup is unavailable on the configured Native peer.'),{data:{executed:false,replayed:false,reason:'image-setup-unavailable'}});}

/** Optional sibling marker; older peers retain the existing image controls. */
export function imagePreferencesMetadata(value:unknown):value is Json {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const m=value as Json;
 return Object.keys(m).length===3&&m.version===1&&m.application==='new-sessions'&&
  JSON.stringify(m.modes)===JSON.stringify(['automatic','selected','off']);
}
