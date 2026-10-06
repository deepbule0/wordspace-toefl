package cn.wordspace.toefl;

import org.junit.Test;
import static org.junit.Assert.assertEquals;

/** Verifies real runtime dependencies; no simulated camera or permission result. */
public class ScannerRuntimeTest {
    @Test public void scannerAndPermissionSupportClassesAreLoadable() throws Exception {
        String[] names={
            "cn.wordspace.toefl.PairScannerActivity",
            "com.journeyapps.barcodescanner.CaptureManager",
            "androidx.core.content.ContextCompat",
            "androidx.core.app.ActivityCompat",
            "androidx.fragment.app.Fragment",
            "androidx.activity.result.contract.ActivityResultContract"
        };
        for(String name:names)
            assertEquals(name,Class.forName(name,false,getClass().getClassLoader()).getName());
    }
}
