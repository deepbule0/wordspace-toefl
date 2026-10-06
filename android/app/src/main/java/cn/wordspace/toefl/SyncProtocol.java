package cn.wordspace.toefl;

import org.json.JSONArray;
import org.json.JSONObject;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.Base64;
import java.util.regex.Pattern;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** Shared wire format and field-level merge, without depending on a running WebView. */
public final class SyncProtocol {
    static final String FORMAT="wordspace-lan-v1";
    static final int LIMIT=24000;
    static final byte[] AAD=FORMAT.getBytes(StandardCharsets.UTF_8);
    private static final Pattern KEY=Pattern.compile("^(settings\\.(dailyNew|dailyReview|showChinese|showPhonetic|autoAudio)|learned\\.(?:[1-9]|[1-3]\\d|4[0-8])|reviewCycle|reviewed\\.\\d{1,5}\\.(?:[1-9]|[1-3]\\d|4[0-8])|favorite\\.\\d{1,4}|session\\.(new|review)\\.(?:[1-9]|[1-3]\\d|4[0-8])\\.(index|seen\\.\\d{1,4})|lastSession|plan\\.\\d{4}-\\d{2}-\\d{2}\\.(new|review|doneNew\\.(?:[1-9]|[1-3]\\d|4[0-8])|doneReview\\.(?:[1-9]|[1-3]\\d|4[0-8])))$");
    public static boolean privateSyncUrl(URL url){
        if(!"http".equals(url.getProtocol())||url.getPort()!=4174||!"/sync".equals(url.getPath())||url.getQuery()!=null||url.getUserInfo()!=null||url.getRef()!=null)return false;
        String host=url.getHost();if(!host.matches("\\d+\\.\\d+\\.\\d+\\.\\d+"))return false;
        String[] parts=host.split("\\.");int[] n=new int[4];
        try{for(int i=0;i<4;i++){n[i]=Integer.parseInt(parts[i]);if(n[i]<0||n[i]>255||!parts[i].equals(String.valueOf(n[i])))return false;}}catch(Exception error){return false;}
        return n[0]==10||n[0]==192&&n[1]==168||n[0]==172&&n[1]>=16&&n[1]<=31;
    }
    public static JSONObject connection(JSONObject input)throws Exception{
        if(input.getInt("version")!=1||!privateSyncUrl(new URL(input.getString("address")+"/sync"))||!input.getString("key").matches("[A-Za-z0-9+/]{43}=")||!input.getString("hub").matches("[a-zA-Z0-9-]{8,64}"))throw new Exception("Invalid pairing data");
        return new JSONObject().put("version",1).put("address",input.getString("address")).put("key",input.getString("key")).put("hub",input.getString("hub"));
    }
    public static JSONObject validate(JSONObject input)throws Exception{
        if(!FORMAT.equals(input.getString("format")))throw new Exception("Invalid document format");
        JSONObject source=input.getJSONObject("entries"),entries=new JSONObject();long clock=0;
        if(source.length()>LIMIT)throw new Exception("Too many entries");
        Iterator<String> keys=source.keys();
        while(keys.hasNext()){
            String key=keys.next();JSONObject entry=source.getJSONObject(key);JSONArray stamp=entry.getJSONArray("stamp");
            Object counter=stamp.get(0);double number=counter instanceof Number?((Number)counter).doubleValue():Double.NaN;
            if(!KEY.matcher(key).matches()||stamp.length()!=2||!Double.isFinite(number)||number!=Math.floor(number)||number<1||number>1e12||!(stamp.get(1) instanceof String)||!stamp.getString(1).matches("[a-zA-Z0-9-]{8,64}")||!entry.has("value"))throw new Exception("Invalid entry");
            Object value=entry.get("value");if(canonical(value).length()>2000)throw new Exception("Entry too large");
            long tick=(long)number;clock=Math.max(clock,tick);
            entries.put(key,new JSONObject().put("stamp",new JSONArray().put(tick).put(stamp.getString(1))).put("value",value));
        }
        return new JSONObject().put("format",FORMAT).put("clock",clock).put("entries",entries);
    }
    public static JSONObject merge(JSONObject left,JSONObject right)throws Exception{
        JSONObject a=validate(left),b=validate(right),result=new JSONObject(a.toString()),entries=result.getJSONObject("entries"),other=b.getJSONObject("entries");
        Iterator<String> keys=other.keys();while(keys.hasNext()){
            String key=keys.next();JSONObject incoming=other.getJSONObject(key);
            if(!entries.has(key)||compare(incoming,entries.getJSONObject(key))>0)entries.put(key,incoming);
        }
        return validate(result);
    }
    private static int compare(JSONObject a,JSONObject b)throws Exception{
        JSONArray x=a.getJSONArray("stamp"),y=b.getJSONArray("stamp");
        int order=Long.compare(x.getLong(0),y.getLong(0));if(order!=0)return order;
        order=x.getString(1).compareTo(y.getString(1));return order!=0?order:canonical(a.get("value")).compareTo(canonical(b.get("value")));
    }
    static String canonical(Object value)throws Exception{
        if(value==null||value==JSONObject.NULL)return "null";
        if(value instanceof JSONObject){
            JSONObject object=(JSONObject)value;ArrayList<String> keys=new ArrayList<>();Iterator<String> iterator=object.keys();while(iterator.hasNext())keys.add(iterator.next());Collections.sort(keys);
            ArrayList<String> parts=new ArrayList<>();for(String key:keys)parts.add(JSONObject.quote(key)+":"+canonical(object.get(key)));return "{"+String.join(",",parts)+"}";
        }
        if(value instanceof JSONArray){JSONArray array=(JSONArray)value;ArrayList<String> parts=new ArrayList<>();for(int i=0;i<array.length();i++)parts.add(canonical(array.get(i)));return "["+String.join(",",parts)+"]";}
        if(value instanceof String)return JSONObject.quote((String)value);
        return String.valueOf(value);
    }
    public static JSONObject seal(String key,JSONObject payload)throws Exception{
        byte[] nonce=new byte[12];new SecureRandom().nextBytes(nonce);Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE,new SecretKeySpec(Base64.getDecoder().decode(key),"AES"),new GCMParameterSpec(128,nonce));cipher.updateAAD(AAD);
        return new JSONObject().put("nonce",Base64.getEncoder().encodeToString(nonce)).put("data",Base64.getEncoder().encodeToString(cipher.doFinal(payload.toString().getBytes(StandardCharsets.UTF_8))));
    }
    public static JSONObject unseal(String key,JSONObject packet)throws Exception{
        if(packet.getString("data").length()>4_000_000)throw new Exception("Packet too large");byte[] nonce=Base64.getDecoder().decode(packet.getString("nonce"));if(nonce.length!=12)throw new Exception("Invalid nonce");
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,new SecretKeySpec(Base64.getDecoder().decode(key),"AES"),new GCMParameterSpec(128,nonce));cipher.updateAAD(AAD);
        return new JSONObject(new String(cipher.doFinal(Base64.getDecoder().decode(packet.getString("data"))),StandardCharsets.UTF_8));
    }
}
