import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemeColors } from "../../theme/themeContext";

interface GuideStepProps {
  theme: ThemeColors;
  isLandscape?: boolean;
}

/**
 * Final setup step: what the app actually does, part by part.
 *
 * Every line here describes something the app really has — the four bottom
 * tabs are editor/terminal/browser/git, Run shells out to node/python3/tsc in
 * the guest, Settings has exactly six tabs while Support is a GCash donation.
 * Keep it that way: a guide that promises a feature the build does not have is
 * worse than no guide.
 */
const SECTIONS: { icon: any; title: string; lines: string[] }[] = [
  {
    icon: "folder-open-outline",
    title: "Start a project",
    lines: [
      "New — an empty folder to begin from scratch.",
      "Clone — paste a repo URL, or switch to My GitHub repos and pick one (private repos included).",
      "Open — work on a folder that is already on this device.",
    ],
  },
  {
    icon: "code-slash-outline",
    title: "Editor",
    lines: [
      "File tree on the left, editor tabs on top. Edits save automatically.",
      "Search across the whole project, and watch the Problems panel to catch errors.",
    ],
  },
  {
    icon: "terminal-outline",
    title: "Terminal",
    lines: [
      "A real Debian Linux lives inside the app — run commands and install packages here.",
      "The tab shows a count while commands are still running.",
    ],
  },
  {
    icon: "globe-outline",
    title: "Browser",
    lines: [
      "Preview a web page or a local dev server without leaving the app.",
    ],
  },
  {
    icon: "git-branch-outline",
    title: "Git",
    lines: [
      "Sign in with GitHub once: the app shows an 8-character code, you approve it on github.com, and you are in.",
      "Then commit, push and pull straight from the app — including private repos.",
      "Skip the sign-in and this tab stays hidden until you sign in.",
    ],
  },
  {
    icon: "play-circle-outline",
    title: "Run your code",
    lines: [
      "Open a .js, .py or .ts file and run it — Node, Python and TypeScript all execute inside the app.",
    ],
  },
  {
    icon: "cube-outline",
    title: "The Linux toolchain",
    lines: [
      "Git and clones need the Linux toolchain (git plus TLS certificates).",
      "Install it from Settings → Linux; that screen also adds optional language packages.",
    ],
  },
  {
    icon: "options-outline",
    title: "Settings",
    lines: [
      "General — theme, which bottom tabs are visible, keyboard and mouse mode, and re-running this setup.",
      "Editor — editing preferences.  Keys — keyboard shortcuts.",
      "GitHub — sign in to see your profile and repositories here, and sign out.",
      "Support — an optional GCash donation. It changes nothing inside the app.",
    ],
  },
];

export function GuideStep({ theme, isLandscape = false }: GuideStepProps) {
  return (
    <View style={styles.container}>
      <View style={styles.headerWrap}>
        <Text style={[styles.stepTitle, { color: theme.textPrimary }]}>How to use Astra</Text>
        <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>
          A quick tour of every part. You can re-read this any time — it is the last step of
          the setup, and Settings → General can run the setup again.
        </Text>
      </View>

      <View style={styles.list}>
        {SECTIONS.map((section) => (
          <View
            key={section.title}
            style={[styles.card, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}
          >
            <View style={styles.cardHead}>
              <View style={[styles.iconBox, { backgroundColor: `${theme.accent}1F` }]}>
                <Ionicons name={section.icon} size={15} color={theme.accent} />
              </View>
              <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>{section.title}</Text>
            </View>
            {section.lines.map((line, i) => (
              <View key={i} style={styles.lineRow}>
                <Text style={[styles.bullet, { color: theme.accent }]}>•</Text>
                <Text style={[styles.lineText, { color: theme.textSecondary }]}>{line}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      <View style={[styles.footerNote, { borderColor: theme.border }]}>
        <Ionicons name="information-circle-outline" size={14} color={theme.textMuted} />
        <Text style={[styles.footerText, { color: theme.textMuted }]}>
          Tap Get Started and the workspace opens. Nothing here is permanent — every choice can be
          changed later in Settings.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  headerWrap: {
    gap: 4,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  stepSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  list: {
    gap: 8,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 11,
    gap: 5,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  lineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingLeft: 2,
  },
  bullet: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  lineText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 16,
  },
  footerNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    borderTopWidth: 1,
    paddingTop: 10,
  },
  footerText: {
    flex: 1,
    fontSize: 10.5,
    lineHeight: 14,
  },
});
