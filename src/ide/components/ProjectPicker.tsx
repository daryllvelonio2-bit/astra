import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, FlatList, StatusBar, Platform } from 'react-native';
import { showAppDialog } from "../services/appDialog";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AstraLogo } from './AstraLogo';
import {
  listWorkspaceMetas,
  createWorkspace,
  deleteWorkspace,
  openExistingDirectoryAsProject,
} from '../services/workspaceService';
import { ProjectCard, ProjectItem } from './ProjectCard';
import { CreateProjectModal } from './CreateProjectModal';
import { CloneRepoModal } from './CloneRepoModal';
import { ProjectInspectorModal } from './ProjectInspectorModal';
import { SettingsModal } from './SettingsModal';
import { DirectoryPickerModal } from './DirectoryPickerModal';
import { formatDisplayPath } from '../services/storagePaths';
import { useTheme } from '../../theme/themeContext';
import { useOrientation } from '../../theme/useOrientation';
import { useAccurateKeyboard } from '../../theme/useAccurateKeyboard';
import { useKeyboardMouseMode } from '../context/KeyboardMouseContext';

interface ProjectPickerProps {
  onOpenWorkspace: (workspaceId: string) => void;
  onRerunStartup?: () => void;
}

export function ProjectPicker({ onOpenWorkspace, onRerunStartup }: ProjectPickerProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { keyboardMouseMode } = useKeyboardMouseMode();
  const { isLandscape } = useOrientation();
  const { isKeyboardVisible, keyboardOffset } = useAccurateKeyboard(24);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isCloneModalVisible, setCloneModalVisible] = useState(false);
  const [isOpenProjectModalVisible, setOpenProjectModalVisible] = useState(false);
  const [isSettingsModalVisible, setSettingsModalVisible] = useState(false);
  const [isInspectorVisible, setInspectorVisible] = useState(false);
  const [selectedProject, setSelectedProject] = useState<ProjectItem | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const metas = await listWorkspaceMetas();
      const loaded: ProjectItem[] = metas.map((meta) => ({
        id: meta.id,
        name: meta.name || meta.id,
        path: meta.dirPath ? formatDisplayPath(meta.dirPath) : formatDisplayPath('', meta.id),
        lastModified: 'Recently',
        fileCount: 1,
        branch: 'main',
      }));
      setProjects(loaded);
    } catch (e) {
      console.error('Failed to load workspaces:', e);
    }
  };

  const handleCreateProject = async (name: string, customPath?: string) => {
    try {
      const ws = await createWorkspace(name, customPath);
      await loadProjects();
      onOpenWorkspace(ws.id);
    } catch (e) {
      showAppDialog({ title: 'Error', message: 'Failed to create project workspace' });
    }
  };

  const handleOpenExistingProject = async (directoryPath: string) => {
    try {
      const ws = await openExistingDirectoryAsProject(directoryPath);
      await loadProjects();
      onOpenWorkspace(ws.id);
    } catch (e) {
      showAppDialog({ title: 'Error', message: 'Failed to open project workspace' });
    }
  };

  const handleClonedRepo = async (directoryPath: string) => {
    try {
      const ws = await openExistingDirectoryAsProject(directoryPath);
      await loadProjects();
      onOpenWorkspace(ws.id);
    } catch (e) {
      showAppDialog({ title: 'Error', message: 'Repo cloned, but it could not be opened as a workspace' });
      await loadProjects();
    }
  };

  const handleDeleteProject = async (project: ProjectItem) => {
    // Optimistic: remove from list instantly, delete files in background.
    setProjects((prev) => prev.filter((p) => p.id !== project.id));
    setInspectorVisible(false);
    setSelectedProject(null);
    try {
      await deleteWorkspace(project.id);
    } catch (e) {
      showAppDialog({ title: 'Error', message: 'Failed to delete workspace' });
    } finally {
      await loadProjects();
    }
  };

  const handleCardPress = useCallback((p: ProjectItem) => {
    onOpenWorkspace(p.id);
  }, [onOpenWorkspace]);

  const handleCardMorePress = useCallback((p: ProjectItem) => {
    setSelectedProject(p);
    setInspectorVisible(true);
  }, []);

  const filteredProjects = projects.filter((p) => {
    return p.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.bgPrimary, paddingTop: insets.top }]}>
      <StatusBar barStyle={theme.isDark ? "light-content" : "dark-content"} backgroundColor={theme.bgSecondary} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.bgSecondary, borderBottomColor: theme.border }]}>
        <View style={styles.titleRow}>
          <AstraLogo width={30} height={30} />
          <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Workspaces</Text>
          <View style={[styles.countBadge, { backgroundColor: theme.bgTertiary, borderColor: theme.border }]}>
            <Text style={[styles.countText, { color: theme.textSecondary }]}>{projects.length}</Text>
          </View>
          <View style={styles.titleSpacer} />
          <TouchableOpacity onPress={() => setSettingsModalVisible(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="settings-outline" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionPrimary, { backgroundColor: theme.accent }]}
            onPress={() => setCreateModalVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={16} color={theme.sendButtonIcon} />
            <Text style={[styles.actionText, { color: theme.sendButtonIcon }]}>New</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: theme.bgTertiary, borderColor: theme.border }]}
            onPress={() => setCloneModalVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="cloud-download-outline" size={15} color={theme.accent} />
            <Text style={[styles.actionText, { color: theme.textPrimary }]}>Clone</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: theme.bgTertiary, borderColor: theme.border }]}
            onPress={() => setOpenProjectModalVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="folder-open-outline" size={15} color={theme.accentGold} />
            <Text style={[styles.actionText, { color: theme.textPrimary }]}>Open</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Input */}
      <View style={[styles.searchContainer, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
        <Ionicons name="search" size={18} color={theme.textMuted} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: theme.textPrimary }]}
          placeholder="Search projects..."
          placeholderTextColor={theme.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          showSoftInputOnFocus={!keyboardMouseMode}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={16} color={theme.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Project List */}
      <FlatList
        key={isLandscape ? 'grid' : 'list'}
        numColumns={isLandscape ? 2 : 1}
        columnWrapperStyle={isLandscape ? styles.gridRow : undefined}
        data={filteredProjects}
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        renderItem={({ item }) => (
          <View style={isLandscape ? styles.gridItem : styles.listItem}>
            <ProjectCard
              item={item}
              onPress={handleCardPress}
              onMorePress={handleCardMorePress}
            />
          </View>
        )}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: isKeyboardVisible ? keyboardOffset : Math.max(insets.bottom, 24) },
        ]}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>No workspace projects found.</Text>
            <View style={styles.emptyActionsRow}>
              <TouchableOpacity style={[styles.createBtn, { backgroundColor: theme.accent }]} onPress={() => setCreateModalVisible(true)}>
                <Ionicons name="add" size={16} color={theme.sendButtonIcon} />
                <Text style={[styles.createBtnText, { color: theme.sendButtonIcon }]}>New Project</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.createBtn, styles.openExistingBtn, { backgroundColor: theme.bgTertiary, borderColor: theme.border }]}
                onPress={() => setOpenProjectModalVisible(true)}
              >
                <Ionicons name="folder-open-outline" size={16} color={theme.accentGold} />
                <Text style={[styles.createBtnText, { color: theme.textPrimary }]}>Open Existing</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.createBtn, { backgroundColor: `${theme.accent}18`, borderColor: `${theme.accent}40`, borderWidth: 1 }]}
                onPress={() => setCloneModalVisible(true)}
              >
                <Ionicons name="cloud-download-outline" size={16} color={theme.accent} />
                <Text style={[styles.createBtnText, { color: theme.accent }]}>Clone Repo</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
      />

      {/* Modals */}
      <CreateProjectModal
        visible={isCreateModalVisible}
        onClose={() => setCreateModalVisible(false)}
        onCreateProject={handleCreateProject}
      />

      <CloneRepoModal
        visible={isCloneModalVisible}
        onClose={() => setCloneModalVisible(false)}
        onCloned={handleClonedRepo}
      />

      <DirectoryPickerModal
        visible={isOpenProjectModalVisible}
        onClose={() => setOpenProjectModalVisible(false)}
        onSelectDirectory={(selectedPath) => {
          setOpenProjectModalVisible(false);
          handleOpenExistingProject(selectedPath);
        }}
      />

      <SettingsModal
        visible={isSettingsModalVisible}
        onClose={() => setSettingsModalVisible(false)}
        onRerunStartup={() => {
          setSettingsModalVisible(false);
          onRerunStartup?.();
        }}
      />

      <ProjectInspectorModal
        visible={isInspectorVisible}
        project={selectedProject}
        onClose={() => setInspectorVisible(false)}
        onOpenProject={(p) => {
          setInspectorVisible(false);
          onOpenWorkspace(p.id);
        }}
        onDeleteProject={handleDeleteProject}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  countBadge: {
    minWidth: 22,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countText: {
    fontSize: 11,
    fontWeight: '700',
  },
  titleSpacer: {
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  actionPrimary: {
    borderWidth: 0,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 8,
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    paddingBottom: 40,
  },
  listItem: {
    flex: 1,
  },
  gridRow: {
    gap: 10,
  },
  gridItem: {
    flex: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
    gap: 14,
  },
  emptyText: {
    fontSize: 14,
  },
  emptyActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    gap: 6,
  },
  openExistingBtn: {
    borderWidth: 1,
  },
  createBtnText: {
    fontSize: 13.5,
    fontWeight: 'bold',
  },
});
