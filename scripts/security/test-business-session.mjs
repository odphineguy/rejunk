import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
const source = readFileSync(new URL('../../client/src/lib/supabase.ts', import.meta.url), 'utf8')
  .replace(/import \{ createClient, type SupabaseClient \} from "@supabase\/supabase-js";/, 'const createClient = globalThis.makeClient; type SupabaseClient<T> = any;');
const code = transformSync(source, { loader:'ts',format:'cjs',define:{'import.meta.env.VITE_SUPABASE_URL':'"https://fixture.invalid"','import.meta.env.VITE_SUPABASE_ANON_KEY':'"fixture"'} }).code;
function setup(path='/dashboard') {
  const local = new Map();
  const calls=[];
  let session=null, allow=true;
  const api={auth:{getSession:async()=>({data:{session}}), signInAnonymously:async()=>{calls.push('signup');session={user:{id:'transport'}};return {data:{session}};},signOut:async()=>{calls.push('signout');session=null;}},rpc:async(name,args)=>{calls.push({name,args});return {data:allow,error:null};}};
  const context={module:{exports:{}},exports:{},window:{location:{pathname:path}},localStorage:{getItem:k=>local.get(k)??null},makeClient:()=>api,console};
  vm.runInNewContext(code,context);
  return { exports:context.module.exports, local,calls, deny:()=>{allow=false;} };
}
const staff={token:'s'.repeat(64),expiresAt:Date.now()+60000};
let t=setup();
assert.equal(await t.exports.ensureSession(),false);
assert.equal(t.calls.length,0);
t.local.set('rejunk_staff_session',JSON.stringify(staff));
assert.deepEqual(await Promise.all([t.exports.ensureSession(),t.exports.ensureSession()]),[true,true]);
assert.equal(t.calls.filter(x=>typeof x==='object').length,1);
assert.equal(t.calls[1].args.staff_token,staff.token);
await t.exports.clearDatabaseIdentity();
assert.equal(t.calls.at(-1),'signout');
assert.equal(t.calls.at(-2).name,'bind_business_identity');
t=setup(); t.deny(); t.local.set('rejunk_staff_session',JSON.stringify(staff));
assert.equal(await t.exports.ensureSession(),false);
assert.equal(await t.exports.ensureSession(),false);
assert.equal(t.calls.filter(x=>typeof x==='object').length,2);
t=setup('/driver'); t.local.set('rejunk_staff_session',JSON.stringify(staff));
assert.equal(await t.exports.ensureSession(),false);
t.local.set('rejunk_driver_session',JSON.stringify({sessionToken:'d'.repeat(64)}));
assert.equal(await t.exports.ensureSession(),true);
assert.equal(t.calls[1].args.driver_token,'d'.repeat(64));
assert.equal(t.calls[1].args.staff_token,undefined);
console.log('PASS: no guest signup, verified binding, concurrent calls, logout, denied retry, office/driver separation');
