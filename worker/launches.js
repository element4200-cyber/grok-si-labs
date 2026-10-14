import {PublicKey} from '@solana/web3.js';
import recovered from '../db/recovered-launches.json' with {type:'json'};
import {forwardRpc} from './rpc.js';
import {PUMP_PROGRAM,validAddress,decode58,publicURL,canonicalToken,creationProof} from './token-proof.js';
const response=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');
export function curveForMint(mint){return PublicKey.findProgramAddressSync([new TextEncoder().encode('bonding-curve'),decode58(mint)],new PublicKey(PUMP_PROGRAM))[0].toBase58();}
async function rpc(method,params,env){const res=await forwardRpc({jsonrpc:'2.0',id:1,method,params},env);const d=await res.json();if(!res.ok||d.error||!Object.hasOwn(d,'result'))throw Error('Solana verification is temporarily unavailable. Check status again shortly.');return d.result;}
async function metadataImage(uri){
 const initial=publicURL(uri);if(!initial)return '';const parsed=new URL(initial);
 const urls=[initial],deadline=Date.now()+20000;if(parsed.pathname.startsWith('/ipfs/'))urls.push('https://ipfs.io'+parsed.pathname,'https://dweb.link'+parsed.pathname);
 for(const candidate of urls){if(Date.now()>=deadline)break;try{let url=candidate,r;for(let redirect=0;redirect<4;redirect++){
   const remaining=deadline-Date.now();if(remaining<=0)throw Error('Metadata deadline');
   r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(Math.min(7000,remaining))});
   if(r.status>=300&&r.status<400){const location=r.headers.get('Location');if(!location)throw Error('Missing redirect');url=publicURL(new URL(location,url).href,false);if(!url)throw Error('Unsafe redirect');continue;}break;
  }
  if(!r.ok||Number(r.headers.get('Content-Length'))>65536)continue;
  const reader=r.body.getReader();let length=0,chunks=[];for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>65536){await reader.cancel();throw Error('Metadata too large');}chunks.push(value);}const bytes=new Uint8Array(length);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}const d=JSON.parse(new TextDecoder().decode(bytes));const image=publicURL(d.image);if(image)return image;
 }catch{}}
 return '';
}
async function readToken(mint,env){const result=await rpc('getMultipleAccounts',[[mint,curveForMint(mint)],{encoding:'jsonParsed',commitment:'confirmed'}],env);return canonicalToken(result.value,mint);}
export async function launchesAPI(request,env,url){
 const db=env.DB;if(!db)return response({error:'Shared launch storage is unavailable.'},503);
 if(request.method==='GET'&&url.pathname==='/api/launches'){
  const limit=Math.min(100,Math.max(1,Number(url.searchParams.get('limit'))||100)),offset=Math.max(0,Math.min(100000,Number(url.searchParams.get('offset'))||0));
  const {results}=await db.prepare('SELECT mint,name,symbol,uri,image_uri,signature,project_id,confirmed_at,source FROM launches WHERE confirmed_at IS NOT NULL ORDER BY confirmed_at DESC,mint ASC LIMIT ? OFFSET ?').bind(Math.trunc(limit),Math.trunc(offset)).all();
  const total=(await db.prepare('SELECT COUNT(*) AS total FROM launches WHERE confirmed_at IS NOT NULL').first()).total;
  return response({launches:results,total,nextOffset:offset+results.length<total?offset+results.length:null});
 }
 if(request.method!=='POST')return response({error:'Not found'},404);
 const raw=await request.text();if(raw.length>6000)return response({error:'Launch record is too large.'},413);let d;try{d=JSON.parse(raw);}catch{return response({error:'Invalid launch record.'},400);}
 if(!validAddress(d.mint))return response({error:'Invalid contract address.'},400);
 if(url.pathname==='/api/launches/prepare'){
  if(!validAddress(d.wallet)||typeof d.name!=='string'||!d.name.trim()||[...d.name].length>32||!(/^[A-Z0-9]{1,13}$/).test(d.symbol||'')||!publicURL(d.uri)||new TextEncoder().encode(d.uri).length>200)return response({error:'Invalid prepared launch details.'},400);
  const existing=await db.prepare('SELECT mint FROM launches WHERE mint = ?').bind(d.mint).first();if(existing)return response({error:'This mint already has a launch record. Check its status.'},409);
  const account=await rpc('getAccountInfo',[d.mint,{encoding:'base64',commitment:'confirmed'}],env);
  if(!Object.hasOwn(account,'value')||account.value!==null)return response({error:'This token already exists. Prepare a new launch.'},409);
  const receipt=crypto.randomUUID()+crypto.randomUUID();let projectId=null;
  if(typeof d.projectId==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(d.projectId)){
   const project=await db.prepare('SELECT owner,published FROM projects WHERE id = ?').bind(d.projectId).first();
   if(project?.published&&project.owner===request.headers.get('oai-authenticated-user-id'))projectId=d.projectId;
  }
  await db.prepare('INSERT INTO launches (mint,wallet,name,symbol,uri,receipt_hash,prepared_at,min_slot,project_id) VALUES (?,?,?,?,?,?,?,?,?)').bind(d.mint,d.wallet,d.name,d.symbol,d.uri,await digest(receipt),Date.now(),account.context.slot,projectId).run();
  return response({receipt,mint:d.mint});
 }
 if(url.pathname==='/api/launches/confirm'){
  const record=await db.prepare('SELECT * FROM launches WHERE mint = ?').bind(d.mint).first();if(!record||typeof d.receipt!=='string'||record.receipt_hash!==await digest(d.receipt))return response({error:'The saved launch receipt is missing or invalid.'},403);
  if(record.confirmed_at&&record.image_uri)return response({saved:true,mint:d.mint});
  let signature=null,confirmedAt=Date.now();
  if(d.signature){try{if(decode58(d.signature).length!==64)throw Error();}catch{return response({error:'Invalid transaction signature.'},400);}
   const tx=await rpc('getTransaction',[d.signature,{encoding:'json',commitment:'confirmed',maxSupportedTransactionVersion:1}],env);if(!tx)return response({error:'Transaction confirmation is still being indexed. Check status again shortly.'},409);
   try{await creationProof(tx,record,d.signature);}catch(e){return response({error:e.message},409);}signature=d.signature;confirmedAt=tx.blockTime?tx.blockTime*1000:Date.now();
  }
  let token;try{token=await readToken(d.mint,env);}catch(e){return response({error:e.message},409);}
  if(token.name!==record.name||token.symbol!==record.symbol||token.uri!==record.uri)return response({error:'Token metadata differs from the prepared launch.'},409);
  const image=await metadataImage(token.uri);
  await db.prepare('UPDATE launches SET image_uri=?,signature=COALESCE(?,signature),confirmed_at=COALESCE(confirmed_at,?) WHERE mint=?').bind(image,signature,confirmedAt,d.mint).run();
  return response({saved:true,mint:d.mint});
 }
 if(url.pathname==='/api/launches/recover'){
  // Only the historical CAs explicitly supplied by the Site owner may be recovered.
  if(!recovered.some(t=>t.mint===d.mint))return response({error:'This CA is not in the approved historical launch list.'},403);
  const old=await db.prepare('SELECT image_uri FROM launches WHERE mint = ? AND confirmed_at IS NOT NULL').bind(d.mint).first();if(old?.image_uri)return response({saved:true,mint:d.mint});
  const token=await readToken(d.mint,env),cached=recovered.find(t=>t.mint===d.mint);const image=await metadataImage(token.uri)||(cached?.uri===token.uri?publicURL(cached.image_uri):'');
  await db.prepare("INSERT INTO launches (mint,wallet,name,symbol,uri,image_uri,receipt_hash,prepared_at,confirmed_at,source) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(mint) DO UPDATE SET image_uri=excluded.image_uri,confirmed_at=COALESCE(launches.confirmed_at,excluded.confirmed_at)").bind(token.mint,'',token.name,token.symbol,token.uri,image,'historical-owner-approved',Date.now(),Date.now(),'recovered').run();
  return response({saved:true,mint:d.mint,name:token.name,symbol:token.symbol,image_uri:image});
 }
 return response({error:'Not found'},404);
}
