package cn.wordspace.toefl;

import android.annotation.SuppressLint;
import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.RouteInfo;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.ConnectException;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.NoRouteToHostException;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.util.HashSet;
import java.util.Set;

/** Read network metadata without SSID, MAC, location permissions, or changing routes. */
public final class NetworkDiagnostics {
    private NetworkDiagnostics(){}

    @SuppressLint("MissingPermission") // ACCESS_NETWORK_STATE is declared in the manifest.
    @SuppressWarnings("deprecation") // Supported on our API 26+ baseline, including VPN Wi-Fi links.
    public static JSONObject read(Context context) throws Exception {
        JSONObject result=new JSONObject();JSONArray interfaces=new JSONArray();
        ConnectivityManager manager=(ConnectivityManager)context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if(manager==null){result.put("interfaces",interfaces);result.put("error","系统网络信息不可用，请查看 Wi‑Fi 详情。");return result;}
        Network active=manager.getActiveNetwork();
        NetworkCapabilities activeCaps=active==null?null:manager.getNetworkCapabilities(active);
        result.put("vpn",activeCaps!=null&&activeCaps.hasTransport(NetworkCapabilities.TRANSPORT_VPN));
        Set<String> seen=new HashSet<>();
        for(Network network:manager.getAllNetworks()){
            NetworkCapabilities caps=manager.getNetworkCapabilities(network);
            LinkProperties properties=manager.getLinkProperties(network);
            if(caps==null||properties==null)continue;
            String type=caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)?"vpn":caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)?"wifi":caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)?"ethernet":"other";
            String gateway=null;
            for(RouteInfo route:properties.getRoutes())if(route.isDefaultRoute()&&route.getGateway() instanceof Inet4Address){gateway=route.getGateway().getHostAddress();break;}
            for(LinkAddress link:properties.getLinkAddresses()){
                if(!(link.getAddress() instanceof Inet4Address)||link.getAddress().isLoopbackAddress())continue;
                String ip=link.getAddress().getHostAddress();
                if(!seen.add(type+":"+ip))continue;
                JSONObject item=new JSONObject();item.put("type",type);item.put("ip",ip);item.put("prefix",link.getPrefixLength());
                item.put("name",properties.getInterfaceName());item.put("active",network.equals(active));
                if(gateway!=null)item.put("gateway",gateway);
                interfaces.put(item);
            }
        }
        result.put("interfaces",interfaces);return result;
    }

    public static URL probeUrl(String address) throws Exception {
        // Reuse the exact encrypted-sync allowlist; no arbitrary URLs or redirects.
        if(address==null||address.length()>200||!SyncProtocol.privateSyncUrl(new URL(address+"/sync")))throw new IllegalArgumentException("无效局域网地址");
        return new URL(address+"/hello");
    }

    public static String failureCode(Exception error){
        if(error instanceof SocketTimeoutException)return "timeout";
        if(error instanceof ConnectException)return "refused";
        if(error instanceof NoRouteToHostException)return "no_route";
        return "network_error";
    }

    public static String failureMessage(Exception error){
        switch(failureCode(error)){
            case "timeout":return "连接电脑超时：请核对目标 IP、同步服务、校园网设备互访限制和 VPN 路由。仅凭超时无法判断具体原因。";
            case "refused":return "连接未建立或被拒绝：请检查目标 IP、电脑端口 4174 的同步服务及入站规则。";
            case "no_route":return "系统找不到到电脑的可用路由：请检查 Wi‑Fi、校园网路由和 VPN 设置。";
            default:return "电脑暂时无法连接：请核对目标 IP、局域网互访和同步服务，可点“检查连接”进一步确认。";
        }
    }

    public static JSONObject probe(String address) throws Exception {
        JSONObject result=new JSONObject();result.put("checkedAt",System.currentTimeMillis());
        URL url;
        try{url=probeUrl(address);}catch(Exception error){result.put("ok",false);result.put("code","invalid_address");result.put("message","请扫描电脑局域网 IP 的有效连接码。");return result;}
        HttpURLConnection connection=null;
        try{
            // Use the same system default route as foreground sync, not a VPN bypass.
            connection=(HttpURLConnection)url.openConnection();connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(2500);connection.setReadTimeout(2500);connection.setRequestMethod("GET");
            if(connection.getResponseCode()!=200){result.put("ok",false);result.put("code","http_error");result.put("message","电脑返回了非正常响应，请检查目标地址和端口 4174 是否为词间同步服务。");return result;}
            try(InputStream in=connection.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
                byte[] buffer=new byte[1024];int count;
                while((count=in.read(buffer))!=-1){out.write(buffer,0,count);if(out.size()>4096)throw new IllegalArgumentException("响应过大");}
                JSONObject hello=new JSONObject(out.toString("UTF-8"));
                boolean ok="wordspace-lan".equals(hello.optString("service"))&&hello.optInt("version")==1;
                result.put("ok",ok);result.put("code",ok?"reachable":"not_wordspace");
                result.put("message",ok?"手机已连通电脑同步服务；若配对仍失败，请重新扫描电脑当前二维码，检查配对信息。":"目标不是有效的词间同步服务，请核对电脑 IP 和端口 4174。");
            }catch(org.json.JSONException|IllegalArgumentException error){result.put("ok",false);result.put("code","not_wordspace");result.put("message","目标没有返回有效的词间同步服务，请核对电脑 IP 和端口 4174。");}
        }catch(Exception error){result.put("ok",false);result.put("code",failureCode(error));result.put("message",failureMessage(error));}
        finally{if(connection!=null)connection.disconnect();}
        return result;
    }
}
