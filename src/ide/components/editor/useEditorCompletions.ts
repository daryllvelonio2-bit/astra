import { useState, useMemo, useCallback, useEffect } from "react";
import { getCompletions, CompletionItem } from "../../services/completionService";
import { getInstalledSnippets, subscribeExtensionRegistry } from "../../services/extensions/extensionRegistry";
import { ExtensionSnippet } from "../../services/extensions/types";

interface UseEditorCompletionsProps {
  visibleChunk: string;
  cursorOffset: number;
  fileName?: string;
  enabled: boolean;
  onApplyChunk: (newChunk: string, newCursor: number) => void;
}

export function useEditorCompletions({
  visibleChunk,
  cursorOffset,
  fileName,
  enabled,
  onApplyChunk,
}: UseEditorCompletionsProps) {

  const [dismissedPrefix, setDismissedPrefix] = useState<string>("");
  const [extensionSnippets, setExtensionSnippets] = useState<ExtensionSnippet[]>([]);

  useEffect(() => {
    let active = true;
    const fileExt = fileName?.split(".").pop();
    const refresh = async () => {
      const snips = await getInstalledSnippets(fileExt);
      if (active) setExtensionSnippets(snips);
    };
    refresh();
    const unsub = subscribeExtensionRegistry(() => {
      refresh();
    });
    return () => {
      active = false;
      unsub();
    };
  }, [fileName]);

  const completionResult = useMemo(() => {
    if (!enabled || cursorOffset < 0 || cursorOffset > visibleChunk.length) {
      return { prefix: "", items: [] };
    }
    const res = getCompletions(visibleChunk, cursorOffset, fileName, extensionSnippets);
    if (res.prefix === dismissedPrefix) {
      return { prefix: res.prefix, items: [] };
    }
    return res;
  }, [visibleChunk, cursorOffset, fileName, enabled, extensionSnippets, dismissedPrefix]);

  const applyCompletion = useCallback(
    (item: CompletionItem) => {
      const prefixLen = completionResult.prefix.length;
      const beforePrefix = visibleChunk.slice(0, cursorOffset - prefixLen);
      const afterCursor = visibleChunk.slice(cursorOffset);

      const updatedChunk = beforePrefix + item.insertText + afterCursor;
      const newCursor = beforePrefix.length + item.insertText.length;

      onApplyChunk(updatedChunk, newCursor);
      setDismissedPrefix("");
    },
    [completionResult.prefix, cursorOffset, visibleChunk, onApplyChunk]
  );

  const clearCompletions = useCallback(() => {
    setDismissedPrefix(completionResult.prefix);
  }, [completionResult.prefix]);

  return {
    items: completionResult.items,
    prefix: completionResult.prefix,
    applyCompletion,
    clearCompletions,
  };
}
