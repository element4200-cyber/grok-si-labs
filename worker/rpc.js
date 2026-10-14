const security={'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':'no-store'};
export async function forwardRpc(payload,env){
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
