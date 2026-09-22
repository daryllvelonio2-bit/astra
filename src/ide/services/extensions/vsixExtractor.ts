import JSZip from "jszip";
import * as FileSystem from "expo-file-system/legacy";
import {
  ExtensionMarketplaceItem,
  InstalledExtension,
  ExtensionTheme,
  ExtensionIconTheme,
  ExtensionLanguageConfig,
} from "./types";
import { writeFileText, makeDir } from "../nativeFs";
import { executeCommand } from "../../../../modules/linux-runner/src";
import { PRootService } from "../prootService";


function getBaseExtensionDir(): string {
  const base = FileSystem.documentDirectory || "/data/user/0/com.janelle.aicoder/files/";
  return `${base.replace(/\/+$/, "")}/extensions`;
}

/**
 * Robust JSONC parser that strips comments and trailing commas without breaking string contents.
 */
export function parseJsonc<T = any>(text: string): T {
  const noComments = text.replace(/("(?:\\.|[^"\\])*")|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, (match, str) => {
    return str || "";
  });
  const noTrailingCommas = noComments.replace(/,(\s*[\]}])/g, "$1");
  return JSON.parse(noTrailingCommas);
}

/**
 * Downloads a .vsix binary file and extracts its declarative assets (themes, snippets, grammars).
 * Streams directly to disk to prevent React Native Hermes heap Out-Of-Memory (OOM) errors.
 */
export async function downloadAndExtractVsix(
  item: ExtensionMarketplaceItem,
  onProgress?: (percent: number, status: string) => void
): Promise<InstalledExtension> {
  // 1. Verify device storage before starting download
  try {
    const freeBytes = await FileSystem.getFreeDiskStorageAsync();
    if (typeof freeBytes === "number" && freeBytes < 40 * 1024 * 1024) {
      throw new Error(
        `Insufficient device storage (${Math.round(freeBytes / 1024 / 1024)}MB free). Please free up disk space to install ${item.displayName}.`
      );
    }
  } catch (err: any) {
    if (err?.message?.includes("Insufficient device storage")) throw err;
  }

  onProgress?.(10, "Downloading extension package...");

  const cleanId = item.id.replace(/[^A-Za-z0-9_.-]/g, "_");
  const tmpDir = `${FileSystem.documentDirectory}tmp`;
  await makeDir(tmpDir);
  const tmpVsix = `${tmpDir}/${cleanId}.vsix`;

  // Download directly to disk via native streaming (0 JS heap memory)
  const downloadRes = await FileSystem.downloadAsync(item.downloadUrl, tmpVsix, {
    headers: { "User-Agent": "Astra-Mobile-IDE/1.0" },
  });

  if (downloadRes.status < 200 || downloadRes.status >= 300) {
    await FileSystem.deleteAsync(tmpVsix, { idempotent: true });
    throw new Error(`Failed to download ${item.displayName}: HTTP ${downloadRes.status}`);
  }

  onProgress?.(45, "Unpacking extension on disk...");

  const baseDir = getBaseExtensionDir();
  const installDir = `${baseDir}/${item.id}`;
  await makeDir(installDir);

  let pkg: any = null;
  let pkgJsonStr = "";
  let usedNativeUnzip = false;
  const binaries: string[] = [];

  // Ensure PRoot runtime is ready for zero-memory disk-based extraction
  try {
    await PRootService.ensureReady();
  } catch (_) {}

  // 2. Try extracting directly on disk via PRoot (unzip, python3 zipfile, or code-server CLI)
  try {
    const stageDir = `/tmp/ext_${cleanId}`;
    await executeCommand(
      `rm -rf "${stageDir}"; mkdir -p "${stageDir}" && (` +
      `unzip -q -o "/tmp/${cleanId}.vsix" -d "${stageDir}" 2>/dev/null || ` +
      `python3 -m zipfile -e "/tmp/${cleanId}.vsix" "${stageDir}" 2>/dev/null || ` +
      `code-server --user-data-dir /root/.local/share/code-server --extensions-dir /root/.local/share/code-server/extensions --install-extension "/tmp/${cleanId}.vsix" --force 2>/dev/null || true)`
    );

    const stagePkg1 = `${tmpDir}/ext_${cleanId}/extension/package.json`;
    const stagePkg2 = `${tmpDir}/ext_${cleanId}/package.json`;
    const info1 = await FileSystem.getInfoAsync(stagePkg1);
    const info2 = await FileSystem.getInfoAsync(stagePkg2);
    const targetPkg = info1.exists ? stagePkg1 : info2.exists ? stagePkg2 : null;

    if (targetPkg) {
      pkgJsonStr = await FileSystem.readAsStringAsync(targetPkg);
      pkg = parseJsonc(pkgJsonStr);
      usedNativeUnzip = true;

      onProgress?.(70, "Syncing assets to native IDE & VS Code...");

      // Discover any executables in extension/bin
      const binCheck = await executeCommand(
        `if [ -d "${stageDir}/extension/bin" ]; then ls -1 "${stageDir}/extension/bin" 2>/dev/null; elif [ -d "${stageDir}/bin" ]; then ls -1 "${stageDir}/bin" 2>/dev/null; fi`
      );
      if (binCheck.stdout) {
        for (const line of binCheck.stdout.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (trimmed && !binaries.includes(trimmed)) binaries.push(trimmed);
        }
      }

      await executeCommand(
        `mkdir -p "/extensions/${item.id}" "/root/.local/share/code-server/extensions/${item.id}"; ` +
        `if [ -d "${stageDir}/extension" ]; then ` +
        `  cp -rf "${stageDir}/extension/"* "/extensions/${item.id}/" 2>/dev/null || true; ` +
        `  cp -rf "${stageDir}/extension/"* "/root/.local/share/code-server/extensions/${item.id}/" 2>/dev/null || true; ` +
        `else ` +
        `  cp -rf "${stageDir}/"* "/extensions/${item.id}/" 2>/dev/null || true; ` +
        `  cp -rf "${stageDir}/"* "/root/.local/share/code-server/extensions/${item.id}/" 2>/dev/null || true; ` +
        `fi; ` +
        `mkdir -p /root/.local/bin /usr/local/bin; ` +
        `for b in "${stageDir}/extension/bin/"* "${stageDir}/bin/"*; do ` +
        `  if [ -f "$b" ]; then ` +
        `    bn=$(basename "$b"); ` +
        `    chmod +x "$b"; ` +
        `    cp -f "$b" "/usr/local/bin/$bn" 2>/dev/null || true; ` +
        `    cp -f "$b" "/root/.local/bin/$bn" 2>/dev/null || true; ` +
        `  fi; ` +
        `done; ` +
        `rm -rf "${stageDir}" "/tmp/${cleanId}.vsix" 2>/dev/null || true`
      );

      // Handle pkg.bin CLI scripts (e.g. linters, formatters, node CLIs)
      if (pkg?.bin) {
        const binEntries = typeof pkg.bin === "string" ? { [item.name]: pkg.bin } : pkg.bin;
        for (const [binName, binRelPath] of Object.entries(binEntries)) {
          if (!binaries.includes(binName)) binaries.push(binName);
          const cleanRel = String(binRelPath).replace(/^\.\//, "");
          await executeCommand(
            `mkdir -p /usr/local/bin /root/.local/bin; ` +
            `printf '#!/bin/sh\\nexec node "/extensions/${item.id}/${cleanRel}" "$@\\n" > "/usr/local/bin/${binName}"; ` +
            `chmod +x "/usr/local/bin/${binName}"; ` +
            `cp -f "/usr/local/bin/${binName}" "/root/.local/bin/${binName}" 2>/dev/null || true`
          );
        }
      }
    }
  } catch {}

  const themes: ExtensionTheme[] = [];
  const iconThemes: ExtensionIconTheme[] = [];
  const snippets: Array<{ language?: string; path: string }> = [];

  if (usedNativeUnzip && pkg) {
    const contributes = pkg.contributes || {};
    const rawThemes: any[] = Array.isArray(contributes.themes) ? contributes.themes : [];
    const rawIconThemes: any[] = Array.isArray(contributes.iconThemes) ? contributes.iconThemes : [];
    const rawSnippets: any[] = Array.isArray(contributes.snippets) ? contributes.snippets : [];

    for (const t of rawThemes) {
      const themePath = (t.path || "").replace(/^\.\//, "");
      themes.push({
        id: `${item.id}.${t.label || t.id || "theme"}`,
        label: t.label || t.id || "Custom Theme",
        uiTheme: t.uiTheme || "vs-dark",
        path: themePath,
      });
    }

    for (const it of rawIconThemes) {
      const itPath = (it.path || "").replace(/^\.\//, "");
      iconThemes.push({
        id: `${item.id}.${it.id || "icons"}`,
        label: it.label || "Icon Theme",
        path: itPath,
      });
    }

    for (const s of rawSnippets) {
      const snipPath = (s.path || "").replace(/^\.\//, "");
      snippets.push({ language: s.language, path: snipPath });
    }
  } else {
    // Fallback: JSZip for smaller packages if native extraction was unable to complete
    const info = await FileSystem.getInfoAsync(tmpVsix);
    const fileSize = info.exists ? (info.size || 0) : 0;
    if (fileSize > 25 * 1024 * 1024) {
      await FileSystem.deleteAsync(tmpVsix, { idempotent: true });
      throw new Error(
        `Unable to extract ${item.displayName}. Please verify device storage and ensure Linux environment is initialized.`
      );
    }

    const b64 = await FileSystem.readAsStringAsync(tmpVsix, { encoding: FileSystem.EncodingType.Base64 });
    await FileSystem.deleteAsync(tmpVsix, { idempotent: true });
    const zip = await JSZip.loadAsync(b64, { base64: true });

    const pkgFile = zip.file("extension/package.json") || zip.file("package.json");
    if (!pkgFile) {
      throw new Error("Invalid VSIX: package.json not found in archive");
    }

    pkgJsonStr = await pkgFile.async("string");
    pkg = JSON.parse(pkgJsonStr);
    const contributes = pkg.contributes || {};
    const rawThemes: any[] = Array.isArray(contributes.themes) ? contributes.themes : [];
    for (const t of rawThemes) {
      const themePath = (t.path || "").replace(/^\.\//, "");
      const zipPath = zip.file(`extension/${themePath}`) ? `extension/${themePath}` : zip.file(themePath) ? themePath : null;
      if (zipPath) {
        const content = await zip.file(zipPath)!.async("string");
        const targetFile = `${installDir}/${themePath}`;
        const parentDir = targetFile.substring(0, targetFile.lastIndexOf("/"));
        await makeDir(parentDir);
        await writeFileText(targetFile, content);
        themes.push({
          id: `${item.id}.${t.label || t.id || "theme"}`,
          label: t.label || t.id || "Custom Theme",
          uiTheme: t.uiTheme || "vs-dark",
          path: themePath,
        });
      }
    }

    const rawSnippets: any[] = Array.isArray(contributes.snippets) ? contributes.snippets : [];
    for (const s of rawSnippets) {
      const snipPath = (s.path || "").replace(/^\.\//, "");
      const zipPath = zip.file(`extension/${snipPath}`) ? `extension/${snipPath}` : zip.file(snipPath) ? snipPath : null;
      if (zipPath) {
        const content = await zip.file(zipPath)!.async("string");
        const targetFile = `${installDir}/${snipPath}`;
        const parentDir = targetFile.substring(0, targetFile.lastIndexOf("/"));
        await makeDir(parentDir);
        await writeFileText(targetFile, content);
        snippets.push({ language: s.language, path: snipPath });
      }
    }

    const rawIconThemes: any[] = Array.isArray(contributes.iconThemes) ? contributes.iconThemes : [];
    for (const it of rawIconThemes) {
      const itPath = (it.path || "").replace(/^\.\//, "");
      const zipPath = zip.file(`extension/${itPath}`) ? `extension/${itPath}` : zip.file(itPath) ? itPath : null;
      if (zipPath) {
        const content = await zip.file(zipPath)!.async("string");
        const targetFile = `${installDir}/${itPath}`;
        const parentDir = targetFile.substring(0, targetFile.lastIndexOf("/"));
        await makeDir(parentDir);
        await writeFileText(targetFile, content);
      }
      for (const [relPath, zipEntry] of Object.entries(zip.files)) {
        if (!zipEntry.dir && (relPath.endsWith(".svg") || relPath.endsWith(".png"))) {
          const cleanRel = relPath.replace(/^extension\//, "");
          const targetFile = `${installDir}/${cleanRel}`;
          const parentDir = targetFile.substring(0, targetFile.lastIndexOf("/"));
          await makeDir(parentDir);
          const svgContent = await zipEntry.async("string");
          await writeFileText(targetFile, svgContent);
        }
      }
      iconThemes.push({
        id: `${item.id}.${it.id || "icons"}`,
        label: it.label || "Icon Theme",
        path: itPath,
      });
    }
  }

  if (pkg?.bin) {
    const binEntries = typeof pkg.bin === "string" ? { [item.name]: pkg.bin } : pkg.bin;
    for (const binName of Object.keys(binEntries)) {
      if (!binaries.includes(binName)) binaries.push(binName);
    }
  }

  // Save extension manifest to disk
  await writeFileText(`${installDir}/package.json`, pkgJsonStr);
  onProgress?.(100, "Installation complete!");

  const rawLanguages: any[] = Array.isArray(pkg?.contributes?.languages) ? pkg.contributes.languages : [];
  const languages: ExtensionLanguageConfig[] = rawLanguages.map((l: any) => ({
    id: l.id,
    extensions: l.extensions,
    aliases: l.aliases,
    filenames: l.filenames,
    configuration: l.configuration,
  }));

  const categories: string[] = Array.isArray(pkg?.categories) ? pkg.categories : [];
  const keywords: string[] = Array.isArray(pkg?.keywords) ? pkg.keywords : [];

  return {
    id: item.id,
    displayName: item.displayName || pkg?.displayName || item.name,
    description: item.description || pkg?.description || "",
    version: item.version || pkg?.version || "1.0.0",
    publisher: item.publisher || item.namespace,
    iconUrl: item.iconUrl,
    enabled: true,
    installedAt: Date.now(),
    installDir,
    themes,
    iconThemes,
    snippets,
    languages,
    binaries,
    categories,
    keywords,
    isAgent: false,
  };
}


/**
 * Reads and parses a JSON/JSONC file from an installed extension directory.
 * Safely resolves nested base themes ("include" or "$include").
 */
export async function readExtensionJson<T = any>(filePath: string): Promise<T | null> {
  try {
    const exists = await FileSystem.getInfoAsync(filePath);
    if (!exists.exists) return null;
    const content = await FileSystem.readAsStringAsync(filePath);
    const data = parseJsonc<T>(content);

    // Resolve base theme inheritance if specified
    if (data && typeof data === "object") {
      const anyData = data as any;
      const incPath = anyData.include || anyData["$include"];
      if (typeof incPath === "string") {
        const cleanInc = incPath.replace(/^\.\//, "");
        const dir = filePath.substring(0, filePath.lastIndexOf("/"));
        const resolvedInc = incPath.startsWith("/") ? incPath : `${dir}/${cleanInc}`;
        const baseData = await readExtensionJson<any>(resolvedInc);
        if (baseData && typeof baseData === "object") {
          return {
            ...baseData,
            ...anyData,
            colors: { ...(baseData.colors || {}), ...(anyData.colors || {}) },
            tokenColors: [
              ...(Array.isArray(baseData.tokenColors) ? baseData.tokenColors : []),
              ...(Array.isArray(anyData.tokenColors) ? anyData.tokenColors : []),
            ],
          } as T;
        }
      }
      // Resolve external tokenColors path if specified as a string
      if (typeof anyData.tokenColors === "string") {
        const cleanTok = anyData.tokenColors.replace(/^\.\//, "");
        const dir = filePath.substring(0, filePath.lastIndexOf("/"));
        const resolvedTok = anyData.tokenColors.startsWith("/") ? anyData.tokenColors : `${dir}/${cleanTok}`;
        const tokData = await readExtensionJson<any>(resolvedTok);
        if (tokData) {
          anyData.tokenColors = Array.isArray(tokData)
            ? tokData
            : (tokData.tokenColors || tokData.settings || []);
        }
      }
    }

    return data;
  } catch {
    return null;
  }
}
