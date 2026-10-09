import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/themeContext';
import { ownerAvatarUrl } from '../services/gitAvatarService';

export interface ProjectItem {
  id: string;
  name: string;
  template?: string;
  path: string;
  lastModified: string;
  fileCount: number;
  branch: string;
  /**
   * Set only when the workspace's git origin points at GitHub. `gitOwner` is
   * the account login, `gitFullName` its `owner/repo`. Absent for local
   * projects, so the card renders exactly as before when there is no remote.
   */
  gitOwner?: string;
  gitFullName?: string;
}

interface ProjectCardProps {
  item: ProjectItem;
  onPress: (item: ProjectItem) => void;
  onMorePress?: (item: ProjectItem) => void;
}

export const ProjectCard = React.memo(function ProjectCard({ item, onPress, onMorePress }: ProjectCardProps) {
  const { theme, isMidnight } = useTheme();

  return (
    <TouchableOpacity
      style={[
        styles.projectCard,
        { backgroundColor: theme.bgTertiary, borderColor: theme.border },
        isMidnight && { shadowColor: theme.accentCyan, shadowOpacity: 0.1, shadowRadius: 6 },
      ]}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons name="folder-outline" size={24} color={theme.accent} />
        </View>
        <Text style={[styles.projectName, { color: theme.textPrimary }]} numberOfLines={1}>
          {item.name}
        </Text>
        {onMorePress && (
          <TouchableOpacity style={styles.moreOptions} onPress={() => onMorePress(item)}>
            <Ionicons name="ellipsis-vertical" size={18} color={theme.textMuted} />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.cardBody}>
        <View style={[styles.pathBadge, { backgroundColor: theme.bgPrimary, borderColor: theme.border }]}>
          <Text style={[styles.pathText, { color: theme.accent }]} numberOfLines={1}>
            {item.path}
          </Text>
        </View>
        <Text style={[styles.cardDetails, { color: theme.textSecondary }]}>
          {item.template ? `${item.template} • ` : ''}
          {/* File-count tagline is omitted when there is nothing to count, so a
              fresh workspace does not advertise itself. The recency label stays. */}
          {item.fileCount > 0 ? `${item.fileCount} file${item.fileCount > 1 ? 's' : ''} • ` : ''}
          {item.lastModified}
        </Text>
        {item.gitOwner ? (
          // Provenance line: only for workspaces whose git origin is on GitHub.
          // Local projects never render this, so their card is unchanged.
          <View style={[styles.cloneRow, { borderTopColor: theme.border }]}>
            <Image
              source={{ uri: ownerAvatarUrl(item.gitOwner) }}
              style={[styles.ownerAvatar, { borderColor: theme.border, backgroundColor: theme.bgPrimary }]}
            />
            <Text style={[styles.cloneName, { color: theme.textSecondary }]} numberOfLines={1}>
              {item.gitFullName || item.gitOwner}
            </Text>
            <View style={[styles.cloneBadge, { backgroundColor: `${theme.accent}18`, borderColor: `${theme.accent}44` }]}>
              <Ionicons name="logo-github" size={10} color={theme.accent} />
              <Text style={[styles.cloneBadgeText, { color: theme.accent }]}>Cloned</Text>
            </View>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  projectCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconContainer: {
    marginRight: 10,
  },
  projectName: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  moreOptions: {
    padding: 4,
  },
  cardBody: {
    marginLeft: 34,
  },
  pathBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 6,
    borderWidth: 1,
  },
  pathText: {
    fontSize: 11,
    fontFamily: 'monospace',
  },
  cardDetails: {
    fontSize: 12,
  },
  cloneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 9,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ownerAvatar: { width: 20, height: 20, borderRadius: 10, borderWidth: 1 },
  cloneName: { fontSize: 11.5, fontWeight: '600', flex: 1 },
  cloneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  cloneBadgeText: { fontSize: 9.5, fontWeight: '700' },
});
