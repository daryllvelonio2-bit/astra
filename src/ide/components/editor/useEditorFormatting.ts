import { useState, useCallback, useRef } from "react";
import { formatDocument, FormatResult } from "../../services/formatService";

interface UseEditorFormattingOptions {
  contentRef: React.MutableRefObject<string>;
  fileName?: string;
  tabSize?: number;
  formatOnSave?: boolean;
  onChangeContent: (text: string) => void;
}

/**
 * Hook to manage document formatting in the native editor.
 * Handles on-demand format actions, format-on-save/done triggers,
 * and user-facing status feedback.
 */
export function useEditorFormatting({
  contentRef,
  fileName,
  tabSize = 2,
  formatOnSave = true,
  onChangeContent,
}: UseEditorFormattingOptions) {
  const [isFormatting, setIsFormatting] = useState(false);
  const [formatToast, setFormatToast] = useState<string | null>(null);
  const toastTimerRef = useRef<any>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setFormatToast(msg);
    toastTimerRef.current = setTimeout(() => {
      setFormatToast(null);
    }, 2400);
  }, []);

  const format = useCallback(async (): Promise<FormatResult | null> => {
    const currentCode = contentRef.current;
    if (!currentCode || !currentCode.trim()) return null;

    setIsFormatting(true);
    try {
      const res = await formatDocument(currentCode, fileName, tabSize);
      if (res.changed) {
        contentRef.current = res.formatted;
        onChangeContent(res.formatted);
      }
      showToast(res.message);
      return res;
    } catch (err: any) {
      showToast("Formatting failed");
      return null;
    } finally {
      setIsFormatting(false);
    }
  }, [contentRef, fileName, tabSize, onChangeContent, showToast]);

  const onDoneEditing = useCallback(
    (dismissKeyboard: () => void) => {
      dismissKeyboard();
      if (formatOnSave) {
        format();
      }
    },
    [formatOnSave, format]
  );

  return {
    isFormatting,
    formatToast,
    format,
    onDoneEditing,
  };
}
