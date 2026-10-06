package cn.wordspace.toefl;

import org.junit.Test;
import static org.junit.Assert.*;
import org.json.JSONObject;
import org.json.JSONArray;
import java.net.URL;
import java.util.Base64;

public class SyncProtocolTest {
    private JSONObject document(String key,Object value,int tick,String device)throws Exception{
        return new JSONObject().put("format",SyncProtocol.FORMAT).put("entries",new JSONObject().put(key,new JSONObject().put("stamp",new JSONArray().put(tick).put(device)).put("value",value)));
    }
    @Test public void independentChangesAndTombstonesMerge()throws Exception{
        JSONObject a=document("favorite.100",2,2,"device-aaaaaaaa"),b=document("favorite.200",3,2,"device-bbbbbbbb");
        JSONObject merged=SyncProtocol.merge(a,b);assertEquals(2,merged.getJSONObject("entries").length());
        assertEquals(SyncProtocol.canonical(merged),SyncProtocol.canonical(SyncProtocol.merge(b,a)));
        JSONObject removed=SyncProtocol.merge(merged,document("favorite.100",JSONObject.NULL,3,"device-aaaaaaaa"));
        assertTrue(removed.getJSONObject("entries").getJSONObject("favorite.100").isNull("value"));
    }
    @Test public void stampOrderingIsLocaleIndependent()throws Exception{
        JSONObject merged=SyncProtocol.merge(document("favorite.100",1,3,"device-AAAAAAAA"),document("favorite.100",2,3,"device-aaaaaaaa"));
        assertEquals(2,merged.getJSONObject("entries").getJSONObject("favorite.100").getInt("value"));
        assertEquals("{\"a\":1,\"z\":2}",SyncProtocol.canonical(new JSONObject().put("z",2).put("a",1)));
    }
    @Test public void invalidFieldsAndCountersAreRejected()throws Exception{
        assertThrows(Exception.class,()->SyncProtocol.validate(document("unsafe.key",true,1,"device-aaaaaaaa")));
        assertThrows(Exception.class,()->SyncProtocol.validate(document("favorite.100",1,0,"device-aaaaaaaa")));
    }
    @Test public void onlyLiteralPrivateSyncEndpointIsAllowed()throws Exception{
        assertTrue(SyncProtocol.privateSyncUrl(new URL("http://192.168.1.2:4174/sync")));
        for(String url:new String[]{"http://8.8.8.8:4174/sync","https://192.168.1.2:4174/sync","http://example.com:4174/sync","http://127.0.0.1:4174/sync","http://10.1.2.3:4174/sync?x=1","http://10.1.2.3:80/sync","http://user:pass@10.1.2.3:4174/sync"})assertFalse(SyncProtocol.privateSyncUrl(new URL(url)));
    }
    @Test public void encryptionAuthenticatesAndRejectsWrongKey()throws Exception{
        String key=Base64.getEncoder().encodeToString(new byte[32]);JSONObject payload=new JSONObject().put("progress",25);JSONObject packet=SyncProtocol.seal(key,payload);
        assertEquals(25,SyncProtocol.unseal(key,packet).getInt("progress"));assertFalse(packet.toString().contains("progress"));
        byte[] other=new byte[32];other[0]=1;assertThrows(Exception.class,()->SyncProtocol.unseal(Base64.getEncoder().encodeToString(other),packet));
    }
}
