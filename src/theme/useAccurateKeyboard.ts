import { useState, useEffect, useRef, useMemo } from "react";
import { Keyboard, Platform, KeyboardEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Returns pixel-accurate keyboard height and effective bottom offset.
 *
 * On Android, React Native's ReactRootView calculates keyboardDidShow height as:
 *   height = imeInsets.bottom - barInsets.bottom
 * which explicitly subtracts system navigation insets (3-button navigation, ~48dp).
 * Applying only e.endCoordinates.height leaves input views short by the navigation bar height,
 * causing them to stay partially obscured by the soft keyboard.
 *
 * This hook computes:
 * - rawKeyboardHeight: Live reported keyboard height from the OS
 * - isKeyboardVisible: Boolean indicating if the keyboard is active
 * - keyboardOffset: Accurate pixel offset to clear both the keyboard and system bars
 */
export function useAccurateKeyboard(extraPadding = 0) {
  const insets = useSafeAreaInsets();
  const [rawKeyboardHeight, setRawKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const insetsRef = useRef(insets);
  insetsRef.current = insets;

  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const handleShow = (e: KeyboardEvent) => {
      const h = e?.endCoordinates?.height ?? 0;
      setRawKeyboardHeight(h);
      setIsKeyboardVisible(h > 0);
    };

    const handleHide = () => {
      setRawKeyboardHeight(0);
      setIsKeyboardVisible(false);
    };

    const showSub = Keyboard.addListener(showEvt, handleShow);
    const frameSub = Keyboard.addListener("keyboardDidChangeFrame", handleShow);
    const hideSub = Keyboard.addListener(hideEvt, handleHide);

    return () => {
      showSub.remove();
      frameSub.remove();
      hideSub.remove();
    };
  }, []);

  const navBarOffset = Platform.OS === "android" ? Math.max(insets.bottom, 0) : 0;
  const keyboardOffset = isKeyboardVisible && rawKeyboardHeight > 0
    ? rawKeyboardHeight + navBarOffset + extraPadding
    : Math.max(insets.bottom, 0);

  return useMemo(
    () => ({ rawKeyboardHeight, isKeyboardVisible, keyboardOffset }),
    [rawKeyboardHeight, isKeyboardVisible, keyboardOffset]
  );
}

