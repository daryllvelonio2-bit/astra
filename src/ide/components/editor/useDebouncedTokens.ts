import { useState, useEffect, useRef, useMemo } from "react";
import { tokenizeCode, TokenizedLine } from "../../services/syntaxTokenizer";

/**
 * Tokenization hook for editor view and edit modes.
 *
 * Uses line-level cached tokenization (< 1ms per typing stroke) so that
 * the tokenizedLines never lag behind what the user types.
 * For large pastes, sets isPasting to true so EditorEditRow can fast-path
 * raw text without incurring thousands of React text allocations.
 */

const PASTE_DEBOUNCE_MS = 250;
const PASTE_CHAR_THRESHOLD = 30;

export function useDebouncedTokens(
  visibleCodeChunk: string,
  fileName: string | undefined,
  startLineNumber: number,
  isEditing: boolean
): { tokenizedLines: TokenizedLine[]; isPasting: boolean } {
  // Synchronous memoized tokens (line-level cached, < 1ms)
  const syncTokens = useMemo(() => {
    return tokenizeCode(visibleCodeChunk, fileName, startLineNumber);
  }, [visibleCodeChunk, fileName, startLineNumber]);

  const [isPasting, setIsPasting] = useState(false);
  const prevChunkLenRef = useRef(visibleCodeChunk.length);
  const pasteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isEditing) {
      if (pasteTimerRef.current) {
        clearTimeout(pasteTimerRef.current);
        pasteTimerRef.current = null;
      }
      setIsPasting(false);
      prevChunkLenRef.current = visibleCodeChunk.length;
      return;
    }

    const delta = Math.abs(visibleCodeChunk.length - prevChunkLenRef.current);
    prevChunkLenRef.current = visibleCodeChunk.length;
    const isLargePaste = delta > PASTE_CHAR_THRESHOLD;

    if (isLargePaste) {
      setIsPasting(true);
      if (pasteTimerRef.current) {
        clearTimeout(pasteTimerRef.current);
      }
      pasteTimerRef.current = setTimeout(() => {
        pasteTimerRef.current = null;
        setIsPasting(false);
      }, PASTE_DEBOUNCE_MS);
    }

    return () => {
      if (pasteTimerRef.current) {
        clearTimeout(pasteTimerRef.current);
        pasteTimerRef.current = null;
      }
    };
  }, [visibleCodeChunk, isEditing]);

  return {
    tokenizedLines: syncTokens,
    isPasting: isEditing && isPasting,
  };
}
