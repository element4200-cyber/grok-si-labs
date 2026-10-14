import {projectsAPI} from './projects.js';
const security={'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Cache-Control':'no-store'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...security,'Content-Type':'application/json'}});
const methods=new Set(['getBalance','getLatestBlockhash','getAccountInfo','getMultipleAccounts','getMinimumBalanceForRentExemption','getFeeForMessage','simulateTransaction','sendTransaction','getSignatureStatuses','getBlockHeight','getVersion']);
async function forwardRpc(payload,env){
 const primary=env.SOLANA_RPC_URL||'https://api.mainnet-beta.solana.com';
 const publicEndpoints=new Set(['https://api.mainnet-beta.solana.com','https://solana-rpc.publicnode.com','https://solana.publicnode.com']);
 const endpoints=publicEndpoints.has(primary)?[primary,'https://rpc.solanatracker.io/public']:[primary];
 const body=JSON.stringify(payload);let last;
 for(let i=0;i<endpoints.length;i++){
  try{
   const upstream=await fetch(endpoints[i],{method:'POST',headers:{'Content-Type':'application/json'},body,signal:AbortSignal.timeout(20000)});
   const text=await upstream.text();let parsed;try{parsed=JSON.parse(text);}catch{}
   const limited=[403,429,502,503,504].includes(upstream.status)||/rate limit|too many requests|request limit|throttl/i.test(parsed?.error?.message||'');
   last=new Response(text,{status:upstream.status,headers:{...security,'Content-Type':'application/json',...(upstream.headers.get('Retry-After')?{'Retry-After':upstream.headers.get('Retry-After')}:{})}});
   if(!limited||i===endpoints.length-1)return last;
  }catch(error){if(payload.method==='sendTransaction'||i===endpoints.length-1)throw error;}
 }
 return last;
}
export default {async fetch(request,env={}){const url=new URL(request.url);try{
 if(url.pathname==='/assets/grok-laboratory.webp'){const data=Uint8Array.from(atob(__HERO__),c=>c.charCodeAt(0));return new Response(data,{headers:{...security,'Content-Type':'image/webp','Cache-Control':'public, max-age=3600'}});}
 if(url.pathname==='/favicon.svg')return new Response(__FAVICON__,{headers:{...security,'Content-Type':'image/svg+xml','Cache-Control':'public, max-age=3600'}});
 if(url.pathname.startsWith('/api/projects'))return await projectsAPI(request,env,url);
 if(url.pathname==='/api/status')return json({signedIn:!!request.headers.get('oai-authenticated-user-id'),grokConfigured:!!env.GROK_API_KEY,model:env.GROK_MODEL||'grok-4.7',network:'mainnet-beta'});
 if(url.pathname==='/api/rpc'&&request.method==='POST'){if(Number(request.headers.get('content-length'))>200000)return json({error:'Request too large'},413);const payload=await request.json();if(!methods.has(payload.method)||Array.isArray(payload))return json({error:'RPC method not supported'},400);return await forwardRpc(payload,env);}
 if(url.pathname==='/api/metadata'&&request.method==='POST'){if(Number(request.headers.get('content-length'))>6000000)return json({error:'Use an image below 5 MB'},413);const data=await request.formData();const file=data.get('file');if(!file||file.size>5000000||!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))return json({error:'Use a PNG, JPG, WebP or GIF below 5 MB'},400);const clean=new FormData();for(const k of ['file','name','symbol','description','twitter','telegram','website'])if(data.has(k))clean.set(k,data.get(k));clean.set('showName','true');const upstream=await fetch('https://pump.fun/api/ipfs',{method:'POST',body:clean,signal:AbortSignal.timeout(45000)});if(!upstream.ok)return json({error:'Pump.fun metadata upload is unavailable. Supply an existing HTTPS metadata JSON URL instead.'},502);return json(await upstream.json());}
 if(url.pathname==='/api/grok'&&request.method==='POST'){const key=env.GROK_API_KEY||request.headers.get('X-Grok-Key');if(!key)return json({error:'Add your xAI API key in Settings to activate Grok chat and app generation.'},503);const input=await request.json();if(!Array.isArray(input.messages)||input.messages.length>40||JSON.stringify(input).length>100000)return json({error:'Conversation is too large'},400);const upstream=await fetch('https://api.x.ai/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:env.GROK_MODEL||'grok-4.7',input:input.messages,max_output_tokens:Math.min(input.max_tokens||3000,12000),store:false,reasoning:{effort:'low'}}),signal:AbortSignal.timeout(180000)});if(!upstream.ok)return json({error:upstream.status===401?'The xAI API key was rejected. Check it in Settings.':upstream.status===429?'xAI rate limit reached. Try again shortly.':'Grok could not complete this request ('+upstream.status+').'},upstream.status===401?401:502);const result=await upstream.json();return json({text:result.output?.filter(x=>x.type==='message').flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('\n')||'',usage:result.usage});}
 if(url.pathname.startsWith('/api/'))return json({error:'Not found'},404);
 if(url.pathname==='/app.js'||url.pathname==='/launch.js')return new Response(url.pathname==='/app.js'?__APP__:__LAUNCH__,{headers:{...security,'Content-Type':'text/javascript; charset=utf-8'}});
 if(request.method!=='GET'&&request.method!=='HEAD')return json({error:'Method not allowed'},405);
 return new Response(__HTML__,{headers:{...security,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' http://127.0.0.1:4318 http://localhost:4318; frame-src blob:; object-src 'none'; base-uri 'self'"}});
 }catch(e){return json({error:e.name==='TimeoutError'?'The service timed out. Please try again.':'The request failed. Check your connection and try again.'},502);}}};
