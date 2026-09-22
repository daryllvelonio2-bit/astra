import { requireNativeModule, EventEmitter } from 'expo-modules-core';

let VoiceInputModule: any = null;
try {
  VoiceInputModule = requireNativeModule('VoiceInput');
} catch (_) {
  VoiceInputModule = null;
}

const emitter: any = VoiceInputModule
  ? new EventEmitter(VoiceInputModule)
  : ({ addListener: () => ({ remove: () => {} }) } as any);

export type VoiceEventName =
  | 'onVoicePartial'
  | 'onVoiceFinal'
  | 'onVoiceError'
  | 'onVoiceState';

/** True when the native module is compiled into this build. */
export function isVoiceModulePresent(): boolean {
  return VoiceInputModule != null;
}

/** False when the native module is missing or no recognizer exists on-device. */
export async function isVoiceSupported(): Promise<boolean> {
  if (VoiceInputModule?.isSupported) {
    try {
      return await VoiceInputModule.isSupported();
    } catch (_) {
      return false;
    }
  }
  return false;
}

/**
 * Starts one dictation session. Results arrive via events:
 * onVoicePartial {text}, onVoiceFinal {text}, onVoiceError {code},
 * onVoiceState {state: 'listening' | 'idle'}.
 */
export async function startVoiceListening(): Promise<boolean> {
  if (VoiceInputModule?.startListening) {
    try {
      return await VoiceInputModule.startListening();
    } catch (_) {
      return false;
    }
  }
  return false;
}

/** Ends the session; the recognizer delivers final results first. */
export function stopVoiceListening(): void {
  if (VoiceInputModule?.stopListening) {
    try {
      VoiceInputModule.stopListening();
    } catch (e) {
      console.warn('Failed to stop voice listening', e);
    }
  }
}

/** Aborts the session, discarding any pending results. */
export function cancelVoiceListening(): void {
  if (VoiceInputModule?.cancel) {
    try {
      VoiceInputModule.cancel();
    } catch (e) {
      console.warn('Failed to cancel voice listening', e);
    }
  }
}

/**
 * Fallback path for devices with no system SpeechRecognizer: records raw
 * audio to a cache file. Returns the file path, or null on failure.
 */
export async function startVoiceRecording(): Promise<string | null> {
  if (VoiceInputModule?.startRecording) {
    try {
      return await VoiceInputModule.startRecording();
    } catch (_) {
      return null;
    }
  }
  return null;
}

/** Ends the recording; resolves to the audio file path (null if too short). */
export async function stopVoiceRecording(): Promise<string | null> {
  if (VoiceInputModule?.stopRecording) {
    try {
      return await VoiceInputModule.stopRecording();
    } catch (_) {
      return null;
    }
  }
  return null;
}

/** Aborts the recording and deletes the stub file. */
export function cancelVoiceRecording(): void {
  if (VoiceInputModule?.cancelRecording) {
    try {
      VoiceInputModule.cancelRecording();
    } catch (e) {
      console.warn('Failed to cancel voice recording', e);
    }
  }
}

export function addVoiceListener(
  event: VoiceEventName,
  listener: (payload: any) => void
): { remove: () => void } {
  return emitter.addListener(event, listener);
}
