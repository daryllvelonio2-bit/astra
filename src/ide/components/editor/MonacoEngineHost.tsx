import React, { useRef, useEffect } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { buildMonacoHtml } from "./monacoEngineHtml.generated";
import {
  attachMonacoEngine,
  detachMonacoEngine,
  handleMonacoEngineMessage,
} from "../../services/monaco/monacoEngineService";

// Built once statically — headless 0x0 engine never reloads on theme toggle.
const STATIC_MONACO_HTML = buildMonacoHtml("#131314");

/**
 * Hidden headless Monaco engine. 0x0, never focused, no keyboard, no
 * resize/fit posts — it only tokenizes via the postMessage bridge.
 * Mounted once inside the editor tab; Phase 4 wires it into highlighting.
 */
export function MonacoEngineHost() {
  const ref = useRef<WebView>(null);

  useEffect(() => {
    attachMonacoEngine(ref.current as any);
    return () => detachMonacoEngine();
  }, []);

  return (
    <View style={{ position: "absolute", width: 0, height: 0, opacity: 0 }} pointerEvents="none">
      <WebView
        ref={ref}
        source={{ html: STATIC_MONACO_HTML }}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled={false}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        overScrollMode="never"
        androidLayerType="hardware"
        onMessage={(e) => handleMonacoEngineMessage(e.nativeEvent.data)}
      />
    </View>
  );
}
