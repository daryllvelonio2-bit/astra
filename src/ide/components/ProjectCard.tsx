import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/themeContext';

export interface ProjectItem {
  id: string;
  name: string;
  template?: string;
  path: string;
  lastModified: string;
  fileCount: number;
  branch: string;
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
          {item.template ? `${item.template} • ` : ''}{item.fileCount} file{item.fileCount > 1 ? 's' : ''} • {item.lastModified}
        </Text>
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
});
