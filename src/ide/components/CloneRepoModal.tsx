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
import { GitTokenTab } from './git/GitTokenTab';
import { GitSshKeyTab } from './git/GitSshKeyTab';
import {
  normalizeCloneUrl,
  folderNameFromCloneUrl,
  cloneGitRepo,
  cancelClone,
} from '../services/gitCloneService';
import {
  configureGitCredentials,
  getSshPublicKey,
  generateSshKey,
} from '../services/gitService';
import { Clipboard } from '../services/clipboardService';
import { getWorkspacesDir, formatDisplayPath } from '../services/storagePaths';

interface CloneRepoModalProps {
  visible: boolean;
  onClose: () => void;
  onCloned: (dirPath: string) => void;
}

const stripScheme = (p: string) => (p || '').replace(/^file:\/\//, '');

export function CloneRepoModal({ visible, onClose, onCloned }: CloneRepoModalProps) {
  const { theme } = useTheme();
  const { keyboardMouseMode } = useKeyboardMouseMode();
  const [repoUrl, setRepoUrl] = useState('');
  const [useSsh, setUseSsh] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [folderTouched, setFolderTouched] = useState(false);
  const [useCustomDir, setUseCustomDir] = useState(false);
  const [customDir, setCustomDir] = useState('');
  const [dirPickerVisible, setDirPickerVisible] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [clonePct, setClonePct] = useState<number | null>(null);
  const [cloneLog, setCloneLog] = useState<string[]>([]);
  const [error, setError] = useState('');

  // Inline auth (private repos): token form or SSH key manager.
  const [authSection, setAuthSection] = useState<null | 'token' | 'ssh'>(null);
  const [credUsername, setCredUsername] = useState('');
  const [credEmail, setCredEmail] = useState('');
  const [credToken, setCredToken] = useState('');
  const [savingToken, setSavingToken] = useState(false);
  const [sshKey, setSshKey] = useState<string | null>(null);
  const [sshLoading, setSshLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  const { keyboardOffset, isKeyboardVisible } = useAccurateKeyboard(8);
  const scrollRef = useRef<ScrollView>(null);
  const cloneCancelled = useRef(false);

  const resetAll = () => {
    setRepoUrl('');
    setUseSsh(false);
    setFolderName('');
    setFolderTouched(false);
    setUseCustomDir(false);
    setCustomDir('');
    setCloning(false);
    setClonePct(null);
    setCloneLog([]);
    cloneCancelled.current = false;
    setError('');
    setAuthSection(null);
    setCredUsername('');
    setCredEmail('');
    setCredToken('');
    setSshKey(null);
    setCopiedKey(false);
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
      setError(res.error || 'Clone failed.');
      if (res.needsAuth === 'token') {
        setAuthSection('token');
      } else if (res.needsAuth === 'ssh') {
        setAuthSection('ssh');
        void loadSshKey();
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
    const url = normalizeCloneUrl(repoUrl, useSsh);
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

  const handleSaveToken = async () => {
    if (!credUsername.trim() || !credToken.trim()) {
      setError('Username and token are required.');
      return;
    }
    setSavingToken(true);
    try {
      const ok = await configureGitCredentials(credToken.trim(), credUsername.trim(), credEmail.trim());
      if (!ok) {
        setError('Could not save credentials.');
        return;
      }
      setAuthSection(null);
      handleClone();
    } finally {
      setSavingToken(false);
    }
  };

  const loadSshKey = async () => {
    setSshLoading(true);
    try {
      setSshKey(await getSshPublicKey());
    } finally {
      setSshLoading(false);
    }
  };

  const handleGenerateSshKey = async () => {
    setSshLoading(true);
    try {
      const res = await generateSshKey(credEmail || credUsername || undefined);
      if (res.success) {
        setSshKey(res.publicKey || null);
      } else {
        setError(res.error || 'Failed to generate SSH key.');
      }
    } finally {
      setSshLoading(false);
    }
  };

  const handleCopySshKey = async () => {
    if (!sshKey) return;
    await Clipboard.setStringAsync(sshKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const parentDir = resolveParentDir();
  const previewFolder = folderName.trim() || (repoUrl.trim() ? folderNameFromCloneUrl(repoUrl.trim()) : '');

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={[styles.modalOverlay, isKeyboardVisible && { paddingBottom: keyboardOffset }]}>
        <TouchableOpacity style={[styles.modalBackdrop, { backgroundColor: theme.overlay }]} activeOpacity={1} onPress={handleClose} />
        <View style={[
          styles.bottomSheet,
          { backgroundColor: theme.bgSecondary, borderColor: theme.border },
          isKeyboardVisible && styles.bottomSheetKeyboardOpen,
        ]}>
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Clone GitHub Repo</Text>

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

            <View style={styles.protoRow}>
              <TouchableOpacity
                style={[
                  styles.protoBtn,
                  { backgroundColor: theme.bgTertiary, borderColor: theme.border },
                  !useSsh && { backgroundColor: `${theme.accent}20`, borderColor: theme.accent },
                ]}
                onPress={() => {
                  setUseSsh(false);
                  setError('');
                  if (!folderTouched && repoUrl.trim()) {
                    const n = normalizeCloneUrl(repoUrl, false);
                    if (n) setFolderName(folderNameFromCloneUrl(n));
                  }
                }}
              >
                <Ionicons name="globe-outline" size={15} color={!useSsh ? theme.accent : theme.textMuted} />
                <Text style={[styles.protoBtnText, { color: !useSsh ? theme.accent : theme.textSecondary }]}>HTTPS</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.protoBtn,
                  { backgroundColor: theme.bgTertiary, borderColor: theme.border },
                  useSsh && { backgroundColor: `${theme.accent}20`, borderColor: theme.accent },
                ]}
                onPress={() => {
                  setUseSsh(true);
                  setError('');
                  if (!folderTouched && repoUrl.trim()) {
                    const n = normalizeCloneUrl(repoUrl, true);
                    if (n) setFolderName(folderNameFromCloneUrl(n));
                  }
                }}
              >
                <Ionicons name="key-outline" size={15} color={useSsh ? theme.accent : theme.textMuted} />
                <Text style={[styles.protoBtnText, { color: useSsh ? theme.accent : theme.textSecondary }]}>SSH</Text>
              </TouchableOpacity>
            </View>

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

            {error ? (
              <View style={[styles.errorBox, { backgroundColor: `${theme.accentRed}14`, borderColor: `${theme.accentRed}40` }]}>
                <Ionicons name="alert-circle-outline" size={14} color={theme.accentRed} />
                <Text style={[styles.errorText, { color: theme.accentRed }]}>{error}</Text>
              </View>
            ) : null}

            {authSection === 'token' && (
              <View style={styles.authBox}>
                <Text style={[styles.authTitle, { color: theme.textPrimary }]}>Private repo — add a token, then retry</Text>
                <GitTokenTab
                  username={credUsername}
                  email={credEmail}
                  token={credToken}
                  saving={savingToken}
                  onChangeUsername={setCredUsername}
                  onChangeEmail={setCredEmail}
                  onChangeToken={setCredToken}
                  onSave={handleSaveToken}
                />
              </View>
            )}

            {authSection === 'ssh' && (
              <View style={styles.authBox}>
                <Text style={[styles.authTitle, { color: theme.textPrimary }]}>Private repo — add this key to GitHub, then retry</Text>
                <GitSshKeyTab
                  sshKey={sshKey}
                  loading={sshLoading}
                  copiedKey={copiedKey}
                  onCopyKey={handleCopySshKey}
                  onGenerateKey={handleGenerateSshKey}
                />
                <TouchableOpacity
                  style={[styles.retryBtn, { backgroundColor: `${theme.accent}20`, borderColor: theme.accent }]}
                  onPress={handleClone}
                  disabled={cloning}
                  activeOpacity={0.7}
                >
                  <Ionicons name="refresh" size={14} color={theme.accent} />
                  <Text style={[styles.retryBtnText, { color: theme.accent }]}>Retry Clone</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: theme.bgTertiary }]} onPress={handleCancelPress}>
                <Text style={[styles.buttonTextCancel, { color: theme.textSecondary }]}>{cloning ? 'Cancel Clone' : 'Cancel'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.accent, opacity: cloning ? 0.7 : 1 }]}
                onPress={handleClone}
                disabled={cloning}
              >
                {cloning ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[styles.buttonTextCreate, { color: theme.sendButtonIcon }]}>Clone & Open</Text>
                )}
              </TouchableOpacity>
            </View>
            {cloning && (
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
            )}
          </ScrollView>

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

