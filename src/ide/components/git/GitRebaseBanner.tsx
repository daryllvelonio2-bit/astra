import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Octicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/themeContext";
import { useOrientation } from "../../../theme/useOrientation";
import { gitChangesListStyles as shared } from "./GitChangesList.styles";
import type { RebaseState } from "../../services/gitRebaseService";

interface GitRebaseBannerProps {
  state: RebaseState;
  busy: boolean;
  onContinue: () => void;
  onSkip: () => void;
  onAbort: () => void;
}

/**
 * Rebase-in-progress banner. Mirrors the merge-conflict banner (same shared
 * styles): resolve each file, then Continue. Renders nothing when idle.
 */
export function GitRebaseBanner({ state, busy, onContinue, onSkip, onAbort }: GitRebaseBannerProps) {
  const { theme } = useTheme();
  const { isLandscape } = useOrientation();
  if (!state.rebasing) return null;
  const n = state.conflicted.length;
  return (
    <View style={[shared.mergeBanner, { backgroundColor: `${theme.accentGold}14`, borderColor: theme.accentGold }]}>
      <Octicons name="git-compare" size={isLandscape ? 13 : 15} color={theme.accentGold} />
      <Text style={[shared.mergeBannerText, { color: theme.textPrimary }]} numberOfLines={2}>
        {n === 0
          ? `Rebasing${state.branch ? ` ${state.branch}` : ""} — ready to continue`
          : `Rebasing${state.branch ? ` ${state.branch}` : ""} — ${n} file${n !== 1 ? "s" : ""} to resolve`}
      </Text>
      <TouchableOpacity
        onPress={onAbort}
        disabled={busy}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="Abort rebase"
      >
        <Text style={[shared.mergeBannerBtn, { color: theme.textMuted }]}>Abort</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onSkip}
        disabled={busy}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="Skip commit"
      >
        <Text style={[shared.mergeBannerBtn, { color: theme.textMuted }]}>Skip</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onContinue}
        disabled={busy || n > 0}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="Continue rebase"
      >
        <Text
          style={[
            shared.mergeBannerBtn,
            shared.mergeBannerBtnPrimary,
            { color: n > 0 ? theme.textMuted : theme.accentGreen },
          ]}
        >
          Continue
        </Text>
      </TouchableOpacity>
    </View>
  );
}
