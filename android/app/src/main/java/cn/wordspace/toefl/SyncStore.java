package cn.wordspace.toefl;

import android.content.Context;
import android.util.AtomicFile;
import org.json.JSONObject;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/** One atomic, private copy shared by UI and background jobs, never cloud-backed-up. */
final class SyncStore {
    private static final Object LOCK=new Object();
    private static AtomicFile file(Context context){return new AtomicFile(new File(context.getFilesDir(),"wordspace-background.json"));}
    static JSONObject read(Context context)throws Exception{synchronized(LOCK){return readLocked(context);}}
    private static JSONObject readLocked(Context context)throws Exception{
        try{
            byte[] bytes=file(context).readFully();if(bytes.length>4_000_000)throw new Exception("Sync snapshot too large");
            JSONObject snapshot=new JSONObject(new String(bytes,StandardCharsets.UTF_8));
            if(!snapshot.isNull("config"))snapshot.put("config",SyncProtocol.connection(snapshot.getJSONObject("config")));
            if(!snapshot.isNull("document"))snapshot.put("document",SyncProtocol.validate(snapshot.getJSONObject("document")));
            return snapshot;
        }catch(FileNotFoundException missing){return null;}
    }
    private static void saveLocked(Context context,JSONObject snapshot)throws Exception{
        AtomicFile target=file(context);FileOutputStream output=null;
        try{output=target.startWrite();output.write(snapshot.toString().getBytes(StandardCharsets.UTF_8));target.finishWrite(output);}
        catch(Exception error){if(output!=null)target.failWrite(output);throw error;}
    }
    static boolean sameHub(JSONObject a,JSONObject b){return a!=null&&b!=null&&a.optString("hub").equals(b.optString("hub"))&&a.optString("key").equals(b.optString("key"));}
    static JSONObject writeClient(Context context,String configuration,String document,boolean enabled)throws Exception{
        JSONObject config="null".equals(configuration)?null:SyncProtocol.connection(new JSONObject(configuration));
        JSONObject incoming=SyncProtocol.validate(new JSONObject(document));
        synchronized(LOCK){
            JSONObject old=readLocked(context),previous=old==null?null:old.optJSONObject("config");
            JSONObject snapshot=old==null?new JSONObject():old;
            if(sameHub(previous,config)&&snapshot.optJSONObject("document")!=null)incoming=SyncProtocol.merge(incoming,snapshot.getJSONObject("document"));
            if(!sameHub(previous,config)){snapshot.remove("lastSync");snapshot.remove("backgroundStatus");}
            snapshot.put("config",config==null?JSONObject.NULL:config).put("document",incoming).put("backgroundEnabled",enabled);
            saveLocked(context,snapshot);return snapshot;
        }
    }
    static void finishJob(Context context,JSONObject connection,JSONObject remote,boolean success)throws Exception{
        synchronized(LOCK){
            JSONObject snapshot=readLocked(context);
            // A stopped or re-paired job must never revive the previous connection.
            if(snapshot==null||!snapshot.optBoolean("backgroundEnabled")||!sameHub(connection,snapshot.optJSONObject("config")))return;
            if(success){snapshot.put("document",SyncProtocol.merge(snapshot.getJSONObject("document"),remote));snapshot.put("lastSync",System.currentTimeMillis());snapshot.put("backgroundStatus","后台已同步");}
            else snapshot.put("backgroundStatus","等待电脑连接，下次自动重试");
            saveLocked(context,snapshot);
        }
    }
}
