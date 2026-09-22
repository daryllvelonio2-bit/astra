import type { TokenType } from "../syntaxTokenizer";

/**
 * Monaco headless mappings: file ext -> Monaco language id, and Monarch
 * token scope -> native TokenType palette. Rendering stays native; the
 * hidden engine only produces offset+scope pairs.
 */

export type MonacoLangId =
  | "typescript"
  | "javascript"
  | "python"
  | "html"
  | "css"
  | "json"
  | "shell"
  | "rust"
  | "go"
  | "cpp"
  | "java"
  | "kotlin"
  | "markdown"
  | "yaml"
  | "sql"
  | "plaintext";

export function monacoLangForFile(fileName?: string): MonacoLangId {
  const ext = fileName ? (fileName.split(".").pop() || "").toLowerCase() : "";
  switch (ext) {
    case "ts":
    case "mts":
    case "cts":
    case "tsx":
      return "typescript";
    case "js":
    case "mjs":
    case "cjs":
    case "jsx":
      return "javascript";
    case "py":
    case "pyw":
      return "python";
    case "html":
    case "htm":
      return "html";
    case "css":
      return "css";
    case "json":
    case "jsonc":
      return "json";
    case "sh":
    case "bash":
      return "shell";
    case "rs":
      return "rust";
    case "go":
      return "go";
    case "c":
    case "h":
    case "cpp":
    case "hpp":
    case "cc":
    case "cxx":
      return "cpp";
    case "java":
      return "java";
    case "kt":
    case "kts":
      return "kotlin";
    case "md":
    case "markdown":
      return "markdown";
    case "yaml":
    case "yml":
      return "yaml";
    case "sql":
      return "sql";
    default:
      return "plaintext";
  }
}

const RULES: { match: string; type: TokenType }[] = [
  { match: "comment", type: "comment" },
  { match: "string", type: "string" },
  { match: "keyword", type: "keyword" },
  { match: "number", type: "number" },
  { match: "function", type: "function" },
  { match: "type", type: "jsx_tag" },
  { match: "class", type: "jsx_tag" },
  { match: "tag", type: "jsx_tag" },
  { match: "attribute", type: "property" },
  { match: "property", type: "property" },
  { match: "key", type: "property" },
  { match: "delimiter", type: "operator" },
  { match: "bracket", type: "operator" },
  { match: "operator", type: "operator" },
];

export function monacoScopeToTokenType(scope: string): TokenType {
  const s = (scope || "").toLowerCase();
  for (const rule of RULES) {
    if (s.includes(rule.match)) return rule.type;
  }
  return "plain";
}
