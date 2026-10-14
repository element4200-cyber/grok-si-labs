import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {execFile,spawn} from 'node:child_process';
const app='C:\\Program Files\\Grok Bot\\Grok Bot.exe';
const token=crypto.randomBytes(24).toString('hex');
const origins=new Set(['https://grok-bots-studio.element4200.chatgpt.site','http://localhost:4387']);
function isRunning(){return new Promise(resolve=>execFile('tasklist.exe',['/FI','IMAGENAME eq Grok Bot.exe','/FO','CSV','/NH'],{windowsHide:true,timeout:3000},(error,out)=>resolve(!error&&out.toLowerCase().includes('grok bot.exe'))));}
const server=http.createServer(async(req,res)=>{const origin=req.headers.origin;const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Private-Network':'true','Vary':'Origin'};
 if(!origins.has(origin)){res.writeHead(403,headers);res.end(JSON.stringify({error:'This origin is not paired with the bridge.'}));return}headers['Access-Control-Allow-Origin']=origin;
 if(req.method==='OPTIONS'){res.writeHead(204,headers);res.end();return}
 const supplied=Buffer.from((req.headers.authorization||'').replace(/^Bearer /,''));const expected=Buffer.from(token);
 if(supplied.length!==expected.length||!crypto.timingSafeEqual(supplied,expected)){res.writeHead(401,headers);res.end(JSON.stringify({error:'Invalid pairing code'}));return}
 if(req.url==='/status'&&req.method==='GET'){res.writeHead(200,headers);res.end(JSON.stringify({installed:fs.existsSync(app),running:await isRunning(),capabilities:['status','open']}));return}
 if(req.url==='/open'&&req.method==='POST'){if(!fs.existsSync(app)){res.writeHead(404,headers);res.end(JSON.stringify({error:'Grok Bot is not installed at the expected location.'}));return}const child=spawn(app,[],{detached:true,stdio:'ignore',windowsHide:true});child.on('error',()=>{});child.unref();res.writeHead(200,headers);res.end(JSON.stringify({opened:true}));return}
 res.writeHead(404,headers);res.end(JSON.stringify({error:'Not found'}));
});
server.listen(4318,'127.0.0.1',()=>{console.log('Grok SI Labs desktop companion\nLocal address: http://127.0.0.1:4318\nPairing code: '+token+'\n\nPaste the code into Desktop companion on the website.\nOnly the paired studio origins can use this bridge.\nPress Ctrl+C to stop and invalidate the code.');});
