import React from "react";
import { View, StyleSheet } from "react-native";
import { GitHubNavigation, ProfileTab } from "./useGitHubNavigation";
import { GitHubProfileBody } from "./GitHubProfileBody";

/**
 * Profile of any user or organization — the "not just mine" path. The surface
 * itself lives in GitHubProfileBody, shared with Home so the two can no longer
 * drift (which is exactly how the contribution graph ended up built twice).
 * This route is only the frame; the calendar stays on Home. `initialTab` lets
 * the Followers / Following / Activity routes open the same body on their tab.
 */

export function GitHubProfileView({
  login,
  nav,
  onCloneRepo,
  initialTab,
}: {
  login: string;
  nav: GitHubNavigation;
  onCloneRepo: (fullName: string) => void;
  initialTab?: ProfileTab;
}) {
  return (
    <View style={styles.wrap}>
      <GitHubProfileBody
        login={login}
        nav={nav}
        onCloneRepo={onCloneRepo}
        reposMode="owner"
        initialTab={initialTab}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
});