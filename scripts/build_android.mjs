import { mkdir,readFile,writeFile,access,copyFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {verifyScannerRuntime} from './android-runtime-check.mjs';
import {resolveAndroidTools,toolExecutable,runGradle,run} from './android-tools.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const tools=await resolveAndroidTools(root),java=tools.java,sdk=tools.sdk;
const debug=process.argv.includes('--debug');
const {version}=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const signing=path.join(root,'.signing');
await mkdir(path.join(root,'outputs'),{recursive:true});
let password;
if(!debug){
  await mkdir(signing,{recursive:true});
  try{password=await readFile(path.join(signing,'password'),'utf8');}catch(error){if(error.code!=='ENOENT')throw error;password=randomBytes(32).toString('base64url');await writeFile(path.join(signing,'password'),password,{mode:0o600,flag:'wx'});}
  const keystore=path.join(signing,'wordspace.keystore');
  try{await access(keystore);}catch(error){
    if(error.code!=='ENOENT')throw error;
    console.log('本机没有原签名，将生成新私人签名；新签名不能覆盖旧签名 App。请保密备份 .signing/。');
    await run(toolExecutable(java,'keytool'),['-genkeypair','-keystore',keystore,'-storepass:env','WORDSPACE_SIGNING_PASSWORD','-keypass:env','WORDSPACE_SIGNING_PASSWORD','-alias','wordspace','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Wordspace Personal App'],{env:{...process.env,WORDSPACE_SIGNING_PASSWORD:password}});
  }
}
const env={...process.env,...(password?{WORDSPACE_SIGNING_PASSWORD:password}:{})};
const variant=debug?'Debug':'Release';
await runGradle(root,tools,[`assemble${variant}`,`lint${variant}`,`test${variant}UnitTest`],env);
const apk=path.join(root,`android/app/build/outputs/apk/${variant.toLowerCase()}/app-${variant.toLowerCase()}.apk`);
await verifyScannerRuntime({apk,java,sdk});
const target=path.join(root,`outputs/词间-安卓${debug?'调试版':'安装版'}-v${version}.apk`);
await copyFile(apk,target);
console.log('安装包已生成：'+path.relative(root,target));
