import test from 'node:test';
import assert from 'node:assert/strict';
import {rpc} from '../src/launch.js';

test('HTTP throttling retries the identical request and reports progress',async t=>{
 const bodies=[],waits=[],progress=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  assert.equal(url,'/api/rpc');bodies.push(options.body);
  return bodies.length===1?new Response('Too many requests',{status:429,headers:{'Retry-After':'10'}}):Response.json({result:{value:123}});
 });
 assert.deepEqual(await rpc('getBalance',['wallet'],{wait:async ms=>waits.push(ms),onRetry:message=>progress.push(message)}),{value:123});
 assert.equal(bodies.length,2);assert.equal(bodies[0],bodies[1]);assert.ok(waits[0]>=10000);assert.match(progress[0],/Retrying/);
});

test('PublicNode rate-limit JSON errors recover even with HTTP 200',async t=>{
 let calls=0;
 t.mock.method(globalThis,'fetch',async()=>++calls===1?Response.json({error:{code:-32005,message:'Rate limit exceeded. To obtain higher limits, request a personal token.'}}):Response.json({result:99}));
 assert.equal(await rpc('getBlockHeight',[],{wait:async()=>{}}),99);assert.equal(calls,2);
});

test('persistent throttling stops after bounded retries with an actionable error',async t=>{
 let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('Rate limit exceeded',{status:429});});
 await assert.rejects(rpc('getLatestBlockhash',[],{wait:async()=>{}}),error=>error.code==='RPC_RATE_LIMIT'&&/Wait a minute/.test(error.message));
 assert.equal(calls,4);
});

test('transaction and transport errors are not automatically retried',async t=>{
 let calls=0,transportFailure=false;
 t.mock.method(globalThis,'fetch',async()=>{calls++;if(transportFailure)throw Error('Connection lost');return Response.json({error:{message:'Transaction simulation failed: insufficient funds'}});});
 await assert.rejects(rpc('sendTransaction',['signed bytes'],{wait:async()=>{}}),/insufficient funds/);
 assert.equal(calls,1);
 transportFailure=true;
 await assert.rejects(rpc('sendTransaction',['signed bytes'],{wait:async()=>{}}),/Connection lost/);
 assert.equal(calls,2);
});
