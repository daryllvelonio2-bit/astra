import React from "react";
import { StyleProp, ViewStyle } from "react-native";
import { AstraMarkAnimated } from "./AstraMarkAnimated";

interface AstraLogoProps {
  width?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
  /** Defaults to true — pass false for a frozen mark. */
  animated?: boolean;
  /** Optional solid color to override gradients. */
  color?: string;
}

export function AstraLogo({ width = 36, height = 36, style, animated = true, color }: AstraLogoProps) {
  return <AstraMarkAnimated width={width} height={height} style={style} animated={animated} color={color} />;
}
