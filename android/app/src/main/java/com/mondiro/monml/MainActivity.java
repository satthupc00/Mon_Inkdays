package com.mondiro.monml;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkUpdaterPlugin.class);
        registerPlugin(VoiceInputPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
