package com.mondiro.monml;

import android.Manifest;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognitionService;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Nhập bằng giọng nói tiếng Việt (giống bàn phím MonKey):
 * - ưu tiên bộ nhận diện của Google (máy Samsung có thể đặt mặc định bộ khác không hỗ trợ tiếng Việt)
 * - gợi ý thêm các từ tiếng Anh hay xen trong câu để nhận đúng khi nói giọng Việt (Android 13+)
 * - nghe liên tục: mỗi đoạn nói xong được chốt rồi tự nghe tiếp, tới khi gọi stop()/cancel()
 * Sự kiện gửi lên JS: "partial" {text}, "final" {text}, "state" {state: listening|stopped|error, message}
 */
@CapacitorPlugin(name = "VoiceInput", permissions = { @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "mic") })
public class VoiceInputPlugin extends Plugin implements RecognitionListener {

    private static final ArrayList<String> ENGLISH_HINTS = new ArrayList<>(Arrays.asList(
        "online", "offline", "on", "off", "website", "web", "email", "app", "file", "link",
        "game", "update", "download", "upload", "OK", "check", "check in", "meeting", "deadline", "team",
        "project", "feedback", "test", "design", "animation", "Spine", "Cocos", "Facebook", "Zalo",
        "YouTube", "Google", "TikTok", "Instagram", "Messenger", "iPhone", "Samsung", "laptop", "PC", "wifi",
        "pass", "password", "share", "like", "comment", "post", "story", "video", "clip", "livestream",
        "shop", "shopping", "sale", "order", "ship", "shipper", "Grab", "coffee", "cafe", "milk tea",
        "hot", "cute", "OK luôn", "sorry", "thank you", "hello", "bye", "party", "happy",
        "weekend", "chill", "stress", "relax", "gym", "yoga", "fitness", "diet", "healthy", "camping",
        "trip", "check out", "booking", "hotel", "resort", "homestay", "taxi", "bus", "concert", "show",
        "film", "Netflix", "Spotify", "playlist", "music", "idol", "fan", "selfie", "photo",
        "sketch", "concept", "art", "artist", "model", "render", "Blender", "Photoshop", "brief", "client",
        "boss", "lead", "leader", "manager", "HR", "KPI", "OT", "salary", "bonus", "event",
        "workshop", "training", "online meeting", "zoom", "Teams", "slide", "Excel", "Word", "note", "plan",
        "schedule", "task", "to do", "list", "level", "bug", "fix", "build", "release", "version",
        "mail", "inbox", "spam", "account", "login", "logout", "Mondiro", "MonKey"
    ));
    private static final int MAX_SILENT_RESTARTS = 4;

    private SpeechRecognizer recognizer;
    private boolean active = false, stopping = false;
    private int silentRestarts = 0;

    @PluginMethod
    public void available(PluginCall call) {
        JSObject r = new JSObject();
        r.put("available", SpeechRecognizer.isRecognitionAvailable(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void ensurePermission(PluginCall call) {
        if (getPermissionState("mic") == PermissionState.GRANTED) { JSObject r = new JSObject(); r.put("granted", true); call.resolve(r); }
        else requestPermissionForAlias("mic", call, "micResult");
    }

    @PermissionCallback
    private void micResult(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", getPermissionState("mic") == PermissionState.GRANTED);
        call.resolve(r);
    }

    @PluginMethod
    public void start(PluginCall call) {
        call.resolve();
        getActivity().runOnUiThread(() -> {
            if (active) return;
            active = true; stopping = false; silentRestarts = 0;
            listen();
        });
    }

    /** Dừng nghe: đoạn đang nói vẫn được chốt (sự kiện "final") rồi mới báo "stopped". */
    @PluginMethod
    public void stop(PluginCall call) {
        call.resolve();
        getActivity().runOnUiThread(() -> {
            if (!active) { state("stopped", null); return; }
            stopping = true;
            if (recognizer != null) recognizer.stopListening(); else finish();
        });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        call.resolve();
        getActivity().runOnUiThread(() -> {
            if (recognizer != null) recognizer.cancel();
            if (active) finish();
        });
    }

    @Override
    protected void handleOnDestroy() {
        if (recognizer != null) { recognizer.destroy(); recognizer = null; }
    }

    private SpeechRecognizer create() {
        List<ResolveInfo> services = getContext().getPackageManager().queryIntentServices(new Intent(RecognitionService.SERVICE_INTERFACE), 0);
        ResolveInfo google = null;
        for (ResolveInfo s : services) if ("com.google.android.googlequicksearchbox".equals(s.serviceInfo.packageName)) { google = s; break; }
        if (google == null) for (ResolveInfo s : services) if (s.serviceInfo.packageName.startsWith("com.google.")) { google = s; break; }
        if (google != null) return SpeechRecognizer.createSpeechRecognizer(getContext(), new ComponentName(google.serviceInfo.packageName, google.serviceInfo.name));
        return SpeechRecognizer.createSpeechRecognizer(getContext());
    }

    private void listen() {
        if (recognizer == null) recognizer = create();
        recognizer.setRecognitionListener(this);
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "vi-VN");
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "vi-VN");
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        if (Build.VERSION.SDK_INT >= 33) i.putStringArrayListExtra(RecognizerIntent.EXTRA_BIASING_STRINGS, ENGLISH_HINTS);
        try {
            recognizer.startListening(i);
            state("listening", null);
        } catch (Exception e) {
            active = false;
            state("error", "Không mở được bộ nhận giọng nói");
        }
    }

    private void finish() {
        active = false; stopping = false;
        state("stopped", null);
    }

    private void state(String s, String msg) {
        JSObject r = new JSObject();
        r.put("state", s);
        if (msg != null) r.put("message", msg);
        notifyListeners("state", r);
    }

    private void text(String ev, String t) {
        JSObject r = new JSObject();
        r.put("text", t);
        notifyListeners(ev, r);
    }

    private static String first(Bundle b) {
        if (b == null) return "";
        ArrayList<String> l = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return l == null || l.isEmpty() || l.get(0) == null ? "" : l.get(0);
    }

    @Override public void onPartialResults(Bundle b) { String t = first(b); if (!t.isEmpty()) text("partial", t); }

    @Override public void onResults(Bundle b) {
        String t = first(b);
        text("final", t);
        if (!t.isEmpty()) silentRestarts = 0;
        if (active && !stopping) listen(); else finish();
    }

    @Override public void onError(int error) {
        boolean silent = error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT;
        text("final", ""); // chốt phần chữ tạm (nếu có)
        if (active && !stopping && silent && ++silentRestarts <= MAX_SILENT_RESTARTS) { listen(); return; }
        if (!silent && !stopping && active) {
            String m;
            switch (error) {
                case SpeechRecognizer.ERROR_NETWORK: case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: m = "Lỗi mạng, chưa nhận được giọng nói"; break;
                case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: m = "Chưa cho phép micro"; break;
                case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: m = "Bộ nhận giọng nói đang bận, thử lại"; break;
                default: m = "Không nhận được giọng nói (mã " + error + ")";
            }
            active = false; stopping = false;
            state("error", m);
            return;
        }
        finish();
    }

    @Override public void onReadyForSpeech(Bundle p) {}
    @Override public void onBeginningOfSpeech() {}
    @Override public void onRmsChanged(float r) {}
    @Override public void onBufferReceived(byte[] b) {}
    @Override public void onEndOfSpeech() {}
    @Override public void onEvent(int t, Bundle p) {}
}
