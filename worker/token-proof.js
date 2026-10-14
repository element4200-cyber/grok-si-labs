export const PUMP_PROGRAM='6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const TOKEN_2022='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function decode58(text){if(typeof text!=='string'||text.length>1100)throw Error('Invalid base58');let n=0n;for(const c of text){const i=alphabet.indexOf(c);if(i<0)throw Error('Invalid base58');n=n*58n+BigInt(i);}const bytes=[];while(n){bytes.unshift(Number(n%256n));n/=256n;}for(const c of text){if(c!=='1')break;bytes.unshift(0);}return Uint8Array.from(bytes);}
export function validAddress(text){try{return decode58(text).length===32;}catch{return false;}}
export function publicURL(value,normalize=true){try{let text=String(value||'');if(text.startsWith('ipfs://'))text='https://gateway.pinata.cloud/ipfs/'+text.slice(7).replace(/^ipfs\//,'');const u=new URL(text);if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||text.length>1500)return '';const h=u.hostname.toLowerCase();if(h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||h.includes(':')||/^\d+(?:\.\d+){3}$/.test(h)||h==='0'||h.endsWith('.internal'))return '';if(normalize&&u.hostname==='ipfs.io'&&u.pathname.startsWith('/ipfs/'))u.hostname='gateway.pinata.cloud';return u.href;}catch{return '';}}
export function canonicalToken(accounts,mint){const [account,curve]=accounts;const info=account?.data?.parsed?.info,metadata=info?.extensions?.find(x=>x.extension==='tokenMetadata')?.state;if(account?.owner!==TOKEN_2022||!info?.isInitialized||curve?.owner!==PUMP_PROGRAM||metadata?.mint!==mint||!metadata.name||!metadata.symbol||!publicURL(metadata.uri))throw Error('This CA is not a confirmed Pump token with valid metadata.');return {mint,name:metadata.name,symbol:metadata.symbol,uri:metadata.uri};}
export async function creationProof(tx,record,signature){
 if(!tx||!tx.meta||tx.meta.err!==null||tx.slot<record.min_slot)throw Error('The creation transaction is not confirmed.');
 const message=tx.transaction?.message,signatures=tx.transaction?.signatures||[];
 if(signatures[0]!==signature)throw Error('Transaction signature does not match.');
 const keys=[...(message?.accountKeys||[]),...(tx.meta.loadedAddresses?.writable||[]),...(tx.meta.loadedAddresses?.readonly||[])];
 const discriminator=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('global:create_v2'))).slice(0,8);
 for(const ix of message?.instructions||[]){
  if(keys[ix.programIdIndex]!==PUMP_PROGRAM||keys[ix.accounts?.[0]]!==record.mint||keys[ix.accounts?.[5]]!==record.wallet)continue;
  const data=decode58(ix.data);if(!discriminator.every((b,i)=>b===data[i]))continue;
  const signerKeys=keys.slice(0,message.header.numRequiredSignatures);if(!signerKeys.includes(record.wallet)||!signerKeys.includes(record.mint))continue;
  let offset=8;const values=[];for(let i=0;i<3;i++){if(offset+4>data.length)throw Error('Invalid create instruction');const length=new DataView(data.buffer,data.byteOffset+offset,4).getUint32(0,true);offset+=4;if(length>400||offset+length>data.length)throw Error('Invalid create instruction');values.push(new TextDecoder('utf-8',{fatal:true}).decode(data.slice(offset,offset+length)));offset+=length;}
  if(values[0]!==record.name||values[1]!==record.symbol||values[2]!==record.uri)throw Error('The confirmed token differs from the prepared launch.');
  return true;
 }
 throw Error('This transaction does not create the prepared token on Pump.');
}
