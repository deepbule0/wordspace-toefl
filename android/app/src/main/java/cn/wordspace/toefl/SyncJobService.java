package cn.wordspace.toefl;

import android.app.job.JobParameters;
import android.app.job.JobService;
import android.net.Network;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.ConcurrentHashMap;

public final class SyncJobService extends JobService {
    private final ExecutorService executor=Executors.newSingleThreadExecutor();
    private static final class JobRun {
        final AtomicBoolean stopped=new AtomicBoolean(false);
        volatile Future<?> task;
        volatile HttpURLConnection connection;
        void cancel(){stopped.set(true);if(connection!=null)connection.disconnect();if(task!=null)task.cancel(true);}
    }
    private final ConcurrentHashMap<Integer,JobRun> jobs=new ConcurrentHashMap<>();
    @Override public boolean onStartJob(JobParameters parameters){
        if(SyncScheduler.foreground)return false;
        JobRun run=new JobRun();jobs.put(parameters.getJobId(),run);AtomicBoolean cancellation=run.stopped;
        run.task=executor.submit(()->{
            JSONObject config=null;
            try{
                JSONObject snapshot=SyncStore.read(this);if(!SyncScheduler.configured(snapshot)||cancellation.get())return;
                config=snapshot.getJSONObject("config");String requestId=UUID.randomUUID().toString();
                JSONObject message=new JSONObject().put("hub",config.getString("hub")).put("requestId",requestId).put("action","merge").put("document",snapshot.getJSONObject("document"));
                JSONObject reply=SyncProtocol.unseal(config.getString("key"),post(parameters,new URL(config.getString("address")+"/sync"),SyncProtocol.seal(config.getString("key"),message),run));
                if(!requestId.equals(reply.getString("requestId"))||!config.getString("hub").equals(reply.getString("hub")))throw new Exception("Mismatched reply");
                JSONObject merged=SyncProtocol.validate(reply.getJSONObject("document"));
                if(!cancellation.get())SyncStore.finishJob(this,config,merged,true);
            }catch(Exception error){if(config!=null&&!cancellation.get())try{SyncStore.finishJob(this,config,null,false);}catch(Exception ignored){}}
            finally{jobs.remove(parameters.getJobId(),run);if(!cancellation.get())jobFinished(parameters,false);}
        });
        return true;
    }
    private JSONObject post(JobParameters parameters,URL url,JSONObject packet,JobRun run)throws Exception{
        AtomicBoolean cancellation=run.stopped;
        if(!SyncProtocol.privateSyncUrl(url))throw new Exception("Non-private sync endpoint");
        Network network=android.os.Build.VERSION.SDK_INT>=28?parameters.getNetwork():null;
        HttpURLConnection connection=(HttpURLConnection)(network==null?url.openConnection():network.openConnection(url));run.connection=connection;
        try{
            connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(4000);connection.setReadTimeout(4000);connection.setRequestMethod("POST");connection.setRequestProperty("Content-Type","application/json");connection.setDoOutput(true);
            byte[] body=packet.toString().getBytes(StandardCharsets.UTF_8);if(body.length>3_000_000)throw new Exception("Packet too large");connection.setFixedLengthStreamingMode(body.length);
            try(OutputStream output=connection.getOutputStream()){output.write(body);}
            if(cancellation.get()||connection.getResponseCode()!=200)throw new Exception("Sync unavailable");
            try(InputStream input=connection.getInputStream();ByteArrayOutputStream output=new ByteArrayOutputStream()){
                byte[] buffer=new byte[8192];int count;
                while((count=input.read(buffer))!=-1){if(cancellation.get())throw new Exception("Cancelled");output.write(buffer,0,count);if(output.size()>3_000_000)throw new Exception("Reply too large");}
                return new JSONObject(output.toString("UTF-8"));
            }
        }finally{connection.disconnect();run.connection=null;}
    }
    @Override public boolean onStopJob(JobParameters parameters){JobRun run=jobs.remove(parameters.getJobId());if(run!=null)run.cancel();return false;}
    @Override public void onDestroy(){for(JobRun run:jobs.values())run.cancel();jobs.clear();executor.shutdownNow();super.onDestroy();}
}
