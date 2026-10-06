package cn.wordspace.toefl;

import java.nio.file.Files;
import java.nio.file.Path;
import org.json.JSONObject;
import org.json.JSONArray;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.decoder.Decoder;

/** Fixture-only JVM bridge: checks real JS/Android wire compatibility and QR decoding. */
public final class NativeInterop {
    public static void main(String[] arguments)throws Exception{
        JSONObject fixture=new JSONObject(Files.readString(Path.of(arguments[0])));
        JSONArray pixels=fixture.getJSONArray("matrix");BitMatrix matrix=new BitMatrix(pixels.length());
        for(int y=0;y<pixels.length();y++)for(int x=0;x<pixels.length();x++)if(pixels.getJSONArray(y).getBoolean(x))matrix.set(x,y);
        JSONObject result=new JSONObject().put("qr",new Decoder().decode(matrix).getText())
            .put("merged",SyncProtocol.merge(fixture.getJSONObject("left"),fixture.getJSONObject("right")))
            .put("decrypted",SyncProtocol.unseal(fixture.getString("key"),fixture.getJSONObject("packet")))
            .put("packet",SyncProtocol.seal(fixture.getString("key"),fixture.getJSONObject("payload")));
        System.out.print(result.toString());
    }
}
