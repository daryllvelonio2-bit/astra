import React from "react";
import { View, StyleSheet } from "react-native";
import { GitHubNavigation } from "./useGitHubNavigation";
import { GitHubProfileBody } from "./GitHubProfileBody";

/**
 * Profile of any user or organization — the "not just mine" path. The surface
 * itself lives in GitHubProfileBody, shared with Home so the two can no longer
 * drift (which is exactly how the contribution graph ended up built twice).
 * This route is only the frame; the calendar stays on Home.
 */

export function GitHubProfileView({
  login,
  nav,
  onCloneRepo,
}: {
  login: string;
  nav: GitHubNavigation;
  onCloneRepo: (fullName: string) => void;
}) {
  return (
    <View style={styles.wrap}>
      <GitHubProfileBody login={login} nav={nav} onCloneRepo={onCloneRepo} reposMode="owner" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
});