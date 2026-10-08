import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Keyboard,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/themeContext';
import { useAccurateKeyboard } from '../../theme/useAccurateKeyboard';
import { useKeyboardMouseMode } from '../context/KeyboardMouseContext';
import { cloneRepoModalStyles as styles } from './CloneRepoModal.styles';
import { DirectoryPickerModal } from './DirectoryPickerModal';
import { MyReposList } from './git/MyReposList';
import { GitHubRepo } from '../services/gitHubTypes';
import {
  normalizeCloneUrl,
  folderNameFromCloneUrl,
  cloneGitRepo,
  cancelClone,
} from '../services/gitCloneService';
import { getWorkspacesDir, formatDisplayPath } from '../services/storagePaths';
import { subscribeToolchainGate, GateStatus } from '../services/toolchainGate';
import { ToolchainGateScreen } from './git/ToolchainGateScreen';

interface CloneRepoModalProps {
  visible: boolean;
  onClose: () => void;
  onCloned: (dirPath: string) => void;
}

const stripScheme = (p: string) => (p || '').replace(/^file:\/\//, '');

/** The URL a repo row clones from. Kept in one place so mode and button agree. */
const repoCloneUrl = (repo: GitHubRepo) =>
  repo.cloneUrl || `https://github.com/${repo.fullName}.git`;

export function CloneRepoModal({ visible, onClose, onCloned }: CloneRepoModalProps) {
  const { theme } = useTheme();
  const { keyboardMouseMode } = useKeyboardMouseMode();
  const [repoUrl, setRepoUrl] = useState('');
  // HTTPS + token only. The HTTPS/SSH buttons were removed: one field accepts
// owner/repo, a full URL or the git@ ssh form and normalizes it, so the
// protocol is no longer a question the user has to answer.
  const useSsh = false;
  const [folderName, setFolderName] = useState('');
  const [folderTouched, setFolderTouched] = useState(false);
  const [useCustomDir, setUseCustomDir] = useState(false);
  const [customDir, setCustomDir] = useState('');
  const [dirPickerVisible, setDirPickerVisible] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [clonePct, setClonePct] = useState<number | null>(null);
  const [cloneLog, setCloneLog] = useState<string[]>([]);
  const [error, setError] = useState('');
  // Two ways in, and the two are kept apart on purpose.
  //
  //   'url'     a pasted URL and an optional folder name.
  //   'account' the signed-in account's repos, private ones included. NO url
  //             field, no protocol switch, no folder input: the picked repo IS
  //             the source of truth. The list is the only scrollable on screen
  //             (see the two render branches below) so nothing can steal the
  //             drag — an earlier version nested it in the sheet's ScrollView
  //             and it refused to scroll on Android.
  const [mode, setMode] = useState<'url' | 'account'>('url');
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);

  const handlePickRepo = (repo: GitHubRepo) => {
    setSelectedRepo(repo);
    setRepoUrl(repoCloneUrl(repo));
    setError('');
    if (!folderTouched) setFolderName(repo.name || folderNameFromCloneUrl(repoCloneUrl(repo)));
  };

  const { keyboardOffset, isKeyboardVisible } = useAccurateKeyboard(8);
  const scrollRef = useRef<ScrollView>(null);
  const cloneCancelled = useRef(false);

  // Toolchain gate: cloning needs git + TLS certificates in the guest.
  // Show setup instead of the form when they are missing.
  const [gate, setGate] = useState<GateStatus | null>(null);
  useEffect(() => subscribeToolchainGate(setGate), []);
  const gateOpen = !!gate && gate.ready && gate.gitEssentialsReady;

  const resetAll = () => {
    setRepoUrl('');
    setFolderName('');
    setFolderTouched(false);
    setUseCustomDir(false);
    setCustomDir('');
    setCloning(false);
    setClonePct(null);
    setCloneLog([]);
    setSelectedRepo(null);
    cloneCancelled.current = false;
    setError('');
  };

  const handleClose = () => {
    if (cloning) return;
    resetAll();
    onClose();
  };

  const handleCancelPress = () => {
    if (cloning) {
      cloneCancelled.current = true;
      cancelClone();
      return;
    }
    handleClose();
  };

  const handleProgressLine = (line: string) => {
    const matches = line.match(/(\d{1,3})%/g);
    if (matches) {
      const pct = Math.min(100, parseInt(matches[matches.length - 1], 10));
      setClonePct((prev) => (prev === pct ? prev : pct));
    }
    setCloneLog((prev) => {
      const next = prev.length >= 4 ? [...prev.slice(-3), line] : [...prev, line];
      return next;
    });
  };

  const handleUrlChange = (val: string) => {
    setRepoUrl(val);
    setError('');
    if (!folderTouched) {
      const normalized = normalizeCloneUrl(val, useSsh);
      setFolderName(normalized ? folderNameFromCloneUrl(normalized) : '');
    }
  };

  const resolveParentDir = (): string | null => {
    if (useCustomDir) {
      const clean = stripScheme(customDir).replace(/\/+$/, '');
      return clean || null;
    }
    const def = stripScheme(getWorkspacesDir()).replace(/\/+$/, '');
    return def || null;
  };

  const runClone = async (url: string, parentDir: string, folder: string): Promise<boolean> => {
    setCloning(true);
    setClonePct(null);
    setCloneLog(['Connecting…']);
    cloneCancelled.current = false;
    setError('');
    try {
      const res = await cloneGitRepo(url, parentDir, folder, handleProgressLine);
      if (cloneCancelled.current) {
        setError('Clone cancelled.');
        return false;
      }
      if (res.success && res.dirPath) {
        const done = res.dirPath;
        resetAll();
        onClose();
        onCloned(done);
        return true;
      }
      if (res.needsAuth) {
        // Never tell a signed-in user to sign in again. The usual cause is the
        // guest never receiving ~/.git-credentials (fresh install, or the Linux
        // environment was not extracted when they signed in).
        setError(
          res.credentialsWired === false
            ? "Your GitHub account is linked, but the Linux environment could not store your git credentials yet. Open the Git tab once (or Settings → Linux) so it can finish setting up, then clone again."
            : "GitHub refused this repository. If it is private, sign in again in the Git tab — your token may not cover it."
        );
      } else {
        setError(res.error || 'Clone failed.');
      }
      return false;
    } catch (e: any) {
      setError(e?.message || 'Clone failed.');
      return false;
    } finally {
      setCloning(false);
    }
  };

  const handleClone = () => {
    const accountUrl = selectedRepo ? repoCloneUrl(selectedRepo) : '';
    if (mode === 'account' && !accountUrl) {
      setError('Pick a repository from your list first.');
      return;
    }
    const url = mode === 'account' ? accountUrl : normalizeCloneUrl(repoUrl, useSsh);
    if (!url) {
      setError('Enter a repo URL or user/repo shorthand.');
      return;
    }
    const folder = folderName.trim() || folderNameFromCloneUrl(url);
    const parentDir = resolveParentDir();
    if (!parentDir) {
      setError('No destination directory. Pick a parent folder.');
      return;
    }
    void runClone(url, parentDir, folder);
  };

  const parentDir = resolveParentDir();
  const activeUrl = mode === 'account' ? (selectedRepo ? repoCloneUrl(selectedRepo) : '') : repoUrl.trim();
  const previewFolder = folderName.trim() || (activeUrl ? folderNameFromCloneUrl(activeUrl) : '');

  // Gate: while the toolchain (or git essentials) is missing, the sheet shows
  // the setup screen instead of the clone form. Before the first probe lands
  // (gate === null) show nothing — a provisioned device must not flash it.
  if (visible && gate && !gate.settled) {
    return null;
  }
  if (visible && gate && !gateOpen) {
    return (
      <Modal visible animationType="slide" transparent onRequestClose={handleClose}>
        <View style={[styles.modalOverlay, { paddingTop: 60 }]}
        >
          <View style={[styles.bottomSheet, { backgroundColor: theme.bgSecondary, borderColor: theme.border, height: '88%' }]}>
            <ToolchainGateScreen gate={gate} title="Clone" />
          </View>
        </View>
      </Modal>
    );
  }

  const modeButton = (target: 'url' | 'account', icon: any, label: string) => (
    <TouchableOpacity
      style={{
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        height: 36, borderRadius: 8, borderWidth: 1,
        backgroundColor: mode === target ? `${theme.accent}20` : theme.bgTertiary,
        borderColor: mode === target ? theme.accent : theme.border,
      }}
      onPress={() => { setMode(target); setError(''); }}
      activeOpacity={0.8}
    >
      <Ionicons name={icon} size={14} color={mode === target ? theme.accent : theme.textMuted} />
      <Text style={{ fontSize: 12, fontWeight: '700', color: mode === target ? theme.accent : theme.textSecondary }}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const destRow = (
    <TouchableOpacity
      style={[styles.destRow, { backgroundColor: theme.bgTertiary, borderColor: theme.border }]}
      onPress={() => setDirPickerVisible(true)}
      activeOpacity={0.7}
    >
      <Ionicons name="folder-open-outline" size={15} color={theme.accentGold} />
      <Text style={[styles.destText, { color: theme.textSecondary }]} numberOfLines={1}>
        {parentDir ? formatDisplayPath(parentDir) : 'Pick parent folder'}
        {previewFolder ? `${previewFolder}/` : ''}
      </Text>
      <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
    </TouchableOpacity>
  );

  const errorBox = error ? (
    <View style={[styles.errorBox, { backgroundColor: `${theme.accentRed}14`, borderColor: `${theme.accentRed}40` }]}>
      <Ionicons name="alert-circle-outline" size={14} color={theme.accentRed} />
      <Text style={[styles.errorText, { color: theme.accentRed }]}>{error}</Text>
    </View>
  ) : null;

  const progressBox = cloning ? (
    <View style={[styles.progressBox, { backgroundColor: theme.bgTertiary, borderColor: theme.border }]}>
      <View style={styles.progressRow}>
        <Text style={[styles.progressPct, { color: theme.accent }]}>
          {clonePct !== null ? `${clonePct}%` : '…'}
        </Text>
        <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
          <View style={[styles.progressFill, { backgroundColor: theme.accent, width: `${clonePct ?? 0}%` as any }]} />
        </View>
      </View>
      {cloneLog.length > 0 && (
        <Text style={[styles.progressLine, { color: theme.textMuted }]} numberOfLines={2}>
          {cloneLog[cloneLog.length - 1]}
        </Text>
      )}
    </View>
  ) : null;

  const actions = (
    <View style={styles.modalActions}>
      <TouchableOpacity style={[styles.modalButton, { backgroundColor: theme.bgTertiary }]} onPress={handleCancelPress}>
        <Text style={[styles.buttonTextCancel, { color: theme.textSecondary }]}>{cloning ? 'Cancel Clone' : 'Cancel'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.modalButton, { backgroundColor: theme.accent, opacity: cloning || (mode === 'account' && !selectedRepo) ? 0.6 : 1 }]}
        onPress={handleClone}
        disabled={cloning}
      >
        {cloning ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          // Plain "Clone", never the repo name: a name like
          // "Boarding-House-Management-w-Ai-Chatbot-and-Epayment" overflowed the
          // button and collided with the sheet title. The selected repo is
          // already obvious from the highlighted row and the destination line
          // below it, and the sheet is short in landscape.
          <Text style={[styles.buttonTextCreate, { color: theme.sendButtonIcon }]} numberOfLines={1}>
            {mode === 'account' ? 'Clone' : 'Clone & Open'}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={[styles.modalOverlay, isKeyboardVisible && { paddingBottom: keyboardOffset }]}>
        <TouchableOpacity style={[styles.modalBackdrop, { backgroundColor: theme.overlay }]} activeOpacity={1} onPress={handleClose} />
        <View style={[
          styles.bottomSheet,
          { backgroundColor: theme.bgSecondary, borderColor: theme.border },
          // Account mode pins the sheet to a real height so the repo list has a
          // definite box to scroll inside. Without a height the list would size
          // to its content and there would be nothing to scroll.
          mode === 'account' && { height: '82%' },
          isKeyboardVisible && styles.bottomSheetKeyboardOpen,
        ]}>
          <View style={styles.sheetHeader}>
            <Text style={[styles.modalTitle, { color: theme.textPrimary, marginBottom: 0 }]}>Clone GitHub Repo</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {modeButton('url', 'link-outline', 'Paste URL')}
              {modeButton('account', 'logo-github', 'My GitHub repos')}
            </View>
          </View>

          {mode === 'account' ? (
            // No ScrollView anywhere on this branch: the FlatList inside
            // MyReposList is the ONLY scrollable, so a drag always lands on it.
            <View style={styles.accountBody}>
              <MyReposList
                theme={theme}
                onPick={handlePickRepo}
                fill
                selectedFullName={selectedRepo?.fullName}
              />
              <View style={styles.accountFooter}>
                {destRow}
                {errorBox}
                {actions}
                {progressBox}
              </View>
            </View>
          ) : (
            <ScrollView
              ref={scrollRef}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scrollContent}
            >
              <Text style={[styles.label, { color: theme.textSecondary }]}>Repository URL</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.bgInput, borderColor: theme.border, color: theme.textPrimary }]}
                placeholder="https://github.com/user/repo or user/repo"
                placeholderTextColor={theme.textMuted}
                value={repoUrl}
                onChangeText={handleUrlChange}
                autoCapitalize="none"
                autoCorrect={false}
                showSoftInputOnFocus={!keyboardMouseMode}
                returnKeyType="next"
              />

              <Text style={[styles.label, { color: theme.textSecondary }]}>Folder Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.bgInput, borderColor: theme.border, color: theme.textPrimary }]}
                placeholder="repo-name"
                placeholderTextColor={theme.textMuted}
                value={folderName}
                onChangeText={(v) => { setFolderName(v); setFolderTouched(true); }}
                autoCapitalize="none"
                autoCorrect={false}
                showSoftInputOnFocus={!keyboardMouseMode}
                returnKeyType="done"
              />

              {destRow}
              {errorBox}
              {actions}
              {progressBox}
            </ScrollView>
          )}

          <DirectoryPickerModal
            visible={dirPickerVisible}
            onClose={() => setDirPickerVisible(false)}
            onSelectDirectory={(p) => {
              setDirPickerVisible(false);
              const clean = stripScheme(p).replace(/\/+$/, '');
              if (clean) {
                setCustomDir(clean);
                setUseCustomDir(true);
              }
            }}
          />
        </View>
      </View>
    </Modal>
  );
}
