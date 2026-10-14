import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import worker from '../dist/server/index.js';

// Execute the exact deployed ESM bundle in an isolated browser-like realm.
// In particular, do not provide Node's Buffer, process, or require globals.
const request=new Request('https://studio.test/launch.js');
const bundle=await (await worker.fetch(request)).text();
const calls=[];
const context=vm.createContext({TextEncoder,TextDecoder,structuredClone,crypto:webcrypto,URL,URLSearchParams,AbortController,AbortSignal,setTimeout,clearTimeout,console,
 fetch:async(url,options)=>{
  assert.equal(url,'/api/rpc');
  const payload=JSON.parse(options.body);calls.push(payload.method);
  const results={
   getLatestBlockhash:{value:{blockhash:'11111111111111111111111111111111',lastValidBlockHeight:1000}},
   simulateTransaction:{value:{err:null,unitsConsumed:100000}},
   getFeeForMessage:{value:10000},getMinimumBalanceForRentExemption:2500000,
   getBlockHeight:10,sendTransaction:'mock-signature',
   getSignatureStatuses:{value:[{confirmationStatus:'confirmed',err:null}]}
  };
  assert.ok(Object.hasOwn(results,payload.method),'Unexpected RPC method');
  return Response.json({jsonrpc:'2.0',id:1,result:results[payload.method]});
 }
});
assert.equal(vm.runInContext('typeof Buffer',context),'undefined');
const module=new vm.SourceTextModule(bundle,{context,identifier:'browser-launch.js'});
try{
 await module.link(()=>{throw Error('Browser bundle has an external import');});
 await module.evaluate();
 const wallet={publicKey:{toString:()=> 'So11111111111111111111111111111111111111112'}};
 const prepared=await module.namespace.prepareLaunch({name:'Browser check',symbol:'BROWSER',description:'Offline regression test',uri:'https://example.com/metadata.json'},wallet);
 assert.equal(prepared.user,wallet.publicKey.toString());
 assert.ok(calls.includes('simulateTransaction'));
 assert.ok(!calls.includes('sendTransaction'),'Preparation must not submit a transaction');
 // Mock wallet approval and submission; nothing leaves this process.
 wallet.signTransaction=async tx=>{tx.signatures[0].fill(1);return tx;};
 const result=await module.namespace.signAndSend(prepared,wallet,()=>{});
 assert.equal(result.signature,'mock-signature');
 assert.equal(calls.at(-1),'getSignatureStatuses');
 console.log('Browser bundle imports, prepares, serializes and completes mocked confirmation without Node globals.');
}catch(error){console.error(error.name+': '+error.message);process.exitCode=1;}
