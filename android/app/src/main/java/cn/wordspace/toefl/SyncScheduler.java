package cn.wordspace.toefl;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import org.json.JSONObject;

final class SyncScheduler {
    static final int PERIODIC=417401,ON_LEAVE=417402;
    static volatile boolean foreground=false;
    private static JobInfo.Builder job(Context context,int id){
        JobInfo.Builder builder=new JobInfo.Builder(id,new ComponentName(context,SyncJobService.class)).setRequiresBatteryNotLow(true);
        if(android.os.Build.VERSION.SDK_INT>=28)builder.setRequiredNetwork(new NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build());
        else builder.setRequiredNetworkType(JobInfo.NETWORK_TYPE_UNMETERED);
        return builder;
    }
    static boolean configured(JSONObject snapshot){return snapshot!=null&&snapshot.optBoolean("backgroundEnabled")&&snapshot.optJSONObject("config")!=null;}
    static boolean configure(Context context)throws Exception{
        JobScheduler scheduler=context.getSystemService(JobScheduler.class);
        if(!configured(SyncStore.read(context))){scheduler.cancel(PERIODIC);scheduler.cancel(ON_LEAVE);return false;}
        // Do not reset the periodic timer on every word or UI save.
        if(scheduler.getPendingJob(PERIODIC)!=null)return true;
        return scheduler.schedule(job(context,PERIODIC).setPeriodic(15*60_000L,5*60_000L).setPersisted(true).build())==JobScheduler.RESULT_SUCCESS;
    }
    static void onLeave(Context context){
        try{if(configured(SyncStore.read(context)))context.getSystemService(JobScheduler.class).schedule(job(context,ON_LEAVE).setMinimumLatency(1000).build());}catch(Exception ignored){}
    }
    static void onEnter(Context context){foreground=true;context.getSystemService(JobScheduler.class).cancel(ON_LEAVE);try{configure(context);}catch(Exception ignored){}}
}
