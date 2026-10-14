import {Buffer} from 'buffer';
import {Keypair,PublicKey,VersionedTransaction,TransactionMessage,ComputeBudgetProgram} from '@solana/web3.js';
import {PUMP_SDK,GLOBAL_PDA,PUMP_FEE_CONFIG_PDA,PUMP_PROGRAM_ID,newBondingCurve,getBuyV3TokenAmountFromQuoteAmount,holderRewardsPda,bondingCurvePda} from '@pump-fun/pump-sdk';
import {validateToken,solToLamports} from './shared.js';
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
const launchSigners=new WeakMap();
export async function prepareLaunch(input,wallet,onStatus=()=>{}){
 const request=(method,params)=>rpc(method,params,{onRetry:onStatus});
 const data=validateToken(input);
 const devBuyLamports=solToLamports(data.devBuy?data.devBuySol:'0','Dev buy');
 if(data.devBuy&&devBuyLamports==='0')throw Error('Enter a dev buy greater than 0 SOL or turn it off.');
 const priorityLamports=Number(solToLamports(data.prioritySol||'0','Priority fee'));
 if(priorityLamports>10000000)throw Error('Priority fee must not exceed 0.01 SOL.');
 if(!data.uri)throw Error('A metadata URL is required.');
 const user=new PublicKey(wallet.publicKey.toString());
 const mint=Keypair.generate();
 const ix=await PUMP_SDK.createV2Instruction({mint:mint.publicKey,name:data.name,symbol:data.symbol,uri:data.uri,creator:user,user,mayhemMode:false,holderReward:!!data.holderReward});
 const instructions=[ix];let minimumTokens=null;
 if(devBuyLamports!=='0'){
  onStatus('Quoting your optional dev buy…');
  const accounts=(await request('getMultipleAccounts',[[GLOBAL_PDA.toBase58(),PUMP_FEE_CONFIG_PDA.toBase58()],{encoding:'base64',commitment:'confirmed'}])).value;
  const account=a=>{if(!a)throw Error('Pump fee configuration is unavailable. Try preparing again.');return {...a,data:Buffer.from(a.data[0],'base64'),owner:new PublicKey(a.owner)};};
  const global=PUMP_SDK.decodeGlobal(account(accounts[0])),feeConfig=PUMP_SDK.decodeFeeConfig(account(accounts[1]));
  const curve=newBondingCurve(global,PublicKey.default,undefined,undefined,!!data.holderReward);
  curve.creator=data.holderReward?holderRewardsPda(mint.publicKey):user;curve.isMayhemMode=false;
  // Use the SDK's decoded BN type; keep the user's maximum SOL budget exact.
  const budget=new global.initialVirtualTokenReserves.constructor(devBuyLamports);
  const amount=getBuyV3TokenAmountFromQuoteAmount({global,feeConfig,mintSupply:global.tokenTotalSupply,bondingCurve:curve,amount:budget});
  if(amount.isZero())throw Error('Dev buy is too small to receive tokens.');
  minimumTokens=amount.sub(amount.divn(100)).toString();
  instructions.push(...await PUMP_SDK.buyExactQuoteInV3Instructions({bondingCurve:curve,associatedUserAccountInfo:null,mint:mint.publicKey,user,amount,quoteAmount:budget,slippage:1,partialFill:false}));
 }
 const computeUnits=devBuyLamports==='0'?300000:500000;
 instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({units:computeUnits}));
 if(priorityLamports)instructions.unshift(ComputeBudgetProgram.setComputeUnitPrice({microLamports:Math.floor(priorityLamports*1000000/computeUnits)}));
 const {blockhash,lastValidBlockHeight}=(await request('getLatestBlockhash',[{commitment:'confirmed'}])).value;
 const message=new TransactionMessage({payerKey:user,recentBlockhash:blockhash,instructions}).compileToV0Message();
 const tx=new VersionedTransaction(message);tx.sign([mint]);
 let serialized;
 try{serialized=tx.serialize();if(serialized.length>1232)throw Error('too large');}
 catch{throw Error('The launch exceeds Solana’s 1,232-byte transaction limit. Shorten the token name, ticker or metadata URL, or turn off the dev buy. No transaction was submitted.');}
 // A throttled simulation can outlive the preview hash; let the RPC replace it.
 const simulation=await request('simulateTransaction',[Buffer.from(serialized).toString('base64'),{encoding:'base64',sigVerify:false,replaceRecentBlockhash:true,commitment:'confirmed'}]);
 if(simulation.value.err)throw Error('Launch simulation failed: '+JSON.stringify(simulation.value.err)+'. Check your SOL balance and metadata.');
 const prepared={tx,mint:mint.publicKey.toBase58(),user:user.toBase58(),data,devBuyLamports,minimumTokens,priorityLamports,fee:simulation.value.fee??5000*message.header.numRequiredSignatures+priorityLamports,blockhash,lastValidBlockHeight,units:simulation.value.unitsConsumed};
 // Retain this mint's signer only in memory so refreshing never changes the coin.
 launchSigners.set(prepared,mint);
 return prepared;
}
export function encodeBase58(bytes){const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=0n;for(const b of bytes)n=n*256n+BigInt(b);let out='';while(n>0n){out=alphabet[Number(n%58n)]+out;n/=58n}for(const b of bytes){if(b!==0)break;out='1'+out}return out;}
export async function signAndSend(prepared,wallet,onStatus=()=>{},onSubmitted=()=>{},options={}){
 const request=(method,params)=>rpc(method,params,{onRetry:onStatus});
 if(wallet.publicKey?.toString()!==prepared.user)throw Error('Wallet changed. Prepare this launch again.');
 const mintSigner=launchSigners.get(prepared);
 if(!mintSigner)throw Error('This launch session is unavailable. Prepare the launch again.');
 if(prepared.submissionStarted)throw Error('This launch was already submitted or its submission is uncertain. Check its status before launching again.');
 let signed,signature;
 for(let attempt=0;attempt<2;attempt++){
  if(wallet.publicKey?.toString()!==prepared.user)throw Error('Wallet changed. Prepare this launch again.');
  onStatus('Refreshing your launch transaction…');
  const latest=(await request('getLatestBlockhash',[{commitment:'confirmed'}])).value;
  prepared.tx.message.recentBlockhash=latest.blockhash;
  prepared.tx=new VersionedTransaction(prepared.tx.message);
  prepared.tx.sign([mintSigner]);
  prepared.blockhash=latest.blockhash;prepared.lastValidBlockHeight=latest.lastValidBlockHeight;
  const originalMessage=Buffer.from(prepared.tx.message.serialize()).toString('base64');
  onStatus('Review the creation'+(prepared.devBuyLamports!=='0'?' and dev buy':'')+' in your wallet.');
  if(typeof wallet.signAndSendTransaction==='function'){
   // Phantom broadcasts immediately on approval using its own connection.
   // Never fall back to another send if the wallet's response is uncertain.
   prepared.submissionStarted=true;
   try{
    let timer;
    const response=Promise.resolve().then(()=>wallet.signAndSendTransaction(prepared.tx,{skipPreflight:false,preflightCommitment:'confirmed',maxRetries:5}));
    response.then(result=>{if(result?.signature)onSubmitted({signature:result.signature,mint:prepared.mint,status:'pending'});},()=>{});
    const result=await Promise.race([response,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Wallet submission timed out.')),options.walletTimeoutMs??120000);})]).finally(()=>clearTimeout(timer));
    if(!result?.signature)throw Error('Wallet did not return a transaction signature.');
    signature=result.signature;
   }catch(error){
    if(error.code===4001||/user rejected|user denied|cancelled by user/i.test(error.message)){prepared.submissionStarted=false;throw error;}
    onSubmitted({mint:prepared.mint,status:'submission unknown'});
    throw Object.assign(Error('Phantom did not return a signature. Check Phantom activity and use Check status in My creations before trying another launch. '+error.message),{submissionUnknown:true});
   }
   break;
  }
  signed=await wallet.signTransaction(prepared.tx);
  if(Buffer.from(signed.message.serialize()).toString('base64')!==originalMessage)throw Error('Wallet returned a different transaction. Prepare the launch again.');
  if(!signed.signatures[0]?.some(b=>b!==0))throw Error('Wallet did not sign the transaction.');
  if(await request('getBlockHeight',[{commitment:'confirmed'}])<=prepared.lastValidBlockHeight)break;
  signed=null;
  if(attempt===1)throw Error('Wallet approval expired before submission. Click Review & sign again for a fresh transaction.');
  onStatus('The wallet approval window elapsed. Refreshing the same coin; please approve again.');
 }
 if(!signature)signature=encodeBase58(signed.signatures[0]);
 prepared.submissionStarted=true;
 onSubmitted({signature,mint:prepared.mint,status:'pending'});
 try{
  if(signed){
   onStatus('Submitting your signed transaction…');
   signature=await request('sendTransaction',[Buffer.from(signed.serialize()).toString('base64'),{encoding:'base64',skipPreflight:false,preflightCommitment:'confirmed',maxRetries:5}]);
   onSubmitted({signature,mint:prepared.mint,status:'pending'});
  }
  onStatus('Submitted: '+signature+'\nWaiting for confirmation…');
  const wait=options.wait||((ms)=>new Promise(r=>setTimeout(r,ms))),deadline=Date.now()+(options.timeoutMs??180000);
  for(let i=0;Date.now()<deadline&&i<(options.maxPolls??45);i++){
   let result;
   try{result=await checkLaunch({signature,mint:prepared.mint},onStatus,{checkMint:false});}
   catch{onStatus('Transaction submitted. The free RPC is busy checking confirmation; your signature is saved.');await wait(4000);continue;}
   if(result.status==='failed')throw Object.assign(Error(result.message),{code:'TRANSACTION_FAILED'});
   if(result.status==='confirmed')return {signature,mint:prepared.mint};
   if(i%5===0){
    let height;try{height=await request('getBlockHeight',[{commitment:'confirmed'}]);}catch{height=null;}
    if(height>prepared.lastValidBlockHeight)throw Object.assign(Error('Confirmation window ended. Check the signature before trying again.'),{code:'CONFIRMATION_PENDING'});
   }
   await wait(4000);
  }
  throw Object.assign(Error('Confirmation is still pending. Your signature is saved in My creations. Use Check status before launching again.'),{code:'CONFIRMATION_PENDING'});
 }catch(e){throw Object.assign(e,{signature});}
}
export async function checkLaunch(record,onStatus=()=>{},{checkMint=true}={}){
 const request=(method,params)=>rpc(method,params,{onRetry:onStatus});
 if(record.signature){
  const status=(await request('getSignatureStatuses',[[record.signature],{searchTransactionHistory:true}])).value[0];
  if(status?.err)return {status:'failed',message:'Transaction failed: '+JSON.stringify(status.err)};
  if(['confirmed','finalized'].includes(status?.confirmationStatus))return {status:'confirmed'};
  if(status?.confirmationStatus==='processed')return {status:'pending'};
 }
 if(checkMint&&record.mint){
  const mint=new PublicKey(record.mint),curve=bondingCurvePda(mint);
  const accounts=(await request('getMultipleAccounts',[[mint.toBase58(),curve.toBase58()],{encoding:'base64',commitment:'confirmed'}])).value;
  if(accounts[0]&&accounts[1]?.owner===PUMP_PROGRAM_ID.toBase58())return {status:'confirmed'};
 }
 return {status:'pending',message:'Not confirmed yet. Check Phantom activity or the transaction link before trying another launch.'};
}
