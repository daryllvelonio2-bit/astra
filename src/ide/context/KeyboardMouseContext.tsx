import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { Keyboard, Platform } from "react-native";
import {
  loadKeyboardMouseMode,
  saveKeyboardMouseMode,
  subscribeConfigChanges,
} from "../services/configService";

export interface KeyboardMouseContextValue {
  keyboardMouseMode: boolean;
  setKeyboardMouseMode: (enabled: boolean) => Promise<void>;
}

const KeyboardMouseContext = createContext<KeyboardMouseContextValue>({
  keyboardMouseMode: false,
  setKeyboardMouseMode: async () => {},
});

export function KeyboardMouseProvider({ children }: { children: React.ReactNode }) {
  const [keyboardMouseMode, setLocalMode] = useState(false);
  const modeRef = useRef(false);
  modeRef.current = keyboardMouseMode;

  useEffect(() => {
    let mounted = true;
    loadKeyboardMouseMode()
      .then((val) => {
        if (mounted) {
          modeRef.current = val;
          setLocalMode(val);
        }
      })
      .catch(() => {});

    const unsub = subscribeConfigChanges((cfg) => {
      if (cfg.keyboardMouseMode !== undefined && mounted) {
        modeRef.current = !!cfg.keyboardMouseMode;
        setLocalMode(!!cfg.keyboardMouseMode);
      }
    });

    // Proactively suppress virtual keyboard if it ever shows while mode is active
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const subShow = Keyboard.addListener(showEvent, () => {
      if (modeRef.current) {
        Keyboard.dismiss();
      }
    });

    return () => {
      mounted = false;
      unsub();
      subShow.remove();
    };
  }, []);

  const handleSetMode = useCallback(async (enabled: boolean) => {
    modeRef.current = enabled;
    setLocalMode(enabled);
    await saveKeyboardMouseMode(enabled);
  }, []);

  return (
    <KeyboardMouseContext.Provider
      value={{
        keyboardMouseMode,
        setKeyboardMouseMode: handleSetMode,
      }}
    >
      {children}
    </KeyboardMouseContext.Provider>
  );
}

export function useKeyboardMouseMode(): KeyboardMouseContextValue {
  return useContext(KeyboardMouseContext);
}
