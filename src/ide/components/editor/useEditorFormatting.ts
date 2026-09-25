import { useCallback, useRef, useState } from "react";
import { formatDocument, FormatResult } from "../../services/formatService";

interface UseEditorFormattingOptions {
  contentRef: React.MutableRefObject<string>;
  fileName?: string;
  tabSize?: number;
  onChangeContent: (text: string) => void;
}

/**
 * Manual-only document formatting for the native editor.
 * Formatting NEVER runs automatically: an implicit rewrite-on-exit would
 * dirty files in git without the user asking. Only the explicit
 * "Format file" menu action calls format(), and only an installed
 * extension engine (Prettier, Black, Clang-Format) can change text.
 */
export function useEditorFormatting({
  contentRef,
  fileName,
  tabSize = 2,
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

  return {
    isFormatting,
    formatToast,
    format,
  };
}
