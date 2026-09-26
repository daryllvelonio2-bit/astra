import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  View, StyleSheet, Keyboard,
} from "react-native";
import { EditorTabBar } from "./EditorTabBar";
import { ProblemsPanel } from "./ProblemsPanel";
import { useEditorAssists } from "./useEditorAssists";
import { firstErrorLine } from "../services/codeDiagnosticsService";
import { useEditorConfig } from "./editor/useEditorConfig";
import { EditorEmptyState } from "./editor/EditorEmptyState";
import { useEditorKeyboardPad } from "./editor/useEditorKeyboardPad";
import { useEditorFormatting } from "./editor/useEditorFormatting";
import { useEditorGestures } from "./editor/useEditorGestures";
import { EditorStatusBar } from "./editor/EditorStatusBar";
import { EditorFloatingHud } from "./editor/EditorFloatingHud";
import { saveEditorSettings } from "../services/configService";
import { useTheme } from "../../theme/themeContext";
import { RecentFileItem } from "./editor/useRecentFiles";
import {
  CodeMirrorEditorView,
  CodeMirrorEditorHandle,
} from "./editor/CodeMirrorEditorView";

interface EditorViewProps {
  fileName?: string;
  activeFilePath?: string;
  content: string;
  onChangeContent: (text: string) => void;
  onExitProject?: () => void;
  onToggleSidebar?: () => void;
  onRunFile?: (content: string, fileName: string) => void;
  onEditModeChange?: (isEditing: boolean) => void;
  exitEditSignal?: number;
  onOpenSettings?: () => void;
  recentFiles?: RecentFileItem[];
  onSelectRecentFile?: (file: RecentFileItem) => void;
  onCloseRecentFile?: (filePath: string) => void;
  visible?: boolean;
  /** Queued jump request from project search (path must match this file). */
  jumpSignal?: { path: string; line: number; nonce: number } | null;
  onJumpConsumed?: () => void;
}

function EditorViewInner({
  fileName,
  activeFilePath,
  content,
  onChangeContent,
  onExitProject,
  onToggleSidebar,
  onRunFile,
  onEditModeChange,
  exitEditSignal = 0,
  onOpenSettings,
  recentFiles,
  onSelectRecentFile,
  onCloseRecentFile,
  visible = true,
  jumpSignal,
  onJumpConsumed,
}: EditorViewProps) {
  const { theme } = useTheme();
  const { editorSettings, keyboardMouseMode } = useEditorConfig();
  const gestures = useEditorGestures({
    initialFontSize: editorSettings.fontSize || 14,
    onSaveFontSize: (size) => saveEditorSettings({ fontSize: size }).catch(() => {}),
  });
  const fontSize = gestures.fontSize;
  const lineHeight = gestures.lineHeight;

  const [isEditing, setIsEditing] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const [cursorLine, setCursorLine] = useState(1);

  const cmRef = useRef<CodeMirrorEditorHandle>(null);
  const contentRef = useRef(content);
  contentRef.current = content;

  const lastExitSignalRef = useRef(exitEditSignal);
  const { keyboardBottomPadding, setContainerHeight } =
    useEditorKeyboardPad(keyboardMouseMode);

  useEffect(() => {
    onEditModeChange?.(isEditing);
  }, [isEditing, onEditModeChange]);

  useEffect(() => {
    if (exitEditSignal === lastExitSignalRef.current) return;
    lastExitSignalRef.current = exitEditSignal;
    if (isEditing) handleDoneEditing();
  }, [exitEditSignal, isEditing]);

  useEffect(() => {
    if (!keyboardMouseMode) return;
    Keyboard.dismiss();
    const sub = Keyboard.addListener("keyboardDidShow", () => Keyboard.dismiss());
    return () => sub.remove();
  }, [keyboardMouseMode]);

  useEffect(() => {
    if (!visible) {
      cmRef.current?.blur();
      Keyboard.dismiss();
    }
  }, [visible]);

  const assists = useEditorAssists(content, fileName, 0, editorSettings);

  const { isFormatting, formatToast, format } = useEditorFormatting({
    contentRef,
    fileName,
    tabSize: editorSettings.tabSize,
    onChangeContent,
  });

  const handleDoneEditing = useCallback(() => {
    setIsEditing(false);
    Keyboard.dismiss();
  }, []);

  const handleToggleEdit = useCallback(() => {
    setIsEditing((prev) => !prev);
  }, []);

  const handleEnterEditMode = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleCursorChange = useCallback((line: number) => {
    setCursorLine(line);
  }, []);

  const jumpToLine = useCallback((line: number) => {
    cmRef.current?.jumpToLine(line);
  }, []);

  const handleOpenFind = useCallback(() => {
    cmRef.current?.openFind();
  }, []);

  // Search-result jump: only consume the signal for the file it belongs to
  // (a stale signal from another file must not move this editor's cursor).
  const activeJump = useMemo(
    () => (jumpSignal && activeFilePath && jumpSignal.path === activeFilePath ? jumpSignal : null),
    [jumpSignal, activeFilePath]
  );

  const handleShowProblems = useCallback(() => {
    setShowProblems((prev) => !prev);
    const first = firstErrorLine(assists.diagnostics);
    if (first > 0) {
      jumpToLine(first);
    }
  }, [assists.diagnostics, jumpToLine]);

  const handleCloseProblems = useCallback(() => setShowProblems(false), []);

  const currentLineDiag = useMemo(() => {
    if (!cursorLine || !assists.diagnostics.length) return null;
    return assists.diagnostics.find((d) => d.line === cursorLine) || null;
  }, [cursorLine, assists.diagnostics]);

  const handleRunFileStable = useMemo(
    () => (onRunFile ? () => onRunFile(contentRef.current, fileName || "") : undefined),
    [onRunFile, fileName]
  );

  if (!fileName) {
    return (
      <EditorEmptyState
        theme={theme}
        onExitProject={onExitProject}
        onToggleSidebar={onToggleSidebar}
        onOpenSettings={onOpenSettings}
      />
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.bgPrimary },
        keyboardBottomPadding > 0 && { paddingBottom: keyboardBottomPadding },
      ]}
      onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
    >
      <EditorTabBar
        fileName={fileName}
        activeFilePath={activeFilePath}
        recentFiles={recentFiles}
        onSelectRecentFile={onSelectRecentFile}
        onCloseRecentFile={onCloseRecentFile}
        isEditing={isEditing}
        onToggleEdit={handleToggleEdit}
        onDoneEdit={handleDoneEditing}
        onRunFile={handleRunFileStable}
        onExitProject={onExitProject}
        onToggleSidebar={onToggleSidebar}
        onOpenSettings={onOpenSettings}
        onFormat={format}
        isFormatting={isFormatting}
        errorCount={assists.errorCount}
        warningCount={assists.warningCount}
        onShowProblems={handleShowProblems}
        isLandscape={gestures.isLandscape}
        isSplitScreen={gestures.isSplitScreen}
        onToggleSplitScreen={gestures.toggleSplitScreen}
        onZoomIn={gestures.zoomIn}
        onZoomOut={gestures.zoomOut}
        onResetZoom={gestures.resetZoom}
        onOpenFind={handleOpenFind}
      />

      <EditorFloatingHud
        theme={theme}
        splitToast={gestures.splitToast}
        zoomBadge={gestures.zoomBadge}
        formatToast={formatToast}
      />

      <CodeMirrorEditorView
        ref={cmRef}
        content={content}
        fileName={fileName}
        onChangeContent={onChangeContent}
        theme={theme}
        fontSize={fontSize}
        lineHeight={lineHeight}
        isEditing={isEditing}
        keyboardMouseMode={keyboardMouseMode}
        onCursorChange={handleCursorChange}
        onEnterEditMode={handleEnterEditMode}
        onPinchStart={gestures.handlePinchStart}
        onPinchMove={gestures.handlePinchMove}
        onPinchEnd={gestures.handlePinchEnd}
        onZoomIn={gestures.zoomIn}
        onZoomOut={gestures.zoomOut}
        onZoomReset={gestures.resetZoom}
        visible={visible}
        jumpSignal={activeJump}
        onJumpConsumed={activeJump ? onJumpConsumed : undefined}
      />

      <EditorStatusBar
        isEditing={isEditing}
        matchStatus={assists.matchStatus}
        matchKind={assists.match?.kind}
        currentLineDiag={currentLineDiag}
        showProblems={showProblems}
        onShowProblems={handleShowProblems}
        theme={theme}
      />

      {showProblems && (
        <ProblemsPanel
          diagnostics={assists.diagnostics}
          onJumpToLine={jumpToLine}
          onClose={handleCloseProblems}
        />
      )}
    </View>
  );
}

export const EditorView = React.memo(EditorViewInner);

const styles = StyleSheet.create({
  container: { flex: 1, position: "relative" },
});
