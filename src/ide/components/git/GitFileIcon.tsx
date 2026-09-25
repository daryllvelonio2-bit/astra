import React, { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { getFileIcon } from "../fileExplorerUtils";
import { subscribeIconTheme } from "../../services/extensions/iconThemeService";

interface GitFileIconProps {
  filename: string;
  size?: number;
}

/**
 * File icon that follows the GLOBAL icon system — the active marketplace
 * icon theme's SVG when one is set (iconThemeService), otherwise the default
 * vector icons (fileExplorerUtils). Same resolver the File Explorer and
 * editor tabs use, so the Git lists stay consistent with the rest of the IDE.
 */
export function GitFileIcon({ filename, size = 16 }: GitFileIconProps) {
  const [, setIconTick] = useState(0);

  useEffect(() => {
    return subscribeIconTheme(() => setIconTick((t) => t + 1));
  }, []);

  const scaled = size === 16 ? null : { transform: [{ scale: size / 16 }] };

  return (
    <View style={[styles.box, scaled && { width: size, height: size }]}>{getFileIcon(filename)}</View>
  );
}

const styles = StyleSheet.create({
  box: { width: 16, height: 16, alignItems: "center", justifyContent: "center" },
});
