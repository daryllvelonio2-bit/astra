import { requireNativeModule } from "expo-modules-core";

let LinuxRunnerModule: any = null;
try {
  LinuxRunnerModule = requireNativeModule("LinuxRunner");
} catch (_) {
  LinuxRunnerModule = null;
}

let nodeFs: any = null;
let nodePath: any = null;
try {
  nodeFs = require("fs");
  nodePath = require("path");
} catch (_) {
  nodeFs = null;
  nodePath = null;
}

function cleanPath(raw: string): string {
  let p = (raw || "").trim();
  if (p.startsWith("file://")) {
    p = p.substring(7);
  }
  return p;
}

export interface NativeDirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  lastModified: number;
}

export interface NativeFileInfo {
  exists: boolean;
  isDirectory: boolean;
  size: number;
  path: string;
  lastModified?: number;
}

export function readDirectoryNative(rawPath: string): NativeDirEntry[] {
  if (LinuxRunnerModule?.readDirectory) {
    try {
      return LinuxRunnerModule.readDirectory(rawPath) || [];
    } catch (_) {}
  }
  if (nodeFs && nodePath) {
    try {
      const p = cleanPath(rawPath);
      if (!nodeFs.existsSync(p)) return [];
      const entries = nodeFs.readdirSync(p, { withFileTypes: true });
      return entries
        .map((e: any) => {
          const fullPath = nodePath.join(p, e.name);
          let stat: any = {};
          try {
            stat = nodeFs.statSync(fullPath);
          } catch (_) {}
          return {
            name: e.name,
            path: fullPath,
            isDirectory: e.isDirectory(),
            size: e.isFile() ? stat.size || 0 : 0,
            lastModified: stat.mtimeMs || Date.now(),
          };
        })
        .sort((a: any, b: any) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? 1 : -1;
          return a.name.localeCompare(b.name);
        });
    } catch (_) {}
  }
  return [];
}

export function getFileInfoNative(rawPath: string): NativeFileInfo {
  if (LinuxRunnerModule?.getFileInfo) {
    try {
      return (
        LinuxRunnerModule.getFileInfo(rawPath) || {
          exists: false,
          isDirectory: false,
          size: 0,
          path: rawPath,
        }
      );
    } catch (_) {}
  }
  if (nodeFs) {
    try {
      const p = cleanPath(rawPath);
      const exists = nodeFs.existsSync(p);
      if (!exists) {
        return { exists: false, isDirectory: false, size: 0, path: p };
      }
      const stat = nodeFs.statSync(p);
      return {
        exists: true,
        isDirectory: stat.isDirectory(),
        size: stat.isFile() ? stat.size : 0,
        path: p,
        lastModified: stat.mtimeMs,
      };
    } catch (_) {}
  }
  return { exists: false, isDirectory: false, size: 0, path: rawPath };
}

export function readFileNative(rawPath: string): string {
  if (LinuxRunnerModule?.readFile) {
    try {
      return LinuxRunnerModule.readFile(rawPath) || "";
    } catch (_) {}
  }
  if (nodeFs) {
    try {
      const p = cleanPath(rawPath);
      if (nodeFs.existsSync(p)) {
        return nodeFs.readFileSync(p, "utf8") || "";
      }
    } catch (_) {}
  }
  return "";
}

export function writeFileNative(rawPath: string, content: string): boolean {
  if (LinuxRunnerModule?.writeFile) {
    try {
      return LinuxRunnerModule.writeFile(rawPath, content) || false;
    } catch (_) {}
  }
  if (nodeFs && nodePath) {
    try {
      const p = cleanPath(rawPath);
      const parentDir = nodePath.dirname(p);
      nodeFs.mkdirSync(parentDir, { recursive: true });
      nodeFs.writeFileSync(p, content, "utf8");
      return true;
    } catch (_) {}
  }
  return false;
}

export function makeDirectoryNative(rawPath: string): boolean {
  if (LinuxRunnerModule?.makeDirectory) {
    try {
      return LinuxRunnerModule.makeDirectory(rawPath) || false;
    } catch (_) {}
  }
  if (nodeFs) {
    try {
      const p = cleanPath(rawPath);
      nodeFs.mkdirSync(p, { recursive: true });
      return true;
    } catch (_) {}
  }
  return false;
}

export function deletePathNative(rawPath: string): boolean {
  if (LinuxRunnerModule?.deletePath) {
    try {
      return LinuxRunnerModule.deletePath(rawPath) || false;
    } catch (_) {}
  }
  if (nodeFs) {
    try {
      const p = cleanPath(rawPath);
      nodeFs.rmSync(p, { recursive: true, force: true });
      return true;
    } catch (_) {}
  }
  return false;
}

export function movePathNative(fromRaw: string, toRaw: string): boolean {
  if (LinuxRunnerModule?.movePath) {
    try {
      return LinuxRunnerModule.movePath(fromRaw, toRaw) || false;
    } catch (_) {}
  }
  if (nodeFs && nodePath) {
    try {
      const from = cleanPath(fromRaw);
      const to = cleanPath(toRaw);
      nodeFs.mkdirSync(nodePath.dirname(to), { recursive: true });
      nodeFs.renameSync(from, to);
      return true;
    } catch (_) {}
  }
  return false;
}

export function hasAllFilesPermission(): boolean {
  if (LinuxRunnerModule?.hasAllFilesPermission) {
    try {
      return LinuxRunnerModule.hasAllFilesPermission();
    } catch (_) {
      return true;
    }
  }
  return true;
}

export function requestAllFilesPermission(): boolean {
  if (LinuxRunnerModule?.requestAllFilesPermission) {
    try {
      return LinuxRunnerModule.requestAllFilesPermission();
    } catch (_) {
      return false;
    }
  }
  return false;
}
