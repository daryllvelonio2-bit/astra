import React, { useState, useRef, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { WebView } from "react-native-webview";
import * as WebBrowser from "expo-web-browser";
import { WebBrowserNavBar } from "./browser/WebBrowserNavBar";
import { WebBrowserErrorView } from "./browser/WebBrowserErrorView";
import { WebBrowserEmptyView } from "./browser/WebBrowserEmptyView";
import { useTheme } from "../../theme/themeContext";
import { useOrientation } from "../../theme/useOrientation";
import { Clipboard } from "../services/clipboardService";

// localhost / 0.0.0.0 are not resolvable on-device; fold both to the loopback
// IP. Single source of truth (was copy-pasted on the input and sync paths).
const normalizeHost = (u: string): string =>
  u.replace(/localhost/gi, "127.0.0.1").replace(/0\.0\.0\.0/g, "127.0.0.1");

// Run while the pane is hidden: stop media (a hidden tab must not keep playing
// audio the user can hear) and drop focus, so the WebView can't hold the
// keyboard away from the pane that is actually visible.
const QUIESCE_SCRIPT = `(function(){try{
  document.querySelectorAll('video,audio').forEach(function(m){try{m.pause()}catch(e){} });
  if(window.speechSynthesis){try{window.speechSynthesis.cancel()}catch(e){}}
  var a=document.activeElement; if(a&&a.blur){try{a.blur()}catch(e){}}
}catch(e){}})(); true;`;

interface WebBrowserPreviewProps {
  initialUrl?: string;
  workspaceId?: string;
  /** True while the Browser tab is the visible pane. False = kept mounted but
   *  hidden (display:none), so the page, scroll position and session survive a
   *  tab switch without a reload. */
  visible?: boolean;
  /**
   * Report the current address upward. The caller persists it so the last URL
   * is restored on the next cold start.
   */
  onUrlChange?: (url: string) => void;
}

export function WebBrowserPreview({
  initialUrl = "",
  workspaceId,
  visible = true,
  onUrlChange,
}: WebBrowserPreviewProps) {
  const { theme } = useTheme();
  const { isLandscape } = useOrientation();
  const [url, setUrl] = useState(initialUrl);
  const [inputUrl, setInputUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Stable source object: a fresh `{ uri }` every render is what makes a
  // WebView reload on an unrelated re-render. Only a real url change should.
  const source = useMemo(() => ({ uri: url }), [url]);

  const webViewRef = useRef<WebView>(null);
  // URL the WebView is actually on (updated on every navigation, incl. link
  // taps). Used to tell a real incoming initialUrl from our own report echoed
  // back.
  const liveUrlRef = useRef("");

  // Reload without remount: preserves back/forward history (key-remounts
  // destroyed it). If the page isn't mounted (error/empty view), clearing
  // the error remounts fresh — no reload needed.
  const handleReload = () => {
    setHasError(false);
    setErrorMessage("");
    setTimeout(() => webViewRef.current?.reload(), 50);
  };

  // A new initialUrl is an external "open this" request (hosting link, IDE
  // action) or the restored address on cold start. Only point the source there
  // when the WebView isn't already on it — otherwise the live URL we report
  // upward would echo back and reload the page we keep alive.
  useEffect(() => {
    if (!initialUrl) return;
    const normalized = normalizeHost(initialUrl);
    if (normalized === liveUrlRef.current) return;
    setUrl(normalized);
    setInputUrl(normalized);
    setHasError(false);
    setErrorMessage("");
  }, [initialUrl]);

  // Hidden pane: quiet any media/focus. Kept mounted (display:none) so the
  // page, scroll position and session survive the switch.
  useEffect(() => {
    if (visible) return;
    webViewRef.current?.injectJavaScript(QUIESCE_SCRIPT);
  }, [visible]);

  const handleNavigate = (targetUrl?: string) => {
    let finalUrl = (targetUrl || inputUrl).trim();
    if (!finalUrl) return;

    if (finalUrl.startsWith("exp://")) {
      finalUrl = finalUrl.replace(/^exp:\/\//i, "http://");
    }

    finalUrl = normalizeHost(finalUrl);
    onUrlChange?.(finalUrl);

    if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://") && !finalUrl.startsWith("file://")) {
      if (/^:?\d+$/.test(finalUrl)) {
        const port = finalUrl.replace(/^:/, "");
        finalUrl = `http://127.0.0.1:${port}`;
      } else {
        finalUrl = "http://" + finalUrl;
      }
    }
    setHasError(false);
    setErrorMessage("");
    if (finalUrl === url) {
      // Same URL resubmit: source is unchanged so the page won't navigate —
      // reload explicitly (previously forced via remount).
      setInputUrl(finalUrl);
      webViewRef.current?.reload();
      return;
    }
    setUrl(finalUrl);
    setInputUrl(finalUrl);
  };

  // Phone equivalent of Ctrl+V: read the system clipboard and go.
  const handlePaste = async () => {
    try {
      const text = (await Clipboard.getStringAsync()) || "";
      const trimmed = text.trim();
      if (!trimmed) return;
      setInputUrl(trimmed);
      handleNavigate(trimmed);
    } catch (_) {}
  };

  const handleOpenExternal = async () => {
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (e) {
      console.error("Failed to open external browser:", e);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bgPrimary }]}>
      {/* Landscape: fullscreen content only — no nav bar, port chips, or loading bar. */}
      {!isLandscape && (
        <WebBrowserNavBar
          url={url}
          inputUrl={inputUrl}
          loading={loading}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          hasError={hasError}
          onGoBack={() => webViewRef.current?.goBack()}
          onGoForward={() => webViewRef.current?.goForward()}
          onReload={handleReload}
          onInputChange={setInputUrl}
          onSubmit={() => handleNavigate()}
          onClearInput={() => setInputUrl("")}
          onPaste={handlePaste}
          onOpenExternal={handleOpenExternal}
        />
      )}

      {loading && !isLandscape && (
        <View style={[styles.loadingBar, { backgroundColor: theme.bgTertiary, borderBottomColor: theme.border }]}>
          <ActivityIndicator size="small" color={theme.accent} style={{ transform: [{ scale: 0.7 }] }} />
          <Text style={[styles.loadingText, { color: theme.accent }]} numberOfLines={1}>Loading {url}...</Text>
        </View>
      )}

      <View style={[styles.previewContainer, { backgroundColor: theme.bgPrimary }]}>
        {!url ? (
          <WebBrowserEmptyView onNavigate={handleNavigate} />
        ) : hasError ? (
          <WebBrowserErrorView
            url={url}
            errorMessage={errorMessage}
            onNavigate={handleNavigate}
            onReload={handleReload}
            onOpenExternal={handleOpenExternal}
          />
        ) : (
          <WebView
            ref={webViewRef}
            source={source}
            style={[styles.webview, { backgroundColor: theme.bgPrimary }]}
            originWhitelist={["*"]}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            // Session persistence: keep the WebView's own cookie jar, share
            // cookies with the app store, keep third-party cookies (logins
            // often ride on them) and never start private.
            incognito={false}
            cacheEnabled={true}
            sharedCookiesEnabled={true}
            thirdPartyCookiesEnabled={true}
            mixedContentMode="always"
            allowsInlineMediaPlayback={true}
            allowFileAccess={true}
            allowFileAccessFromFileURLs={true}
            allowUniversalAccessFromFileURLs={true}
            startInLoadingState={true}
            renderLoading={() => (
              <View style={[styles.centerLoading, { backgroundColor: theme.bgPrimary }]}>
                <ActivityIndicator size="large" color={theme.accent} />
                <Text style={[styles.loadingUrl, { color: theme.accent }]}>{url}</Text>
              </View>
            )}
            renderError={(errorDomain, errorCode, errorDesc) => (
              <WebBrowserErrorView
                url={url}
                errorMessage={errorDesc || "net::ERR_CONNECTION_REFUSED"}
                onNavigate={handleNavigate}
                onReload={handleReload}
                onOpenExternal={handleOpenExternal}
              />
            )}
            onLoadStart={() => {
              setLoading(true);
              setHasError(false);
            }}
            onLoadEnd={() => setLoading(false)}
            onNavigationStateChange={(navState) => {
              // Ref FIRST: the upward report below echoes back as initialUrl,
              // and the sync effect must see this as the current page.
              liveUrlRef.current = navState.url;
              setCanGoBack(navState.canGoBack);
              setCanGoForward(navState.canGoForward);
              setInputUrl(navState.url);
              onUrlChange?.(navState.url);
            }}
            onError={(e) => {
              setLoading(false);
              setHasError(true);
              setErrorMessage(e.nativeEvent.description || "net::ERR_CONNECTION_REFUSED");
            }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 3,
    gap: 6,
    borderBottomWidth: 1,
  },
  loadingText: {
    fontSize: 11,
  },
  previewContainer: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  centerLoading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingUrl: {
    fontSize: 12,
    fontFamily: "monospace",
  },
});
