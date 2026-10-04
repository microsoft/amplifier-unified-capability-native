import type {Json} from './index.js';

/** Closed passive marker from the initialized native administration peer. */
export function providerSignInMetadata(value:unknown):value is Json {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const m=value as Json;
 return Object.keys(m).length===3&&Object.keys(m).every(k=>['version','workspaceBound','scopedAttempts'].includes(k))&&m.version===1&&m.workspaceBound===true&&m.scopedAttempts===true;
}
export function signInSelectors(operation:string,args:Json):boolean {
 return ['providers.loginStatus','providers.loginCancel'].includes(operation)&&(Object.hasOwn(args,'scope')||Object.hasOwn(args,'loginId'));
}
export function validSignInSelectors(args:Json):boolean {
 return (!Object.hasOwn(args,'scope')||['global','project','local'].includes(args.scope))&&(!Object.hasOwn(args,'loginId')||typeof args.loginId==='string'&&/^[a-f0-9]{32}$/.test(args.loginId));
}
export function signInSelectorsUnavailable(message='The configured native administration peer does not support scoped sign-in selectors.') {
 return Object.assign(Error(message),{data:{executed:false,replayed:false,reason:'provider-signin-selectors-unavailable'}});
}
