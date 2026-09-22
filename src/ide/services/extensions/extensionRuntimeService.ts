import { executeCommand } from "../../../../modules/linux-runner/src";
import { ExtensionMarketplaceItem, InstalledExtension } from "./types";

export interface RuntimeInfo {
  id: string;
  name: string;
  binary: string;
  apt: string[];
  envVars?: Record<string, string>;
  profileScript?: string;
  matchPatterns: string[];
}

export const KNOWN_RUNTIMES: RuntimeInfo[] = [
  {
    id: "java",
    name: "Java 17 (OpenJDK)",
    binary: "java",
    apt: ["openjdk-17-jdk"],
    envVars: {
      JAVA_HOME: "/usr/lib/jvm/default-java",
      PATH: "/usr/lib/jvm/default-java/bin:/usr/local/bin:/usr/bin:/bin",
    },
    profileScript:
      'export JAVA_HOME=$(dirname $(dirname $(readlink -f $(command -v java))))\nexport PATH="$JAVA_HOME/bin:$PATH"\n',
    matchPatterns: ["java", "jdk", "jvm", "vscjava", "redhat.java"],
  },
  {
    id: "go",
    name: "Go Toolchain",
    binary: "go",
    apt: ["golang-go"],
    envVars: {
      GOPATH: "/root/go",
      PATH: "/root/go/bin:/usr/local/bin:/usr/bin:/bin",
    },
    profileScript:
      'export GOPATH=/root/go\nexport PATH="$GOPATH/bin:$PATH"\n',
    matchPatterns: ["golang", "go-lang", "golang.go"],
  },
  {
    id: "rust",
    name: "Rust & Cargo",
    binary: "rustc",
    apt: ["rustc", "cargo"],
    envVars: {
      PATH: "/root/.cargo/bin:/usr/local/bin:/usr/bin:/bin",
    },
    profileScript:
      'export PATH="/root/.cargo/bin:$PATH"\n',
    matchPatterns: ["rust", "cargo", "rust-analyzer"],
  },
  {
    id: "cpp",
    name: "C/C++ Toolchain (GCC/G++)",
    binary: "gcc",
    apt: ["build-essential", "gcc", "g++"],
    matchPatterns: ["cpp", "c_cpp", "clang", "gcc", "g++", "cmake"],
  },
  {
    id: "python",
    name: "Python 3 & Pip",
    binary: "python3",
    apt: ["python3", "python3-pip"],
    matchPatterns: ["python", "pylance", "pyright", "black-formatter"],
  },
  {
    id: "php",
    name: "PHP Runtime",
    binary: "php",
    apt: ["php", "php-curl", "php-mbstring"],
    matchPatterns: ["php", "intelephense", "laravel"],
  },
  {
    id: "ruby",
    name: "Ruby Runtime",
    binary: "ruby",
    apt: ["ruby"],
    matchPatterns: ["ruby", "solargraph"],
  },
  {
    id: "lua",
    name: "Lua 5.4",
    binary: "lua5.4",
    apt: ["lua5.4"],
    matchPatterns: ["lua"],
  },
];

/**
 * Checks if a specific binary is available in the Linux PATH.
 */
export async function isRuntimeBinaryInstalled(bin: string): Promise<boolean> {
  try {
    const res = await executeCommand(`command -v ${bin}`);
    return res.exitCode === 0 && Boolean(res.stdout.trim());
  } catch {
    return false;
  }
}

/**
 * Finds a runtime definition matching a binary name (e.g. "java" -> OpenJDK 17).
 */
export function resolveRuntimeForBinary(bin: string): RuntimeInfo | null {
  const clean = bin.toLowerCase().trim();
  for (const r of KNOWN_RUNTIMES) {
    if (r.binary === clean || r.id === clean) return r;
    if (clean === "javac" && r.id === "java") return r;
    if (clean === "cargo" && r.id === "rust") return r;
    if (clean === "g++" && r.id === "cpp") return r;
  }
  return null;
}

/**
 * Checks if an extension marketplace item is a language extension requiring a Debian runtime.
 */
export function resolveRuntimeForExtension(item: ExtensionMarketplaceItem): RuntimeInfo | null {
  const searchSpace = [
    item.id,
    item.name,
    item.displayName,
    item.description || "",
    ...(item.categories || []),
  ].join(" ").toLowerCase();

  for (const r of KNOWN_RUNTIMES) {
    for (const pattern of r.matchPatterns) {
      if (searchSpace.includes(pattern)) {
        return r;
      }
    }
  }

  return null;
}

/**
 * Installs a Debian package toolchain globally and configures persistent environment profiles.
 */
export async function installGlobalRuntime(
  runtime: RuntimeInfo,
  onProgress?: (status: string) => void
): Promise<boolean> {
  onProgress?.(`Updating package index for ${runtime.name}...`);
  try {
    const aptArgs = runtime.apt.join(" ");
    const installCmd = `apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ${aptArgs}`;
    const res = await executeCommand(installCmd);
    if (res.exitCode !== 0) {
      return false;
    }

    // Configure persistent profile script in /etc/profile.d/ and /root/.bashrc
    if (runtime.profileScript) {
      const scriptContent = runtime.profileScript.replace(/'/g, "'\\''");
      await executeCommand(
        `mkdir -p /etc/profile.d; ` +
        `printf '%s' '${scriptContent}' > /etc/profile.d/${runtime.id}.sh; ` +
        `chmod +x /etc/profile.d/${runtime.id}.sh; ` +
        `if ! grep -q "${runtime.id}.sh" /root/.bashrc 2>/dev/null; then ` +
        `  echo '[ -f /etc/profile.d/${runtime.id}.sh ] && . /etc/profile.d/${runtime.id}.sh' >> /root/.bashrc; ` +
        `fi`
      );
    }

    // Verify binary is now executable
    const verified = await isRuntimeBinaryInstalled(runtime.binary);
    return verified;
  } catch {
    return false;
  }
}

/**
 * Generates an automated shell script that provisions the missing runtime in the terminal
 * and immediately executes the user's code once installation completes.
 */
export function buildAutoInstallRunScript(
  commandToRun: string,
  runtime: RuntimeInfo,
  displayName: string
): string {
  const aptList = runtime.apt.join(" ");
  const envExport = runtime.profileScript
    ? runtime.profileScript.trim().split("\n").join("; ")
    : "";

  return (
    `printf "\\033[1;36m━━━ \\033[1;33m⚡ Setup:\\033[0m \\033[1m${runtime.name}\\033[0m \\033[2m(${aptList})\\033[0m \\033[1;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m\\n";\n` +
    `printf "\\033[33m⚡ '${runtime.binary}' not found in Linux environment.\\033[0m\\n";\n` +
    `printf "\\033[36m⚡ Installing ${runtime.name} (${aptList}) globally via apt...\\033[0m\\n\\n";\n` +
    `apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ${aptList} && (\n` +
    `  ${envExport ? `${envExport}; ` : ""}\n` +
    `  printf "\\n\\033[1;32m✔ ${runtime.name} installed successfully!\\033[0m\\n";\n` +
    `  ${commandToRun}\n` +
    `) || printf "\\n\\033[1;31m✖ Failed to install ${runtime.name}. Please check internet connection or storage.\\033[0m\\n"\n`
  );
}

/**
 * Checks all currently installed marketplace extensions and provisions any missing
 * system toolchains (e.g. if Java was installed earlier).
 */
export async function checkAndInstallMissingRuntimesForInstalledExtensions(
  installedExtensions?: InstalledExtension[],
  onLog?: (msg: string) => void
): Promise<void> {
  try {
    if (!installedExtensions || !installedExtensions.length) return;
    for (const ext of installedExtensions) {
      if (!ext.enabled) continue;
      const rt = resolveRuntimeForExtension({
        id: ext.id,
        name: ext.id.split(".").pop() || ext.id,
        namespace: ext.publisher,
        version: ext.version,
        displayName: ext.displayName,
        description: ext.description,
        publisher: ext.publisher,
        downloadUrl: "",
        categories: ext.categories,
      });

      if (rt) {
        const installed = await isRuntimeBinaryInstalled(rt.binary);
        if (!installed) {
          onLog?.(`Provisioning missing ${rt.name} for extension ${ext.displayName}...`);
          await installGlobalRuntime(rt);
        }
      }
    }
  } catch {}
}
