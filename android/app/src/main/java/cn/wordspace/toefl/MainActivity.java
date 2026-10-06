package cn.wordspace.toefl;

import android.app.Activity;
import android.annotation.SuppressLint;
import android.os.Bundle;
import android.content.Intent;
import android.Manifest;
import android.content.pm.PackageManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.graphics.Color;
import android.net.Uri;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;
import com.google.zxing.client.android.Intents;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Map;
import java.util.HashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final int FILE_PICK = 100, FILE_SAVE = 101, CAMERA_SCAN = 102;
    private WebView web;
    private TextToSpeech speech;
    private boolean speechReady=false, pageReady=false, destroyed=false;
    private String pendingPairCode, pendingBackup;
    private ValueCallback<Uri[]> fileCallback;
    private android.window.OnBackInvokedCallback backCallback;
    private boolean backEnabled=false;
    private boolean scanInFlight=false;
    private final ExecutorService worker=Executors.newFixedThreadPool(2);

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(245,246,242));
        getWindow().setNavigationBarColor(Color.rgb(245,246,242));
        web=new WebView(this);
        WebSettings settings=web.getSettings();
        settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false);
        WebView.setWebContentsDebuggingEnabled(false);
        web.addJavascriptInterface(new Bridge(),"WordspaceNative");
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request) {
                Uri uri=request.getUrl();
                if(!"https".equals(uri.getScheme())||!"appassets.androidplatform.net".equals(uri.getHost()))return blocked();
                String name=uri.getPath();
                if(name==null||name.equals("/"))name="/index.html";
                if(name.contains("..")||name.contains("\\")||name.contains("\0"))return blocked();
                name=name.substring(1);
                String mime=name.endsWith(".mjs")?"text/javascript":name.endsWith(".css")?"text/css":name.endsWith(".json")?"application/json":name.endsWith(".mp3")?"audio/mpeg":name.endsWith(".svg")?"image/svg+xml":"text/html";
                try {
                    Map<String,String> headers=new HashMap<>();
                    headers.put("Cache-Control","no-cache");
                    return new WebResourceResponse(mime,mime.startsWith("audio/")?null:"UTF-8",200,"OK",headers,getAssets().open(name));
                }catch(Exception error){return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",new HashMap<>(),new ByteArrayInputStream(new byte[0]));}
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                if(request.getUrl().toString().startsWith(ORIGIN+"/"))return false;
                String scheme=request.getUrl().getScheme();
                if("https".equals(scheme)||"http".equals(scheme)){
                    try{startActivity(new Intent(Intent.ACTION_VIEW,request.getUrl()));}catch(Exception ignored){}
                }
                return true;
            }
            @Override public void onPageFinished(WebView view,String url){pageReady=true;deliverPairCode();}
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
                if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=callback;
                Intent pick=new Intent(Intent.ACTION_OPEN_DOCUMENT);pick.addCategory(Intent.CATEGORY_OPENABLE);pick.setType("application/json");
                try{startActivityForResult(pick,FILE_PICK);}catch(Exception error){fileCallback.onReceiveValue(null);fileCallback=null;return false;}return true;
            }
        });
        setContentView(web);
        if(android.os.Build.VERSION.SDK_INT>=33)backCallback=this::handleBack;
        if(android.os.Build.VERSION.SDK_INT>=30){
            getWindow().setDecorFitsSystemWindows(false);
            web.setOnApplyWindowInsetsListener((view,insets)->{
                android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.ime());
                view.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;
            });
        }
        speech=new TextToSpeech(this,result->{
            speechReady=result==TextToSpeech.SUCCESS;
            if(speechReady){
                int language=speech.setLanguage(Locale.US);
                speechReady=language!=TextToSpeech.LANG_MISSING_DATA&&language!=TextToSpeech.LANG_NOT_SUPPORTED;
                if(speech.getVoices()!=null)for(Voice voice:speech.getVoices())if(voice.getLocale().equals(Locale.US)&&!voice.isNetworkConnectionRequired()){speech.setVoice(voice);break;}
                speech.setSpeechRate(0.85f);
                speech.setOnUtteranceProgressListener(new UtteranceProgressListener(){
                    public void onStart(String id){}
                    public void onDone(String id){event("wordspace-speech-done","");}
                    public void onError(String id){event("wordspace-speech-done","");notice("英语朗读不可用，请检查手机英语语音包。");}
                });
            }
        });
        readPairIntent(getIntent());web.loadUrl(ORIGIN+"/index.html");
    }
    private WebResourceResponse blocked(){return new WebResourceResponse("text/plain","UTF-8",403,"Forbidden",new HashMap<>(),new ByteArrayInputStream(new byte[0]));}
    private void event(String name,String value){
        runOnUiThread(()->{if(!destroyed&&web!=null)web.evaluateJavascript("window.dispatchEvent(new CustomEvent("+JSONObject.quote(name)+",{detail:"+JSONObject.quote(value)+"}));",null);});
    }
    private void notice(String message){event("wordspace-native-notice",message);}
    private void readPairIntent(Intent intent){
        Uri uri=intent.getData();if(uri!=null&&"wordspace".equals(uri.getScheme())&&"pair".equals(uri.getHost()))pendingPairCode=uri.getQueryParameter("code");
    }
    private void deliverPairCode(){if(pageReady&&pendingPairCode!=null){event("wordspace-paircode",pendingPairCode);pendingPairCode=null;}}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);readPairIntent(intent);deliverPairCode();}
    private void handleBack(){
        web.evaluateJavascript("window.wordspaceHandleBack ? window.wordspaceHandleBack() : false",value->{if(!"true".equals(value))finish();});
    }
    // Android 13+ uses the platform dispatcher. This fallback is only for older OS versions.
    @SuppressLint("GestureBackNavigation")
    @Override public void onBackPressed(){handleBack();}
    private void setBackEnabled(boolean enabled){
        if(android.os.Build.VERSION.SDK_INT<33||enabled==backEnabled)return;
        if(enabled)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,backCallback);
        else getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        backEnabled=enabled;
    }
    private void requestPairScanner(){
        if(destroyed||isFinishing()||scanInFlight)return;
        if(!getPackageManager().hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)){
            notice("没有找到可用相机，请使用手动粘贴连接码。");return;
        }
        scanInFlight=true;
        if(checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED){
            try{requestPermissions(new String[]{Manifest.permission.CAMERA},CAMERA_SCAN);}
            catch(RuntimeException error){scanInFlight=false;notice("未能申请相机权限，请使用手动连接码，或在系统设置中检查词间的相机权限。");}
            return;
        }
        launchPairScanner();
    }
    private void launchPairScanner(){
        if(destroyed||isFinishing()){scanInFlight=false;return;}
        try{
            new IntentIntegrator(this).setDesiredBarcodeFormats(IntentIntegrator.QR_CODE)
                .setCaptureActivity(PairScannerActivity.class).setOrientationLocked(false)
                .setBeepEnabled(false).setBarcodeImageEnabled(false)
                .setPrompt("扫描电脑词间页面的配对二维码").initiateScan();
        }catch(RuntimeException|LinkageError error){
            scanInFlight=false;android.util.Log.e("WordspaceScanner","Scanner launch failed",error);
            notice("扫码页面未能启动，请使用手动连接码，并确认已安装最新修正版。");
        }
    }
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] grantResults){
        super.onRequestPermissionsResult(request,permissions,grantResults);
        if(request!=CAMERA_SCAN)return;
        if(grantResults.length>0&&grantResults[0]==PackageManager.PERMISSION_GRANTED)launchPairScanner();
        else{scanInFlight=false;notice("未获得相机权限；可在系统设置中允许词间使用相机，或手动粘贴连接码。");}
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        IntentResult scan=IntentIntegrator.parseActivityResult(request,result,data);
        if(scan!=null){
            scanInFlight=false;
            if(data!=null&&data.getBooleanExtra(Intents.Scan.MISSING_CAMERA_PERMISSION,false)){
                notice("相机权限不可用，请检查系统权限，或手动粘贴连接码。");return;
            }
            if(scan.getContents()!=null&&scan.getContents().length()<2048)event("wordspace-paircode",scan.getContents());
            else if(scan.getContents()!=null)notice("二维码内容过长，请扫描电脑词间页面显示的配对码。");
            return;
        }
        if(request==FILE_PICK&&fileCallback!=null){fileCallback.onReceiveValue(result==RESULT_OK&&data!=null?new Uri[]{data.getData()}:null);fileCallback=null;}
        if(request==FILE_SAVE){
            String text=pendingBackup;pendingBackup=null;
            if(result==RESULT_OK&&data!=null&&text!=null){worker.execute(()->{try(OutputStream out=getContentResolver().openOutputStream(data.getData())){out.write(text.getBytes(StandardCharsets.UTF_8));notice("进度备份已保存。");}catch(Exception error){notice("备份没有保存成功，请重试。");}});}
        }
    }
    @Override protected void onPause(){super.onPause();if(speech!=null)speech.stop();}
    @Override protected void onResume(){super.onResume();SyncScheduler.onEnter(this);if(pageReady)event("wordspace-native-resume","");}
    @Override protected void onStop(){super.onStop();SyncScheduler.foreground=false;SyncScheduler.onLeave(this);}
    @Override protected void onDestroy(){destroyed=true;setBackEnabled(false);worker.shutdownNow();if(speech!=null){speech.stop();speech.shutdown();}if(web!=null){web.removeJavascriptInterface("WordspaceNative");web.destroy();}super.onDestroy();}
    private void result(String id,boolean ok,String body,String error){
        try{
            JSONObject detail=new JSONObject();detail.put("id",id);detail.put("ok",ok);detail.put("body",body);detail.put("error",error);
            runOnUiThread(()->{if(!destroyed)web.evaluateJavascript("window.dispatchEvent(new CustomEvent('wordspace-native-result',{detail:"+detail.toString()+"}));",null);});
        }catch(Exception ignored){}
    }
    private boolean privateSyncUrl(URL url){
        return SyncProtocol.privateSyncUrl(url);
    }
    private class Bridge {
        @JavascriptInterface public String networkInfo(){try{return NetworkDiagnostics.read(MainActivity.this).toString();}catch(Exception error){return "{\"interfaces\":[],\"error\":\"系统未能提供手机 IP，可在 Wi‑Fi 详情中查看。\"}";}}
        @JavascriptInterface public void probeConnection(String id,String address){
            worker.execute(()->{try{result(id,true,NetworkDiagnostics.probe(address).toString(),"");}catch(Exception error){result(id,false,"{}","未能完成连接检查，请重试。");}});
        }
        @JavascriptInterface public void scanPairCode(){runOnUiThread(MainActivity.this::requestPairScanner);}
        @JavascriptInterface public String readSyncSnapshot(){try{JSONObject snapshot=SyncStore.read(MainActivity.this);return snapshot==null?"null":snapshot.toString();}catch(Exception error){return "{\"error\":\"手机后台同步记录无法读取，请先导出备份\"}";}}
        @JavascriptInterface public String writeSyncSnapshot(String config,String document,boolean enabled){
            try{JSONObject snapshot=SyncStore.writeClient(MainActivity.this,config,document,enabled);snapshot.put("backgroundScheduled",SyncScheduler.configure(MainActivity.this));return snapshot.toString();}
            catch(Exception error){return "{\"error\":\"手机后台同步记录未能保存，请先导出备份\"}";}
        }
        @JavascriptInterface public void setBackEnabled(boolean enabled){runOnUiThread(()->MainActivity.this.setBackEnabled(enabled));}
        @JavascriptInterface public void request(String id,String address,String body){
            worker.execute(()->{
                HttpURLConnection connection=null;
                try{
                    URL url=new URL(address);if(!privateSyncUrl(url)||body.length()>3_000_000){result(id,false,"{}","不允许此同步地址，请扫描电脑局域网 IP 的有效连接码。");return;}
                    connection=(HttpURLConnection)url.openConnection();connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(4000);connection.setReadTimeout(4000);
                    connection.setRequestMethod("POST");connection.setRequestProperty("Content-Type","application/json");connection.setDoOutput(true);
                    byte[] bytes=body.getBytes(StandardCharsets.UTF_8);connection.setFixedLengthStreamingMode(bytes.length);
                    try(OutputStream out=connection.getOutputStream()){out.write(bytes);}
                    if(connection.getResponseCode()!=200){result(id,false,"{}","电脑服务已响应，但同步验证未通过；请重新扫描电脑当前的配对二维码。");return;}
                    try(InputStream in=connection.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
                        byte[] buffer=new byte[8192];int count;while((count=in.read(buffer))!=-1){out.write(buffer,0,count);if(out.size()>3_000_000)throw new Exception("同步响应过大");}
                        result(id,true,out.toString("UTF-8"),"");
                    }
                }catch(Exception error){result(id,false,"{}",NetworkDiagnostics.failureMessage(error));}
                finally{if(connection!=null)connection.disconnect();}
            });
        }
        @JavascriptInterface public void speak(String text){
            runOnUiThread(()->{
                if(!speechReady){notice("请先在手机系统中安装或启用英语文字转语音；已有本地单词录音不受影响。");event("wordspace-speech-done","");return;}
                if(text.length()>2000){event("wordspace-speech-done","");return;}
                if(speech.speak(text,TextToSpeech.QUEUE_FLUSH,null,"wordspace")==TextToSpeech.ERROR){event("wordspace-speech-done","");notice("英语朗读不可用，请检查手机英语语音包。");}
            });
        }
        @JavascriptInterface public void stopSpeech(){runOnUiThread(()->{if(speech!=null)speech.stop();});}
        @JavascriptInterface public void copyText(String text){runOnUiThread(()->{ClipboardManager manager=(ClipboardManager)getSystemService(CLIPBOARD_SERVICE);manager.setPrimaryClip(ClipData.newPlainText("词间连接码",text));});}
        @JavascriptInterface public void exportBackup(String text,String name){
            if(text.length()>3_000_000)return;
            runOnUiThread(()->{pendingBackup=text;Intent save=new Intent(Intent.ACTION_CREATE_DOCUMENT);save.addCategory(Intent.CATEGORY_OPENABLE);save.setType("application/json");save.putExtra(Intent.EXTRA_TITLE,name);try{startActivityForResult(save,FILE_SAVE);}catch(Exception error){pendingBackup=null;notice("没有找到文件保存应用，请检查系统文件管理器。");}});
        }
    }
}
