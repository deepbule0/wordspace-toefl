import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDefinedClasses,assertScannerRuntime,scannerRuntimeClasses} from '../scripts/android-runtime-check.mjs';

test('APK runtime check counts defined classes, not references in method signatures',()=>{
  const classes=parseDefinedClasses('C d 1\t1\t80\tcn.wordspace.toefl.PairScannerActivity\r\nM d 1\t1\t60\tScanner scan(androidx.fragment.app.Fragment)\nC r 0 0 0 androidx.core.app.ActivityCompat');
  assert.deepEqual([...classes],['cn.wordspace.toefl.PairScannerActivity']);
});
test('an APK missing AndroidX support classes is rejected before delivery',()=>{
  assert.throws(()=>assertScannerRuntime(new Set(scannerRuntimeClasses.slice(0,2))),/ContextCompat.*ActivityCompat.*Fragment/);
});
test('all scanner support class definitions must be included',()=>{
  assert.doesNotThrow(()=>assertScannerRuntime(new Set(scannerRuntimeClasses)));
  assert.throws(()=>assertScannerRuntime(new Set(scannerRuntimeClasses.filter(name=>!name.endsWith('ActivityResultContract')))),/ActivityResultContract/);
});
