import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Keyboard, Platform } from "react-native";
import { showAppDialog } from "../../services/appDialog";
import { Ionicons, Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { useOrientation } from "../../../theme/useOrientation";
import { useAccurateKeyboard } from "../../../theme/useAccurateKeyboard";
import { useKeyboardMouseMode } from "../../context/KeyboardMouseContext";
import { GitFileStatus } from "./types";
import { GitFileItem } from "./GitFileItem";
import { gitChangesListStyles as styles } from "./GitChangesList.styles";
import { generateCommitSummary } from "../../services/gitCommitSummary";

interface GitChangesListProps {
  files: GitFileStatus[];
  workspaceId?: string;
  selectedFile: GitFileStatus | null;
  currentBranch: string;
  ahead?: number;
  detached?: boolean;
  committing: boolean;
  onSelectFile: (file: GitFileStatus) => void;
  onToggleStageFile: (file: GitFileStatus) => void;
  onToggleStageAll: (stageAll: boolean) => void;
  onCommit: (summary: string, description: string) => void;
  onLongPressFile: (file: GitFileStatus, position: { x: number; y: number }) => void;
}

export function GitChangesList({
  files,
  workspaceId,
  selectedFile,
  currentBranch,
  ahead = 0,
  detached = false,
  committing,
  onSelectFile,
  onToggleStageFile,
  onToggleStageAll,
  onCommit,
  onLongPressFile,
}: GitChangesListProps) {
  const { theme } = useTheme();
  const { keyboardMouseMode } = useKeyboardMouseMode();
  const { isLandscape } = useOrientation();
  const { isKeyboardVisible, keyboardOffset } = useAccurateKeyboard(8);
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [showDescriptionInLandscape, setShowDescriptionInLandscape] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [descHeight, setDescHeight] = useState(48);

  const descriptionRef = useRef<TextInput>(null);
  const fileListRef = useRef<FlatList>(null);

  const handleGenerateSummary = async () => {
    if (generating || files.length === 0) return;
    setGenerating(true);
    try {
      const result = await generateCommitSummary(workspaceId, files);
      setSummary(result.summary);
      if (result.description) setDescription(result.description);
    } catch (e: any) {
      showAppDialog({ title: "Generate Summary", message: e?.message || "Could not generate a summary." });
    } finally {
      setGenerating(false);
    }
  };

  const handleInputFocus = () => {
    setInputFocused(true);
  };

  // Stable row rendering: with 179+ files, any parent re-render (e.g. every
  // keyboard frame event) must not reconcile all rows, or the lift lags.
  // Memoized GitFileItem + stable callbacks keep row updates to prop changes.
  const selectedPath = selectedFile?.path;
  const handleSelectItem = useCallback(
    (file: GitFileStatus) => onSelectFile(file),
    [onSelectFile]
  );
  const handleToggleItem = useCallback(
    (file: GitFileStatus) => onToggleStageFile(file),
    [onToggleStageFile]
  );
  const handleLongPressItem = useCallback(
    (file: GitFileStatus, position: { x: number; y: number }) => onLongPressFile(file, position),
    [onLongPressFile]
  );
  const renderFileItem = useCallback(
    ({ item }: { item: GitFileStatus }) => (
      <GitFileItem
        file={item}
        isSelected={selectedPath === item.path}
        isLandscape={isLandscape}
        onSelectFile={handleSelectItem}
        onToggleStageFile={handleToggleItem}
        onLongPressFile={handleLongPressItem}
      />
    ),
    [selectedPath, isLandscape, handleSelectItem, handleToggleItem, handleLongPressItem]
  );
  const fileKeyExtractor = useCallback((item: GitFileStatus) => item.path, []);

  const stagedCount = files.filter((f) => f.staged).length;
  const allStaged = files.length > 0 && stagedCount === files.length;
  const canCommit = summary.trim().length > 0 && files.length > 0 && !committing;

  const handleCommitPress = () => {
    if (!canCommit) return;
    if (stagedCount === 0) {
      onToggleStageAll(true);
    }
    onCommit(summary.trim(), description.trim());
    setSummary("");
    setDescription("");
  };

  return (
    <View style={[styles.container, !isLandscape && isKeyboardVisible && { paddingBottom: keyboardOffset }]}>
      {/* Select-all strip: no background, hidden when there is nothing to stage */}
      {files.length > 0 && (
        <View style={[styles.subHeader, isLandscape && styles.subHeaderLandscape]}>
          <TouchableOpacity
            style={styles.selectAllRow}
            onPress={() => onToggleStageAll(!allStaged)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={allStaged ? "checkbox" : stagedCount > 0 ? "remove-circle" : "square-outline"}
              size={isLandscape ? 13 : 15}
              color={allStaged || stagedCount > 0 ? theme.accent : theme.textMuted}
            />
            <Text
              style={[
                styles.countText,
                isLandscape && styles.countTextLandscape,
                { color: theme.textMuted },
              ]}
            >
              {allStaged ? "Unselect all" : "Select all"}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.countText, isLandscape && styles.countTextLandscape, { color: theme.textMuted }]}>
            {files.length} changed file{files.length !== 1 ? "s" : ""}
          </Text>
        </View>
      )}

      {/* Changed Files List (Working Directory) */}
      <FlatList
        ref={fileListRef}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS === "android"}
        data={files}
        keyExtractor={fileKeyExtractor}
        style={styles.fileList}
        contentContainerStyle={files.length === 0 ? styles.emptyContainer : styles.fileListContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        renderItem={renderFileItem}
        ListEmptyComponent={
          <View style={styles.emptyView}>
            {detached ? (
              <>
                <Octicons name="git-branch" size={isLandscape ? 22 : 28} color={theme.accentGold} />
                <Text style={[styles.emptyTitle, isLandscape && styles.emptyTitleLandscape, { color: theme.textPrimary }]}>
                  Detached HEAD
                </Text>
                <Text style={[styles.emptySubtitle, isLandscape && styles.emptySubtitleLandscape, { color: theme.textSecondary }]}>
                  You're viewing a remote snapshot, not a branch. Switch to a local branch to commit or push.
                </Text>
              </>
            ) : ahead > 0 ? (
              <>
                <Octicons name="arrow-up" size={isLandscape ? 22 : 28} color={theme.accent} />
                <Text style={[styles.emptyTitle, isLandscape && styles.emptyTitleLandscape, { color: theme.textPrimary }]}>
                  {ahead} {ahead === 1 ? "commit" : "commits"} to push
                </Text>
                <Text style={[styles.emptySubtitle, isLandscape && styles.emptySubtitleLandscape, { color: theme.textSecondary }]}>
                  Your local commits are ready to push to GitHub.
                </Text>
              </>
            ) : (
              <>
                <Octicons name="check-circle" size={isLandscape ? 26 : 32} color={theme.accentGreen} />
                <Text style={[styles.emptyTitle, isLandscape && styles.emptyTitleLandscape, { color: theme.textPrimary }]}>
                  No local changes
                </Text>
                <Text style={[styles.emptySubtitle, isLandscape && styles.emptySubtitleLandscape, { color: theme.textSecondary }]}>
                  Working directory is completely clean.
                </Text>
              </>
            )}
          </View>
        }
      />

      {/* Commit Box */}
      <View
        style={[
          styles.commitBox,
          isLandscape && styles.commitBoxLandscape,
          { backgroundColor: theme.bgSecondary, borderTopColor: theme.border },
        ]}
      >
        {files.length > 0 && (
          <View style={styles.summaryRow}>
            <TouchableOpacity
              style={[
                styles.descToggleBtn,
                isLandscape && styles.descToggleBtnLandscape,
                { backgroundColor: theme.bgTertiary, borderColor: theme.border },
              ]}
              onPress={handleGenerateSummary}
              disabled={generating}
              activeOpacity={0.7}
              accessibilityLabel="Generate commit summary with AI"
            >
              {generating ? (
                <ActivityIndicator size="small" color={theme.accent} />
              ) : (
                <Ionicons name="sparkles" size={14} color={theme.accent} />
              )}
            </TouchableOpacity>
            <TextInput
              style={[
                styles.summaryInput,
                isLandscape && styles.summaryInputLandscape,
                { backgroundColor: theme.bgTertiary, borderColor: theme.border, color: theme.textPrimary },
              ]}
              placeholder="Summary (required)"
              placeholderTextColor={theme.textMuted}
              value={summary}
              onChangeText={setSummary}
              returnKeyType="next"
              blurOnSubmit={false}
              showSoftInputOnFocus={!keyboardMouseMode}
              onFocus={handleInputFocus}
              onBlur={() => setInputFocused(false)}
              onSubmitEditing={() => descriptionRef.current?.focus()}
            />
            {isLandscape && (
              <TouchableOpacity
                style={[
                  styles.descToggleBtn,
                  isLandscape && styles.descToggleBtnLandscape,
                  { backgroundColor: theme.bgTertiary, borderColor: theme.border },
                  showDescriptionInLandscape && { borderColor: theme.accent },
                ]}
                onPress={() => setShowDescriptionInLandscape((prev) => !prev)}
                accessibilityLabel="Toggle Description field"
              >
                <Ionicons
                  name={showDescriptionInLandscape ? "chevron-down" : "add"}
                  size={13}
                  color={showDescriptionInLandscape ? theme.accent : theme.textMuted}
                />
              </TouchableOpacity>
            )}
          </View>
        )}

        {files.length > 0 && (!isLandscape || showDescriptionInLandscape) && (
          <TextInput
            ref={descriptionRef}
            style={[
              styles.descriptionInput,
              isLandscape && styles.descriptionInputLandscape,
              !isLandscape && { height: Math.min(Math.max(descHeight, 48), 140) },
              inputFocused && !isLandscape && { borderColor: theme.accent },
              { backgroundColor: theme.bgTertiary, borderColor: inputFocused && !isLandscape ? theme.accent : theme.border, color: theme.textPrimary },
            ]}
            placeholder="Description (optional)"
            placeholderTextColor={theme.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            scrollEnabled
            showSoftInputOnFocus={!keyboardMouseMode}
            textAlignVertical="top"
            returnKeyType="default"
            blurOnSubmit={false}
            onFocus={handleInputFocus}
            onBlur={() => setInputFocused(false)}
            onContentSizeChange={(e) => {
              if (!isLandscape) setDescHeight(e.nativeEvent.contentSize.height);
            }}
            numberOfLines={isLandscape ? 1 : 2}
          />
        )}

        {/* Commit bar — push lives in the header sync button */}
        <View style={styles.commitBtnRow}>
            <TouchableOpacity
                style={[styles.commitBtn, isLandscape && styles.commitBtnLandscape, { backgroundColor: canCommit ? theme.accent : theme.bgTertiary, borderColor: theme.border }]}
                onPress={handleCommitPress}
                disabled={!canCommit}
                activeOpacity={0.8}
                accessibilityLabel={`Commit to ${currentBranch}`}
              >
                {committing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[styles.commitBtnText, isLandscape && styles.commitBtnTextLandscape, { color: canCommit ? "#fff" : theme.textMuted }]} numberOfLines={1} ellipsizeMode="tail">
                    Commit to {currentBranch} ({stagedCount || files.length})
                  </Text>
                )}
              </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
