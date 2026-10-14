import {Buffer} from 'buffer';
import {Keypair,PublicKey,VersionedTransaction,TransactionMessage,ComputeBudgetProgram} from '@solana/web3.js';
import {PUMP_SDK} from '@pump-fun/pump-sdk';
import {validateToken} from './shared.js';
export async function rpc(method,params=[],{wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),onRetry=()=>{}}={}){
 const delays=[3000,8000,20000];
 const body=JSON.stringify({jsonrpc:'2.0',id:1,method,params});
 for(let attempt=0;;attempt++){
  const res=await fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body});
  const raw=await res.text();let data;
  try{data=JSON.parse(raw);}catch{data={error:raw.slice(0,300)||'RPC unavailable'};}
  if(res.ok&&!data.error)return data.result;
  const message=data.error?.message||(typeof data.error==='string'?data.error:'RPC unavailable');
  const throttled=res.status===429||/rate limit|too many requests|request limit|throttl/i.test(message);
  if(!throttled)throw Error(message);
  if(attempt===delays.length)throw Object.assign(Error('The free Solana RPC is still busy after automatic retries. Wait a minute, then try again. No extra wallet approval is needed for these retries.'),{code:'RPC_RATE_LIMIT'});
  const retryHeader=res.headers.get('Retry-After');
  const retrySeconds=retryHeader?Number(retryHeader):0;
  const delay=Math.min(30000,Math.max(delays[attempt],Number.isFinite(retrySeconds)?retrySeconds*1000:0));
  onRetry('Free RPC busy. Retrying in '+Math.ceil(delay/1000)+' seconds ('+(attempt+1)+'/3)…');
  await wait(delay);
 }
}
export async function prepareLaunch(input,wallet,onStatus=()=>{}){const request=(method,params)=>rpc(method,params,{onRetry:onStatus});const data=validateToken(input);if(!data.uri)throw Error('A metadata URL is required.');const user=new PublicKey(wallet.publicKey.toString());const mint=Keypair.generate();const ix=await PUMP_SDK.createV2Instruction({mint:mint.publicKey,name:data.name,symbol:data.symbol,uri:data.uri,creator:user,user,mayhemMode:false,holderReward:!!data.holderReward});const {blockhash,lastValidBlockHeight}= (await request('getLatestBlockhash',[{commitment:'confirmed'}])).value;const message=new TransactionMessage({payerKey:user,recentBlockhash:blockhash,instructions:[ComputeBudgetProgram.setComputeUnitLimit({units:300000}),ix]}).compileToV0Message();const tx=new VersionedTransaction(message);tx.sign([mint]);const simulation=await request('simulateTransaction',[Buffer.from(tx.serialize()).toString('base64'),{encoding:'base64',sigVerify:false,commitment:'confirmed'}]);if(simulation.value.err)throw Error('Launch simulation failed: '+JSON.stringify(simulation.value.err)+'. Check your SOL balance and metadata.');const fee=(await request('getFeeForMessage',[Buffer.from(message.serialize()).toString('base64'),{commitment:'confirmed'}])).value;return {tx,mint:mint.publicKey.toBase58(),user:user.toBase58(),data,fee:fee??10000,blockhash,lastValidBlockHeight,units:simulation.value.unitsConsumed};}
export function encodeBase58(bytes){const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=0n;for(const b of bytes)n=n*256n+BigInt(b);let out='';while(n>0n){out=alphabet[Number(n%58n)]+out;n/=58n}for(const b of bytes){if(b!==0)break;out='1'+out}return out;}
export async function signAndSend(prepared,wallet,onStatus){
 const request=(method,params)=>rpc(method,params,{onRetry:onStatus});
 if(wallet.publicKey?.toString()!==prepared.user)throw Error('Wallet changed. Prepare this launch again.');
 if(await request('getBlockHeight',[{commitment:'confirmed'}])>prepared.lastValidBlockHeight)throw Error('The launch preview expired. Prepare it again.');
 const originalMessage=Buffer.from(prepared.tx.message.serialize()).toString('base64');
 onStatus('Review and approve the token creation in your wallet.');
 const signed=await wallet.signTransaction(prepared.tx);
 if(Buffer.from(signed.message.serialize()).toString('base64')!==originalMessage)throw Error('Wallet returned a different transaction. Prepare the launch again.');
 if(!signed.signatures[0]?.some(b=>b!==0))throw Error('Wallet did not sign the transaction.');
 let signature=encodeBase58(signed.signatures[0]);
 try{
  onStatus('Submitting your signed transaction…');
  signature=await request('sendTransaction',[Buffer.from(signed.serialize()).toString('base64'),{encoding:'base64',skipPreflight:false,preflightCommitment:'confirmed',maxRetries:3}]);
  onStatus('Submitted: '+signature+'\nWaiting for confirmation…');
  for(let i=0;i<45;i++){
   const status=(await request('getSignatureStatuses',[[signature],{searchTransactionHistory:true}])).value[0];
   if(status?.err)throw Error('Transaction failed: '+JSON.stringify(status.err));
   if(['confirmed','finalized'].includes(status?.confirmationStatus))return {signature,mint:prepared.mint};
   if(await request('getBlockHeight',[{commitment:'confirmed'}])>prepared.lastValidBlockHeight)throw Error('Confirmation window ended. Check the signature before trying again.');
   await new Promise(r=>setTimeout(r,1800));
  }
  throw Error('Confirmation is still pending. Check the signature before launching again.');
 }catch(e){throw Object.assign(e,{signature});}
}
