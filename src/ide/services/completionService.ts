import { ExtensionSnippet } from "./extensions/types";
import { getGrammarForExtension } from "./syntaxTokenizer";

export interface CompletionItem {
  label: string;
  kind: "function" | "variable" | "class" | "type" | "keyword" | "module" | "snippet" | "property";
  insertText: string;
  detail?: string;
  isSnippet?: boolean;
}

export interface CompletionResult {
  prefix: string;
  items: CompletionItem[];
}

const BUILTIN_MEMBERS: Record<string, string[]> = {
  System: ["out", "err", "in", "currentTimeMillis()", "exit()", "gc()", "getProperty()", "arraycopy()"],
  out: ["println()", "print()", "printf()", "flush()", "close()"],
  err: ["println()", "print()", "printf()", "flush()", "close()"],
  console: ["log()", "error()", "warn()", "info()", "debug()", "table()", "trace()", "clear()", "time()", "timeEnd()"],
  Math: ["abs()", "max()", "min()", "round()", "floor()", "ceil()", "random()", "sqrt()", "pow()", "PI", "E"],
  math: ["abs()", "max()", "min()", "round()", "floor()", "ceil()", "random()", "sqrt()", "pow()", "PI", "E"],
  JSON: ["parse()", "stringify()"],
  Promise: ["all()", "race()", "resolve()", "reject()", "allSettled()", "any()"],
  document: ["getElementById()", "querySelector()", "querySelectorAll()", "createElement()", "addEventListener()", "body"],
  window: ["location", "history", "localStorage", "sessionStorage", "addEventListener()", "fetch()"],
  os: ["path", "environ", "system()", "getcwd()", "listdir()", "mkdir()", "remove()"],
  sys: ["argv", "exit()", "path", "stdout", "stderr", "stdin", "version"],
  fmt: ["Println()", "Printf()", "Print()", "Sprintf()", "Errorf()", "Scanln()"],
  strings: ["Contains()", "Split()", "Join()", "Replace()", "ToLower()", "ToUpper()", "TrimSpace()"],
  std: ["cout", "cin", "endl", "string", "vector", "map", "make_unique", "make_shared"],
};

const EXTRA_TYPES: Record<string, string[]> = {
  java: ["String", "Integer", "Long", "Double", "Boolean", "Object", "List", "Map", "Set", "ArrayList", "HashMap", "Exception", "Thread", "System", "Math"],
  kt: ["String", "Int", "Long", "Double", "Boolean", "List", "Map", "Set", "ArrayList", "HashMap"],
  py: ["int", "str", "float", "bool", "list", "dict", "set", "tuple", "print", "len", "range", "enumerate", "zip", "open"],
  ts: ["string", "number", "boolean", "any", "unknown", "never", "void", "Promise", "Array", "Record", "Partial", "Required"],
  js: ["console", "document", "window", "Promise", "Array", "Object", "String", "Number", "Boolean", "JSON", "Math", "setTimeout"],
};

/**
 * Harvest local identifier tokens declared or used in the active code buffer.
 */
function harvestLocalSymbols(text: string, currentWord: string, cursorOffset?: number): string[] {
  // Restrict scan to ~4KB window around cursor to avoid freezing on large files
  const scanRadius = 2000;
  const scanText = cursorOffset !== undefined
    ? text.slice(Math.max(0, cursorOffset - scanRadius), cursorOffset + scanRadius)
    : text.length > scanRadius * 2 ? text.slice(0, scanRadius * 2) : text;
  const matches = scanText.match(/[a-zA-Z_$][a-zA-Z0-9_$]{2,}/g) || [];
  const set = new Set<string>();
  const currLower = currentWord.toLowerCase();

  for (const m of matches) {
    if (m === currentWord) continue;
    if (m.length > 32) continue;
    if (m.toLowerCase().startsWith(currLower)) {
      set.add(m);
      if (set.size >= 30) break;
    }
  }

  return Array.from(set);
}

/**
 * Query intelligent completions for the given cursor position.
 * Dynamically provides:
 * 1. Open VSX marketplace extension snippets
 * 2. Member/dot completions (receiver.property and standard libraries)
 * 3. Harvested local identifiers from document
 * 4. Language grammar types
 * 5. Language grammar keywords
 */
export function getCompletions(
  code: string,
  cursorOffset: number,
  fileName?: string,
  extensionSnippets: ExtensionSnippet[] = []
): CompletionResult {
  if (!code || cursorOffset < 0 || cursorOffset > code.length) {
    return { prefix: "", items: [] };
  }

  const beforeCursor = code.slice(0, cursorOffset);

  // 1. Detect member / dot access: e.g. "System.", "console.l", "obj.prop"
  const memberMatch = beforeCursor.match(/(?:([a-zA-Z_$][a-zA-Z0-9_$]*)(?:\.|\->|::))([a-zA-Z0-9_$]*)$/);
  const isMemberAccess = Boolean(memberMatch);
  const receiver = memberMatch ? memberMatch[1] : "";
  const prefix = isMemberAccess
    ? memberMatch[2]
    : (beforeCursor.match(/[a-zA-Z0-9_$]+$/)?.[0] || "");

  // Require at least 1 character typed if not member access
  if (!isMemberAccess && (!prefix || prefix.length < 1)) {
    return { prefix: "", items: [] };
  }

  const pLower = prefix.toLowerCase();
  const candidates: Array<{ item: CompletionItem; score: number }> = [];
  const seenLabels = new Set<string>();

  if (isMemberAccess) {
    // A. Well-known standard library receiver members (e.g. System.out, console.log)
    const known = BUILTIN_MEMBERS[receiver] || [];
    for (const mem of known) {
      if (!pLower || mem.toLowerCase().startsWith(pLower)) {
        if (seenLabels.has(mem)) continue;
        seenLabels.add(mem);
        const score = 100 + (mem.startsWith(prefix) ? 10 : 0);
        candidates.push({
          item: {
            label: mem,
            kind: mem.endsWith("()") ? "function" : "variable",
            insertText: mem,
            detail: `${receiver} member`,
          },
          score,
        });
      }
    }

    // B. Harvest member properties matching receiver.member from active code buffer
    try {
      const escRec = receiver.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const memRegex = new RegExp(`\\b${escRec}\\.([a-zA-Z0-9_$]+)`, "g");
      let m: RegExpExecArray | null;
      while ((m = memRegex.exec(code)) !== null) {
        const prop = m[1];
        if (prop === prefix || seenLabels.has(prop)) continue;
        if (!pLower || prop.toLowerCase().startsWith(pLower)) {
          seenLabels.add(prop);
          candidates.push({
            item: {
              label: prop,
              kind: "property",
              insertText: prop,
              detail: `${receiver} property`,
            },
            score: 80,
          });
          if (candidates.length >= 20) break;
        }
      }
    } catch (_) {}
  } else {
    // Normal word completion:
    // 1. Real extension snippets from installed Open VSX extensions (highest priority)
    for (const snip of extensionSnippets) {
      const sLower = snip.prefix.toLowerCase();
      if (sLower.startsWith(pLower)) {
        if (seenLabels.has(snip.prefix)) continue;
        seenLabels.add(snip.prefix);
        const rawBody = Array.isArray(snip.body) ? snip.body.join("\n") : snip.body;
        const cleanBody = rawBody.replace(/\$\{\d+:([^}]+)\}/g, "$1").replace(/\$\d+/g, "");
        const score = (snip.prefix.startsWith(prefix) ? 120 : 90) + (snip.prefix.length === prefix.length ? 50 : 0);
        candidates.push({
          item: {
            label: snip.prefix,
            kind: "snippet",
            insertText: cleanBody,
            detail: snip.description || "Snippet",
            isSnippet: true,
          },
          score,
        });
      }
    }

    // 2. Local harvested symbols from buffer
    const localSymbols = harvestLocalSymbols(code, prefix, cursorOffset);
    for (const sym of localSymbols) {
      if (seenLabels.has(sym)) continue;
      seenLabels.add(sym);
      const score = sym.startsWith(prefix) ? 60 : 40;
      candidates.push({
        item: {
          label: sym,
          kind: "variable",
          insertText: sym,
          detail: "local",
        },
        score,
      });
    }

    // 3. Dynamic Grammar Types & Built-in Types
    const ext = (fileName?.split(".").pop() || "").toLowerCase();
    const grammar = getGrammarForExtension(fileName);
    const typeCandidates = new Set<string>([
      ...(grammar?.types ? Array.from(grammar.types) : []),
      ...(EXTRA_TYPES[ext] || []),
    ]);

    for (const typ of typeCandidates) {
      const tLower = typ.toLowerCase();
      if (tLower.startsWith(pLower)) {
        if (seenLabels.has(typ)) continue;
        seenLabels.add(typ);
        const score = (typ.startsWith(prefix) ? 50 : 35);
        candidates.push({
          item: {
            label: typ,
            kind: "type",
            insertText: typ,
            detail: "type",
          },
          score,
        });
      }
    }

    // 4. Dynamic Language Keywords from Grammar
    const kwCandidates = grammar?.keywords ? Array.from(grammar.keywords) : [];
    for (const kw of kwCandidates) {
      const kLower = kw.toLowerCase();
      if (kLower.startsWith(pLower)) {
        if (seenLabels.has(kw)) continue;
        seenLabels.add(kw);
        const score = (kw.startsWith(prefix) ? 30 : 20);
        candidates.push({
          item: {
            label: kw,
            kind: "keyword",
            insertText: kw,
            detail: "keyword",
          },
          score,
        });
      }
    }
  }

  // Sort by score descending, then by length ascending
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.item.label.length - b.item.label.length;
  });

  return {
    prefix,
    items: candidates.slice(0, 15).map((c) => c.item),
  };
}
