import test from 'node:test';
import {execFileSync} from 'node:child_process';

test('compiled browser launch flow works without Node Buffer or process globals',()=>{
 execFileSync(process.execPath,['scripts/build.mjs'],{
  cwd:new URL('..',import.meta.url),encoding:'utf8',windowsHide:true,stdio:'pipe'
 });
 execFileSync(process.execPath,['--experimental-vm-modules','scripts/verify-browser-launch.mjs'],{
  cwd:new URL('..',import.meta.url),encoding:'utf8',windowsHide:true,stdio:'pipe'
 });
});
