import test from 'node:test';
import assert from 'node:assert/strict';
import {Keypair,VersionedTransaction} from '@solana/web3.js';
import {prepareLaunch,signAndSend} from '../src/launch.js';

const input={name:'Expiry test',symbol:'EXPIRY',description:'Offline launch regression',uri:'https://example.com/metadata.json'};
function network(t,{height=()=>100,status={confirmationStatus:'confirmed',err:null}}={}){
 const calls=[],hashes=[];let heights=0,submitted;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  assert.equal(url,'/api/rpc');const p=JSON.parse(options.body);calls.push(p);
  let result;
  if(p.method==='getLatestBlockhash'){
   const blockhash=Keypair.generate().publicKey.toBase58();hashes.push(blockhash);
   result={value:{blockhash,lastValidBlockHeight:hashes.length===1?10:hashes.length*1000}};
  }else if(p.method==='simulateTransaction'){
   assert.equal(p.params[1].replaceRecentBlockhash,true);
   result={value:{err:null,unitsConsumed:100000,fee:10000}};
  }else if(p.method==='getBlockHeight')result=height(++heights,hashes.length);
  else if(p.method==='sendTransaction'){submitted=VersionedTransaction.deserialize(Buffer.from(p.params[0],'base64'));result='mock-confirmed-signature';}
  else if(p.method==='getSignatureStatuses')result={value:[status]};
  else throw Error('Unexpected RPC '+p.method);
  return Response.json({result});
 });
 return {calls,hashes,get submitted(){return submitted;}};
}
function wallet(user,onSign=()=>{}){return {publicKey:user.publicKey,signTransaction:async tx=>{onSign(tx);tx.sign([user]);return tx;}};}

test('stale preview refreshes its blockhash and mint signature without changing the reviewed coin',async t=>{
 const n=network(t),user=Keypair.generate(),prepared=await prepareLaunch(input,{publicKey:user.publicKey});
 const previewHash=prepared.blockhash,previewMintSignature=Buffer.from(prepared.tx.signatures[1]);
 const accounts=prepared.tx.message.staticAccountKeys.map(k=>k.toBase58());
 const instructions=prepared.tx.message.compiledInstructions.map(ix=>Buffer.from(ix.data).toString('hex'));
 let signedHash;
 const result=await signAndSend(prepared,wallet(user,tx=>{signedHash=tx.message.recentBlockhash;}),()=>{});
 assert.notEqual(signedHash,previewHash);assert.equal(signedHash,n.hashes[1]);
 assert.notDeepEqual(Buffer.from(prepared.tx.signatures[1]),previewMintSignature);
 assert.deepEqual(prepared.tx.message.staticAccountKeys.map(k=>k.toBase58()),accounts);
 assert.deepEqual(prepared.tx.message.compiledInstructions.map(ix=>Buffer.from(ix.data).toString('hex')),instructions);
 assert.equal(result.mint,prepared.mint);assert.equal(n.submitted.message.recentBlockhash,signedHash);
 assert.equal(n.calls.filter(c=>c.method==='sendTransaction').length,1);
 assert.equal(n.calls.some(c=>c.method==='getFeeForMessage'),false);
});

test('wallet approval that expires before submission is refreshed once with the same mint',async t=>{
 const n=network(t,{height:(call)=>call===1?2001:2500}),user=Keypair.generate();
 const prepared=await prepareLaunch(input,{publicKey:user.publicKey});let approvals=0;const messages=[];
 const result=await signAndSend(prepared,wallet(user,()=>approvals++),m=>messages.push(m));
 assert.equal(approvals,2);assert.equal(result.mint,prepared.mint);
 assert.equal(n.submitted.message.recentBlockhash,n.hashes[2]);
 assert.equal(n.calls.filter(c=>c.method==='sendTransaction').length,1);
 assert.ok(messages.some(m=>m.includes('please approve again')));
});

test('repeated expired wallet approvals stop without submitting anything',async t=>{
 const n=network(t,{height:()=>9999}),user=Keypair.generate();
 const prepared=await prepareLaunch(input,{publicKey:user.publicKey});let approvals=0;
 await assert.rejects(signAndSend(prepared,wallet(user,()=>approvals++),()=>{}),e=>/before submission/.test(e.message)&&!e.signature);
 assert.equal(approvals,2);assert.equal(n.calls.some(c=>c.method==='sendTransaction'),false);
});

test('wallet cancellation does not broadcast or report a submitted signature',async t=>{
 const n=network(t),user=Keypair.generate(),prepared=await prepareLaunch(input,{publicKey:user.publicKey});
 await assert.rejects(signAndSend(prepared,{publicKey:user.publicKey,signTransaction:async()=>{throw Error('User rejected');}},()=>{}),e=>e.message==='User rejected'&&!e.signature);
 assert.equal(n.calls.some(c=>c.method==='sendTransaction'),false);
});

test('expiry after submission retains the signature and never refreshes or signs a replacement',async t=>{
 const n=network(t,{height:call=>call===1?100:9999,status:{confirmationStatus:null,err:null}}),user=Keypair.generate();
 const prepared=await prepareLaunch(input,{publicKey:user.publicKey});let approvals=0;
 await assert.rejects(signAndSend(prepared,wallet(user,()=>approvals++),()=>{}),e=>/Confirmation window ended/.test(e.message)&&e.signature==='mock-confirmed-signature');
 assert.equal(approvals,1);assert.equal(n.hashes.length,2);
 assert.equal(n.calls.filter(c=>c.method==='sendTransaction').length,1);
});
