import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {localDB,migrateLocal} from './local-db.mjs';
const db=localDB('.local.sqlite');migrateLocal(db);
const worker=(await import(pathToFileURL(process.cwd()+'/dist/server/index.js'))).default;
const port=Number(process.env.PORT||4387);
http.createServer(async(req,res)=>{try{let parts=[];for await(const c of req)parts.push(c);const body=Buffer.concat(parts);const headers=new Headers(req.headers);headers.set('oai-authenticated-user-id','local-preview-owner');const request=new Request('http://localhost:'+port+req.url,{method:req.method,headers,...(body.length?{body,duplex:'half'}:{})});const result=await worker.fetch(request,{...process.env,DB:db},{});res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));}catch(e){res.writeHead(500);res.end(e.message);}}).listen(port,'127.0.0.1',()=>console.log('Local: http://localhost:'+port));
