import { build } from "esbuild";
import vm from "node:vm";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const requireReal=createRequire(import.meta.url);
let mode="allow", paidCalls=0, reservations=0;
const rpcArgs=[];
const db={
 from(table) { return { select(){return this;}, eq(){return this;}, async maybeSingle(){
   return {data: table==="staff_sessions" ? {staff_id:"staff",expires_at:"2099-01-01"} :
     table==="staff" ? {id:"staff",active:true} : {value:{systemInstructions:"Estimate the photos."}}};
 } }; },
 async rpc(name,args) {
   assert.equal(name,"reserve_vision_analysis");rpcArgs.push(args);reservations++;
   if(mode==="throw") throw Error("Unavailable");
   if(mode==="error") return {error:{message:"Unavailable"},data:null};
   if(mode==="malformed") return {data:{}};
   return {data:{allowed:mode==="allow",retry_after:mode==="allow"?0:300}};
 }
};
for(const file of ["server/visionAnalyze.ts","api/vision-analyze.ts"]){
 const bundle=await build({entryPoints:[file],bundle:true,platform:"node",format:"cjs",packages:"external",write:false});
 function freshServer(){
  const module={exports:{}};
  vm.runInNewContext(bundle.outputFiles[0].text,{
   module,exports:module.exports,console,Buffer,Date,Map,Set,AbortSignal,setTimeout,clearTimeout,
   process:{env:{SUPABASE_URL:"https://test.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"test",OPENAI_API_KEY:"test"}},
   require:name=>name==="@supabase/supabase-js"?{createClient:()=>db}:requireReal(name),
   fetch:async()=>{paidCalls++;return {ok:true,json:async()=>({choices:[{message:{content:"{}"}}]})};}
  });
  return async(body)=>{
   if(module.exports.handleVisionRequest) return module.exports.handleVisionRequest(body,"192.0.2.5");
   const result={headers:{}};
   const res={setHeader(k,v){result.headers[k]=v;},status(s){result.status=s;return this;},json(b){result.body=b;}};
   await module.exports.default({method:"POST",body,headers:{"x-forwarded-for":"192.0.2.5"}},res);
   return result;
  };
 }
 const payload={photos:["data:image/jpeg;base64,AA=="],source:"public",staffId:"forged",max:999999};
 mode="allow";let before=paidCalls;
 assert.equal((await freshServer()(payload)).status,200);
 assert.equal(paidCalls,before+1);
 assert.equal(rpcArgs.at(-1).staff_id,null);
 assert.equal(rpcArgs.at(-1).client_ip,"192.0.2.5");
 // Fresh process/instance must ask shared storage again, never reset a local Map.
 mode="deny";before=paidCalls;
 const limited=await freshServer()(payload);
 assert.equal(limited.status,429);assert.equal(limited.body.retryAfterSeconds,300);
 if(limited.headers) assert.equal(limited.headers["Retry-After"],"300");
 for(mode of ["error","throw","malformed"]) assert.equal((await freshServer()(payload)).status,503);
 assert.equal(paidCalls,before);
 mode="allow";before=reservations;
 assert.equal((await freshServer()({...payload,source:"",staffToken:""})).status,401);
 assert.equal(reservations,before);
 assert.equal((await freshServer()({...payload,source:"",staffToken:"valid"})).status,200);
 assert.equal(rpcArgs.at(-1).staff_id,"staff"); // From verified lookup, never payload.
 assert.equal((await freshServer()({photos:[]})).status,400);
}
console.log("PASS: both AI endpoints reserve before paid calls, survive fresh instances, fail closed, preserve auth and expose retry timing");
