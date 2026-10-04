import type{Json}from'./index.js';
/** Explicit no-effect proof from the selected native operation rejection only. */
export function nativeRefusal(error:unknown):Json|undefined{
 const value=(error as {data?:unknown}|null)?.data;
 if(!value||typeof value!=='object'||Array.isArray(value))return;
 const data=value as Json;
 if(data.executed!==false||data.applied===true||[data.outcome,data.status,data.state].includes('unknown'))return;
 return{applied:false,...structuredClone(data),message:(error as {message?:string})?.message};
}
