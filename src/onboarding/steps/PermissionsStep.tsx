import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  AppState,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../theme/themeContext";
import {
  isIgnoringBatteryOptimizations,
  requestIgnoreBatteryOptimizations,
  openBatteryOptimizationSettings,
  openAppDetailsSettings,
  hasAllFilesPermission,
  requestAllFilesPermission,
} from "../../../modules/linux-runner/src";

interface PermissionsStepProps {
  theme: ThemeColors;
  isLandscape?: boolean;
}

export function PermissionsStep({ theme, isLandscape = false }: PermissionsStepProps) {
  const [batteryIgnored, setBatteryIgnored] = useState<boolean>(true);
  const [storageGranted, setStorageGranted] = useState<boolean>(true);

  const checkAllPermissions = async () => {
    try {
      const bat = isIgnoringBatteryOptimizations();
      setBatteryIgnored(bat);
    } catch (_) {}

    try {
      const stor = hasAllFilesPermission();
      setStorageGranted(stor);
    } catch (_) {}
  };

  useEffect(() => {
    checkAllPermissions();

    // Re-check when returning from Android System Settings
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        checkAllPermissions();
      }
    });

    return () => {
      sub.remove();
    };
  }, []);

  const handleToggleBattery = async () => {
    const requested = await requestIgnoreBatteryOptimizations();
    if (!requested) {
      await openBatteryOptimizationSettings();
    }
    setTimeout(checkAllPermissions, 800);
  };

  const handleToggleStorage = async () => {
    try {
      const requested = await requestAllFilesPermission();
      if (!requested) {
        await openAppDetailsSettings();
      }
    } catch (_) {
      await openAppDetailsSettings();
    }
    setTimeout(checkAllPermissions, 600);
    setTimeout(checkAllPermissions, 1500);
    setTimeout(checkAllPermissions, 3000);
  };

  const handleOpenAppDetails = async () => {
    await openAppDetailsSettings();
    setTimeout(checkAllPermissions, 800);
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, isLandscape && styles.contentLandscape]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerWrap}>
        <Text style={[styles.stepTitle, { color: theme.textPrimary }]}>
          System Permissions
        </Text>
        <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>
          Configure background execution and storage so your code and servers run reliably.
        </Text>
      </View>

      {/* 1. Battery Optimization */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.bgSecondary,
            borderColor: batteryIgnored ? theme.border : theme.accentGold,
          },
        ]}
      >
        <View style={styles.cardHeader}>
          <View
            style={[
              styles.iconWrap,
              { backgroundColor: batteryIgnored ? `${theme.accentGreen}1A` : `${theme.accentGold}1A` },
            ]}
          >
            <Ionicons
              name={batteryIgnored ? "battery-charging" : "battery-dead-outline"}
              size={20}
              color={batteryIgnored ? theme.accentGreen : theme.accentGold}
            />
          </View>
          <View style={styles.cardHeaderText}>
            <View style={styles.titleRow}>
              <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
                Battery Optimization
              </Text>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: batteryIgnored ? `${theme.accentGreen}18` : `${theme.accentGold}18` },
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    { color: batteryIgnored ? theme.accentGreen : theme.accentGold },
                  ]}
                >
                  {batteryIgnored ? "Unrestricted" : "Optimized (Restricted)"}
                </Text>
              </View>
            </View>
            <Text style={[styles.cardDescription, { color: theme.textSecondary }]}>
              {batteryIgnored
                ? "Android will not kill your active dev servers or code-server in the background."
                : "Android will kill background tasks and servers when screen locks. Disable to keep code running."}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.actionButton,
            {
              backgroundColor: batteryIgnored ? theme.bgTertiary : theme.accent,
              borderColor: batteryIgnored ? theme.border : theme.accent,
            },
          ]}
          onPress={handleToggleBattery}
          activeOpacity={0.8}
        >
          <Ionicons
            name={batteryIgnored ? "checkmark-circle" : "flash-outline"}
            size={16}
            color={batteryIgnored ? theme.textPrimary : theme.sendButtonIcon}
          />
          <Text
            style={[
              styles.actionButtonText,
              { color: batteryIgnored ? theme.textPrimary : theme.sendButtonIcon },
            ]}
          >
            {batteryIgnored ? "Manage Battery Settings" : "Disable Battery Optimization (1-Tap)"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 2. All Files Access */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.bgSecondary,
            borderColor: storageGranted ? theme.border : theme.accent,
          },
        ]}
      >
        <View style={styles.cardHeader}>
          <View
            style={[
              styles.iconWrap,
              { backgroundColor: storageGranted ? `${theme.accentGreen}1A` : `${theme.accent}1A` },
            ]}
          >
            <Ionicons
              name={storageGranted ? "folder-open" : "folder-open-outline"}
              size={20}
              color={storageGranted ? theme.accentGreen : theme.accent}
            />
          </View>
          <View style={styles.cardHeaderText}>
            <View style={styles.titleRow}>
              <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
                All Files Access
              </Text>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: storageGranted ? `${theme.accentGreen}18` : `${theme.accent}18` },
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    { color: storageGranted ? theme.accentGreen : theme.accent },
                  ]}
                >
                  {storageGranted ? "Granted" : "Setup Needed"}
                </Text>
              </View>
            </View>
            <Text style={[styles.cardDescription, { color: theme.textSecondary }]}>
              Allows creating, opening, and modifying projects in Documents and external storage.
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.actionButton,
            {
              backgroundColor: storageGranted ? theme.bgTertiary : theme.accent,
              borderColor: storageGranted ? theme.border : theme.accent,
            },
          ]}
          onPress={handleToggleStorage}
          activeOpacity={0.8}
        >
          <Ionicons
            name={storageGranted ? "checkmark-circle" : "shield-checkmark-outline"}
            size={16}
            color={storageGranted ? theme.textPrimary : theme.sendButtonIcon}
          />
          <Text
            style={[
              styles.actionButtonText,
              { color: storageGranted ? theme.textPrimary : theme.sendButtonIcon },
            ]}
          >
            {storageGranted ? "Storage Access Granted" : "Grant All Files Access (1-Tap)"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 3. App Details & Notifications Quick Link */}
      <TouchableOpacity
        style={[
          styles.appInfoRow,
          { backgroundColor: theme.bgTertiary, borderColor: theme.border },
        ]}
        onPress={handleOpenAppDetails}
        activeOpacity={0.75}
      >
        <Ionicons name="settings-outline" size={18} color={theme.textSecondary} />
        <Text style={[styles.appInfoText, { color: theme.textPrimary }]}>
          Open App System Settings (Notifications, Autostart)
        </Text>
        <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 24,
    gap: 12,
  },
  contentLandscape: {
    paddingBottom: 16,
    gap: 8,
  },
  headerWrap: {
    marginBottom: 4,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  stepSubtitle: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  card: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    gap: 12,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeaderText: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  cardDescription: {
    fontSize: 12,
    lineHeight: 17,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10.5,
    fontWeight: "700",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: "700",
  },
  appInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    marginTop: 4,
  },
  appInfoText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: "600",
  },
});
