/**
 * Extensions that must never be loaded into the text editor.
 *
 * Imported images/archives/binaries would be read as UTF-8 and, on the first
 * keystroke, autosaved back as text — destroying the original file. Anything
 * listed here is blocked at open time with a clear message instead.
 */

export const BINARY_EXTENSIONS = new Set([
  // images
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "tif", "tiff", "heic", "heif", "avif",
  // audio / video
  "mp3", "wav", "ogg", "oga", "m4a", "aac", "flac", "opus", "mp4", "m4v", "mov", "avi",
  "mkv", "webm", "3gp", "wmv", "flv",
  // archives / packages
  "zip", "rar", "7z", "tar", "gz", "bz2", "xz", "jar", "apk", "aab", "ipa", "deb", "rpm",
  "vsix", "whl", "iso", "img", "dmg",
  // documents
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "epub", "mobi",
  // binaries / executables / databases
  "so", "dll", "dylib", "exe", "bin", "class", "o", "a", "pyc", "pyo", "wasm", "dex",
  "db", "sqlite", "sqlite3", "mdb", "ttf", "otf", "woff", "woff2", "eot", "icns",
]);

/** True when the file cannot survive a UTF-8 text round-trip. */
export function isBinaryFileName(fileName: string): boolean {
  const name = (fileName || "").trim().toLowerCase();
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return false;
  return BINARY_EXTENSIONS.has(name.slice(dot + 1));
}
