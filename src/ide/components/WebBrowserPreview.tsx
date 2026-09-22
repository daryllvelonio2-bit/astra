import React, { useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { WebView } from "react-native-webview";
import * as WebBrowser from "expo-web-browser";
import { runningTasksService, RunningTask } from "../../ai/services/runningTasksService";
import { WebBrowserNavBar } from "./browser/WebBrowserNavBar";
import { WebBrowserErrorView } from "./browser/WebBrowserErrorView";
import { WebBrowserEmptyView } from "./browser/WebBrowserEmptyView";
import { useTheme } from "../../theme/themeContext";
import { useOrientation } from "../../theme/useOrientation";

interface WebBrowserPreviewProps {
  initialUrl?: string;
  workspaceId?: string;
}

export function WebBrowserPreview({
  initialUrl = "",
  workspaceId,
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
  const [runningTasks, setRunningTasks] = useState<RunningTask[]>([]);

  const webViewRef = useRef<WebView>(null);

  // Reload without remount: preserves back/forward history (key-remounts
  // destroyed it). If the page isn't mounted (error/empty view), clearing
  // the error remounts fresh — no reload needed.
  const handleReload = () => {
    setHasError(false);
    setErrorMessage("");
    setTimeout(() => webViewRef.current?.reload(), 50);
  };

  // Sync when initialUrl prop changes
  useEffect(() => {
    if (initialUrl) {
      const normalized = initialUrl.replace(/localhost/gi, "127.0.0.1").replace(/0\.0\.0\.0/g, "127.0.0.1");
      if (normalized !== url) {
        setUrl(normalized);
        setInputUrl(normalized);
        setHasError(false);
        setErrorMessage("");
      }
    }
  }, [initialUrl]);

  // Subscribe to live background servers: auto-load only into an empty tab,
  // never hijack a page the user already opened.
  // Speed: signature-guarded so terminal output floods don't re-render this tab.
  const tasksSigRef = useRef("");
  useEffect(() => {
    const unsub = runningTasksService.subscribe((tasks) => {
      const sig = tasks.map((t) => `${t.id}|${t.url || ""}|${t.port || ""}|${t.status}`).join(";");
      if (sig !== tasksSigRef.current) {
        tasksSigRef.current = sig;
        setRunningTasks(tasks);
      }
      if (tasks.length > 0 && !url) {
        const activeTask = tasks.find((t) => t.url || t.port) || tasks[0];
        let taskUrl = activeTask.url || (activeTask.port ? `http://127.0.0.1:${activeTask.port}` : undefined);
        if (taskUrl) {
          taskUrl = taskUrl.replace(/^exp:\/\//i, "http://").replace(/localhost/gi, "127.0.0.1").replace(/0\.0\.0\.0/g, "127.0.0.1");
          setUrl(taskUrl);
          setInputUrl(taskUrl);
          setHasError(false);
        }
      }
    });
    return unsub;
  }, [url]);

  const handleNavigate = (targetUrl?: string) => {
    let finalUrl = (targetUrl || inputUrl).trim();
    if (!finalUrl) return;

    if (finalUrl.startsWith("exp://")) {
      finalUrl = finalUrl.replace(/^exp:\/\//i, "http://");
    }

    finalUrl = finalUrl.replace(/localhost/gi, "127.0.0.1").replace(/0\.0\.0\.0/g, "127.0.0.1");

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
          <WebBrowserEmptyView
            runningTasks={runningTasks}
            onNavigate={handleNavigate}
          />
        ) : hasError ? (
          <WebBrowserErrorView
            url={url}
            errorMessage={errorMessage}
            runningTasks={runningTasks}
            onNavigate={handleNavigate}
            onReload={handleReload}
            onOpenExternal={handleOpenExternal}
          />
        ) : (
          <WebView
            ref={webViewRef}
            source={{ uri: url }}
            style={[styles.webview, { backgroundColor: theme.bgPrimary }]}
            originWhitelist={["*"]}
            javaScriptEnabled={true}
            domStorageEnabled={true}
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
                runningTasks={runningTasks}
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
              setCanGoBack(navState.canGoBack);
              setCanGoForward(navState.canGoForward);
              setInputUrl(navState.url);
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
