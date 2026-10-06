import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {toolExecutable} from './android-tools.mjs';

const execute=promisify(execFile);
export const scannerRuntimeClasses=[
  'cn.wordspace.toefl.PairScannerActivity',
  'com.journeyapps.barcodescanner.CaptureManager',
  'androidx.core.content.ContextCompat',
  'androidx.core.app.ActivityCompat',
  'androidx.fragment.app.Fragment',
  'androidx.activity.result.contract.ActivityResultContract',
];
export function parseDefinedClasses(report){
  return new Set(report.split(/\r?\n/).map(line=>line.trim().split(/\s+/)).filter(parts=>parts[0]==='C'&&parts[1]==='d').map(parts=>parts.at(-1)));
}
export function assertScannerRuntime(classes){
  const missing=scannerRuntimeClasses.filter(name=>!classes.has(name));
  if(missing.length)throw new Error('APK 缺少扫码运行依赖，停止交付：'+missing.join(', '));
}
export async function verifyScannerRuntime({apk,java,sdk}){
  const cli=path.join(sdk,'cmdline-tools/latest');
  const {stdout}=await execute(toolExecutable(java,'java'),[
    '-Dcom.android.sdklib.toolsdir='+cli,'-classpath',path.join(cli,'lib/apkanalyzer-classpath.jar'),
    'com.android.tools.apk.analyzer.ApkAnalyzerCli','dex','packages','--defined-only',apk,
  ],{windowsHide:true,maxBuffer:32*1024*1024});
  const classes=parseDefinedClasses(stdout);assertScannerRuntime(classes);
  console.log(`APK 扫码运行依赖核验通过（${scannerRuntimeClasses.length} 个必要类均有实际定义）。`);
}
