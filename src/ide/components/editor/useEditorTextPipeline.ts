import { useRef, useEffect, useCallback, useState } from "react";
import { TextInput } from "react-native";
import { useEditorAssists } from "../useEditorAssists";
import { spliceWindowChunk } from "../editorCursorUtils";

interface UseEditorTextPipelineParams {
  content: string;
  visibleCodeChunk: string;
  fileName?: string;
  assists: ReturnType<typeof useEditorAssists>;
  startIndexRef: React.MutableRefObject<number>;
  windowSize: number;
  textInputRef: React.RefObject<TextInput | null>;
  onChangeContent: (text: string) => void;
  setIsEditing: (editing: boolean) => void;
  isWindowed?: boolean;
}

function countNewlinesFast(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) count++;
  }
  return count;
}

export function useEditorTextPipeline({
  content,
  visibleCodeChunk,
  fileName,
  assists,
  startIndexRef,
  windowSize,
  textInputRef,
  onChangeContent,
  setIsEditing,
  isWindowed = false,
}: UseEditorTextPipelineParams) {
  const contentRef = useRef(content);
  const chunkRef = useRef(visibleCodeChunk);
  const lastEmittedContentRef = useRef<string>(content);
  const selectionMirrorRef = useRef(assists.selection);
  const lockSelectionUntilRef = useRef<number>(0);
  const [controlledSelection, setControlledSelection] = useState<
    { start: number; end: number } | undefined
  >(undefined);

  // Synchronize from props only if content changed externally (e.g. file switch, format, disk reload)
  // to avoid overwriting in-flight keystrokes with stale React render snapshots.
  useEffect(() => {
    if (content !== lastEmittedContentRef.current) {
      lastEmittedContentRef.current = content;
      contentRef.current = content;
      chunkRef.current = visibleCodeChunk;
    }
    selectionMirrorRef.current = assists.selection;
  }, [content, visibleCodeChunk, assists.selection]);

  useEffect(() => {
    lastEmittedContentRef.current = content;
    contentRef.current = content;
    chunkRef.current = visibleCodeChunk;
    assists.setSelection({ start: 0, end: 0 });
    setControlledSelection(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileName]);

  const enterEditModeAtOffset = useCallback(
    (charOffset: number) => {
      const targetSel = { start: charOffset, end: charOffset };
      lockSelectionUntilRef.current = Date.now() + 500;
      selectionMirrorRef.current = targetSel;
      assists.setSelectionSync(targetSel);
      setControlledSelection(targetSel);
      setIsEditing(true);
      textInputRef.current?.focus();
    },
    [assists, setIsEditing, textInputRef]
  );

  const handleTextChangeInWindow = useCallback(
    (newChunkText: string) => {
      if (
        !isWindowed ||
        (startIndexRef.current === 0 &&
          (!windowSize || windowSize >= countNewlinesFast(contentRef.current) + 1))
      ) {
        contentRef.current = newChunkText;
        lastEmittedContentRef.current = newChunkText;
        onChangeContent(newChunkText);
        return;
      }
      const updated = spliceWindowChunk(
        contentRef.current,
        newChunkText,
        startIndexRef.current,
        windowSize
      );
      contentRef.current = updated;
      lastEmittedContentRef.current = updated;
      onChangeContent(updated);
    },
    [isWindowed, onChangeContent, startIndexRef, windowSize]
  );

  // Typing pipeline: diff -> auto-close / skip / smart-indent -> content + cursor.
  const handleEditChange = useCallback(
    (newChunkText: string) => {
      if (newChunkText === chunkRef.current) return; // native echo, no-op
      const delta = Math.abs(newChunkText.length - chunkRef.current.length);
      // Fast path for large paste (delta > 200 chars): skip expensive assist diffs
      let chunk: string;
      let cursor: number;
      let isAssistAltered = false;
      if (delta > 200) {
        chunk = newChunkText;
        cursor = newChunkText.length;
      } else {
        const res = assists.assistEdit(chunkRef.current, newChunkText);
        chunk = res.chunk;
        cursor = res.cursor;
        isAssistAltered = res.chunk !== newChunkText;
      }
      chunkRef.current = chunk;
      const sel = { start: cursor, end: cursor };
      selectionMirrorRef.current = sel;
      assists.setSelectionSync(sel);
      // Only command native TextInput to move selection if assists altered the text
      // Otherwise leave selection undefined to prevent IME cursor fights and dropped keystrokes
      setControlledSelection(isAssistAltered ? sel : undefined);
      handleTextChangeInWindow(chunk);
    },
    [assists, handleTextChangeInWindow]
  );

  const handleApplyCompletionChunk = useCallback(
    (newChunkText: string, newCursor: number) => {
      chunkRef.current = newChunkText;
      const sel = { start: newCursor, end: newCursor };
      selectionMirrorRef.current = sel;
      assists.setSelectionSync(sel);
      setControlledSelection(sel);
      handleTextChangeInWindow(newChunkText);
    },
    [assists, handleTextChangeInWindow]
  );

  // Native echoes programmatic cursor sets back as selection events; ignore echoes
  const handleSelectionChange = useCallback(
    (sel: { start: number; end: number }) => {
      if (Date.now() < lockSelectionUntilRef.current) return;
      const cur = selectionMirrorRef.current;
      if (sel.start === cur.start && sel.end === cur.end) return;
      selectionMirrorRef.current = sel;
      assists.setSelection(sel);
      setControlledSelection(undefined);
    },
    [assists]
  );

  return {
    contentRef,
    chunkRef,
    controlledSelection,
    selectionMirrorRef,
    enterEditModeAtOffset,
    handleEditChange,
    handleApplyCompletionChunk,
    handleSelectionChange,
    handleTextChangeInWindow,
  };
}
