package cn.wordspace.toefl;

import org.junit.Test;
import static org.junit.Assert.*;
import java.net.ConnectException;
import java.net.NoRouteToHostException;
import java.net.SocketTimeoutException;

public class NetworkDiagnosticsTest {
    @Test public void probeOnlyAcceptsPrivateSyncService() throws Exception {
        for(String address:new String[]{"http://10.42.1.20:4174","http://192.168.1.2:4174","http://172.16.1.2:4174"})assertEquals(address+"/hello",NetworkDiagnostics.probeUrl(address).toString());
        for(String address:new String[]{"http://127.0.0.1:4174","http://8.8.8.8:4174","http://example.com:4174","http://10.1.2.3:80","https://10.1.2.3:4174","http://user@10.1.2.3:4174","http://10.1.2.3:4174/","http://10.1.2.3:4174?x=","http://10.1.2.3:4174#x"}){
            try{NetworkDiagnostics.probeUrl(address);fail("accepted invalid target");}catch(IllegalArgumentException|java.net.MalformedURLException expected){}
        }
    }
    @Test public void failuresAreSpecificWithoutGuessingIsolation(){
        assertEquals("timeout",NetworkDiagnostics.failureCode(new SocketTimeoutException()));
        assertEquals("refused",NetworkDiagnostics.failureCode(new ConnectException()));
        assertEquals("no_route",NetworkDiagnostics.failureCode(new NoRouteToHostException()));
        assertTrue(NetworkDiagnostics.failureMessage(new SocketTimeoutException()).contains("无法判断具体原因"));
        assertFalse(NetworkDiagnostics.failureMessage(new ConnectException()).contains("相机"));
    }
}
