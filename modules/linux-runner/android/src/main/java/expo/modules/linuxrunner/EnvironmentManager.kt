package expo.modules.linuxrunner

import android.content.Context
import android.os.Build
import android.util.Log
import org.apache.commons.compress.archivers.tar.TarArchiveEntry
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.util.zip.GZIPInputStream

object EnvironmentManager {
    private const val TAG = "EnvironmentManager"

    fun getProotPath(context: Context): String {
        val nativeLibProot = File(context.applicationInfo.nativeLibraryDir, "libproot.so")
        if (nativeLibProot.exists()) {
            Log.i(TAG, "Using native library PRoot at: ${nativeLibProot.absolutePath}")
            return nativeLibProot.absolutePath
        }
        val fileProot = File(context.filesDir, "proot")
        Log.w(TAG, "Native libproot.so not in ${context.applicationInfo.nativeLibraryDir}, falling back to: ${fileProot.absolutePath}")
        return fileProot.absolutePath
    }

    fun isEnvironmentReady(context: Context): Boolean {
        val filesDir = context.filesDir
        val debianDir = File(filesDir, "debian")
        val bash = File(debianDir, "bin/bash")
        val sh = File(debianDir, "bin/sh")
        val aptGet = File(debianDir, "usr/bin/apt-get")
        val debianVersion = File(debianDir, "etc/debian_version")
        val nativeLib = File(context.applicationInfo.nativeLibraryDir, "libproot.so")
        val isDebianValid = bash.exists() && sh.exists() && aptGet.exists() && debianVersion.exists()
        return isDebianValid && nativeLib.exists()
    }

    /**
     * True when the extracted guest matches [arch]. Reads the ELF machine
     * field of the guest shell (EM_X86_64=62, EM_AARCH64=183). Missing files
     * count as mismatch so a half-extracted guest is redone, never trusted.
     */
    private fun rootfsMatchesArch(debianDir: File, arch: String): Boolean {
        return try {
            val shell = listOf("usr/bin/dash", "bin/sh", "usr/bin/bash")
                .map { File(debianDir, it) }
                .firstOrNull { it.isFile && it.length() > 64 } ?: return false
            val header = ByteArray(20)
            shell.inputStream().use { it.read(header) }
            if (header[0] != 0x7F.toByte() || header[1] != 'E'.code.toByte() ||
                header[2] != 'L'.code.toByte() || header[3] != 'F'.code.toByte()) return false
            val machine = (header[18].toInt() and 0xFF) or ((header[19].toInt() and 0xFF) shl 8)
            val isX86 = machine == 62 || machine == 3
            (arch == "x86_64") == isX86
        } catch (_: Throwable) {
            false
        }
    }

    private fun openDecompressedStream(rawStream: InputStream): InputStream {
        val buffered = java.io.BufferedInputStream(rawStream, 65536)
        buffered.mark(4)
        val b1 = buffered.read()
        val b2 = buffered.read()
        buffered.reset()
        // Check for GZIP magic header: 0x1F, 0x8B
        return if (b1 == 0x1F && b2 == 0x8B) {
            GZIPInputStream(buffered, 65536)
        } else {
            buffered
        }
    }

    private fun extractTarStream(stream: InputStream, destDir: File) {
        if (!destDir.exists()) destDir.mkdirs()
        var count = 0
        val deferredSymlinks = mutableListOf<Pair<String, String>>() // cleanName -> linkTarget
        TarArchiveInputStream(stream).use { tarIn ->
            var entry: TarArchiveEntry? = tarIn.nextTarEntry
            while (entry != null) {
                val cleanName = entry.name.removePrefix("./").removePrefix("/")
                if (cleanName.isNotEmpty()) {
                    val destFile = File(destDir, cleanName)
                    if (entry.isDirectory) {
                        destFile.mkdirs()
                    } else if (entry.isSymbolicLink) {
                        // Defer symlink creation until all files are extracted
                        deferredSymlinks.add(cleanName to entry.linkName)
                    } else {
                        destFile.parentFile?.mkdirs()
                        FileOutputStream(destFile).use { out ->
                            tarIn.copyTo(out)
                        }
                        if (entry.mode and 0b001001001 != 0 || cleanName.contains("bin/") || cleanName.contains("sbin/") || cleanName.contains("lib/")) {
                            destFile.setExecutable(true, false)
                            destFile.setReadable(true, false)
                        }
                    }
                    count++
                }
                entry = tarIn.nextTarEntry
            }
        }
        Log.i(TAG, "Extracted $count entries into ${destDir.absolutePath}")

        // Create symlinks: convert absolute targets to relative paths within rootfs
        for ((cleanName, linkTarget) in deferredSymlinks) {
            val destFile = File(destDir, cleanName)
            destFile.parentFile?.mkdirs()
            if (destFile.exists()) destFile.delete()

            // Convert absolute target (e.g. /bin/busybox) to relative within rootfs
            val resolvedTarget = if (linkTarget.startsWith("/")) {
                val targetClean = linkTarget.removePrefix("/")
                val targetFile = File(destDir, targetClean)
                if (targetFile.exists()) {
                    // Compute relative path from destFile's parent to targetFile
                    val parentPath = destFile.parentFile!!.toPath()
                    val targetPath = targetFile.toPath()
                    try {
                        parentPath.relativize(targetPath).toString()
                    } catch (e: Exception) {
                        linkTarget
                    }
                } else {
                    linkTarget
                }
            } else {
                linkTarget
            }

            try {
                android.system.Os.symlink(resolvedTarget, destFile.absolutePath)
            } catch (e: Exception) {
                Log.d(TAG, "Symlink $cleanName -> $resolvedTarget: ${e.message}")
                // Fallback: if target exists, copy it
                val fallbackTarget = if (linkTarget.startsWith("/")) {
                    File(destDir, linkTarget.removePrefix("/"))
                } else {
                    File(destFile.parentFile, linkTarget)
                }
                if (fallbackTarget.exists() && fallbackTarget.isFile) {
                    try {
                        fallbackTarget.copyTo(destFile, overwrite = true)
                        destFile.setExecutable(true, false)
                        destFile.setReadable(true, false)
                    } catch (copyE: Exception) {
                        Log.d(TAG, "Symlink fallback copy failed for $cleanName: ${copyE.message}")
                    }
                }
            }
        }
        Log.i(TAG, "Created ${deferredSymlinks.size} symlinks")

        // Ensure /bin/sh is always a real executable (Debian ships dash as sh;
        // only repair it if it is missing or dangling)
        val sh = File(destDir, "bin/sh")
        val bash = File(destDir, "bin/bash")
        if (!sh.exists() || sh.length() == 0L) {
            val dash = File(destDir, "bin/dash")
            try {
                if (dash.exists()) {
                    if (sh.exists()) sh.delete()
                    dash.copyTo(sh, overwrite = true)
                    sh.setExecutable(true, false)
                    sh.setReadable(true, false)
                    Log.i(TAG, "Restored bin/sh from dash")
                } else if (bash.exists()) {
                    if (sh.exists()) sh.delete()
                    bash.copyTo(sh, overwrite = true)
                    sh.setExecutable(true, false)
                    sh.setReadable(true, false)
                    Log.i(TAG, "Restored bin/sh from bash")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to restore bin/sh", e)
            }
        }
    }

    @Synchronized
    fun initialize(context: Context): Boolean {
        val filesDir = context.filesDir
        val debianDir = File(filesDir, "debian")
        val prootFile = File(filesDir, "proot")
        val workspaceDir = File(filesDir, "workspace")
        val workspacesDir = File(filesDir, "workspaces")
        val tmpDir = File(filesDir, "tmp")

        if (!workspaceDir.exists()) workspaceDir.mkdirs()
        if (!workspacesDir.exists()) workspacesDir.mkdirs()
        if (!tmpDir.exists()) tmpDir.mkdirs()

        // Robust arch detection: scan ALL reported ABIs (some x86_64 devices
        // with ARM translation list arm64 first; firstOrNull lied to us).
        val supportedAbis = Build.SUPPORTED_ABIS?.toList() ?: emptyList()
        val arch = if (supportedAbis.any { it.contains("x86_64") || it == "x86" }) "x86_64" else "aarch64"
        Log.i(TAG, "Provisioning Linux environment. ABIs=$supportedAbis -> Arch: $arch")

        // Self-heal: if a previous run extracted the wrong-arch rootfs
        // (proot then dies with "foreign binary, qemu not specified"),
        // wipe it so this run extracts the correct one.
        if (debianDir.exists() && !rootfsMatchesArch(debianDir, arch)) {
            Log.w(TAG, "Rootfs arch mismatch (expected $arch) — wiping for re-extract.")
            try { debianDir.deleteRecursively() } catch (_: Exception) {}
        }

        try {
            val nativeLibProot = File(context.applicationInfo.nativeLibraryDir, "libproot.so")
            // Versioned support libs (libtalloc.so.2) that AGP strips from the APK.
            ProotCapabilities.ensureSupportLibs(context)
            if (nativeLibProot.exists()) {
                if (prootFile.exists()) {
                    prootFile.delete()
                }
            } else if (!prootFile.exists()) {
                val assetProotPath = "linux/$arch/proot"
                try {
                    context.assets.open(assetProotPath).use { input ->
                        FileOutputStream(prootFile).use { output ->
                            input.copyTo(output)
                        }
                    }
                    prootFile.setExecutable(true, false)
                    prootFile.setReadable(true, false)
                    Log.i(TAG, "PRoot binary extracted to ${prootFile.absolutePath}")
                } catch (e: Exception) {
                    Log.w(TAG, "Could not extract proot asset: ${e.message}")
                }
            }

            if (isEnvironmentReady(context)) {
                Log.i(TAG, "Debian Linux & PRoot already provisioned and ready.")
                ensureSystemConfigs(context, debianDir)
                ensureDeveloperToolchain(context, debianDir)
                return true
            }

            Log.i(TAG, "Environment not ready. Cleaning and unpacking rootfs...")
            // Migrate away from the legacy Alpine guest dir on first Debian boot.
            try {
                val legacyAlpine = File(filesDir, "alpine")
                if (legacyAlpine.exists() && !debianDir.exists()) {
                    Log.i(TAG, "Legacy Alpine guest dir present — leaving it in place, Debian uses a fresh dir.")
                }
            } catch (_: Exception) {}
            if (debianDir.exists()) {
                debianDir.deleteRecursively()
            }
            debianDir.mkdirs()

            // 2. Extract Debian RootFS dynamically matching archive format (.tar or .tar.gz)
            val list = context.assets.list("linux/$arch") ?: emptyArray()
            Log.i(TAG, "Available assets in linux/$arch: ${list.joinToString(", ")}")
            val tarFile = list.firstOrNull { it.startsWith("debian-rootfs") }
                ?: list.firstOrNull { it.startsWith("alpine-rootfs") }
                ?: "debian-rootfs.tar.gz"
            val assetTarPath = "linux/$arch/$tarFile"
            Log.i(TAG, "Extracting Debian RootFS from asset: $assetTarPath ...")
            context.assets.open(assetTarPath).use { rawStream ->
                val inStream = openDecompressedStream(rawStream)
                extractTarStream(inStream, debianDir)
            }

            ensureSystemConfigs(context, debianDir)
            ensureDeveloperToolchain(context, debianDir)
            Log.i(TAG, "Debian Linux environment provisioned successfully.")
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Exception during environment provisioning", e)
            return false
        }
    }

    // Speed: initialize() runs per PRoot call; the config body below is
    // idempotent (~15 file writes + getprop + asset scans), so refresh at
    // most every 30s. Daemon invariant untouched: this never starts servers,
    // only refreshes static guest config.
    private const val SYSTEM_CONFIG_TTL_MS = 30_000L
    @Volatile private var lastSystemConfigAt: Long = 0L

    fun ensureSystemConfigs(context: Context, debianDir: File) {
        val now = System.currentTimeMillis()
        if (now - lastSystemConfigAt < SYSTEM_CONFIG_TTL_MS) return
        try {
            // Configure DNS resolv.conf dynamically from Android network
            val etcDir = File(debianDir, "etc")
            if (!etcDir.exists()) etcDir.mkdirs()
            val resolvFile = File(etcDir, "resolv.conf")
            val dnsServers = EnvironmentDnsHelper.getActiveDnsServers(context)
            val resolvContent = dnsServers.joinToString("\n") { "nameserver $it" } + "\noptions timeout:2 attempts:3 rotate\n"
            resolvFile.writeText(resolvContent)

            // Configure hosts
            val hostsFile = File(etcDir, "hosts")
            hostsFile.writeText("127.0.0.1 localhost\n::1 localhost\n")

            // Debian ships real bash + dash: only ensure the paths exist.
            val binDir = File(debianDir, "bin")
            if (!binDir.exists()) binDir.mkdirs()
            val usrBinDir = File(debianDir, "usr/bin")
            if (!usrBinDir.exists()) usrBinDir.mkdirs()

            // Configure root profile for built-in Debian Linux shell experience
            val rootDir = File(debianDir, "root")
            if (!rootDir.exists()) rootDir.mkdirs()
            val profileFile = File(rootDir, ".profile")
            val bashrcFile = File(rootDir, ".bashrc")
            val profileText = """
export TERM=xterm-256color
export COLORTERM=truecolor
export TERM_PROGRAM=AstraIDE
[ -f /root/.theme_env ] && . /root/.theme_env || export COLORFGBG="15;default;0"
alias opencode='[ -f /root/.theme_env ] && . /root/.theme_env; opencode'
export HOME=/root
export USER=root
export SHELL=/bin/bash
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/root/.local/bin:/root/.npm-global/bin:/root/.opencode/bin:/root/.bun/bin:/root/.cargo/bin:/root/go/bin
export NODE_PATH=/usr/local/lib/node_modules:/usr/lib/node_modules
export LANG=C.UTF-8
export LC_ALL=C.UTF-8
export CI=1
export EXPO_NO_TELEMETRY=1
export EXPO_USE_LOCAL_CLI=1
# Plain prompt on purpose: keep it ASCII-safe for the xterm renderer
# and consistent across shells (dash, bash).
export PS1='linux:\w# '
# Keep arrow-key history working even if a stray INPUTRC remaps it.
if [ -n "${'$'}BASH_VERSION" ]; then
  set -o emacs 2>/dev/null
  bind '"\e[A": previous-history' 2>/dev/null
  bind '"\e[B": next-history' 2>/dev/null
  bind '"\e[C": forward-char' 2>/dev/null
  bind '"\e[D": backward-char' 2>/dev/null
fi
export NODE_OPTIONS="--dns-result-order=ipv4first"
alias ll='ls -la'
alias l='ls -lh'
alias la='ls -A'
""".trimIndent() + "\n"
            profileFile.writeText(profileText)
            bashrcFile.writeText(profileText)

            val etcProfile = File(etcDir, "profile")
            etcProfile.writeText(profileText)

            // Configure npm for mobile / cellular networks (IPv4 preference + higher timeouts)
            val npmrcFile = File(rootDir, ".npmrc")
            npmrcFile.writeText("""
fetch-retry-mintimeout=20000
fetch-retry-maxtimeout=120000
fetch-timeout=300000
fetch-retries=5
""".trimIndent() + "\n")

            // Ensure universal smart CLI tool wrappers in /usr/local/bin for reliable project execution
            try {
                val usrLocalBin = File(debianDir, "usr/local/bin")
                if (!usrLocalBin.exists()) usrLocalBin.mkdirs()

                val genericLauncher = """#!/bin/sh
CMD_NAME="${'$'}(basename "${'$'}0")"
if [ -f "./node_modules/.bin/${'$'}CMD_NAME" ]; then
  exec node "./node_modules/.bin/${'$'}CMD_NAME" "${'$'}@"
elif [ -f "./node_modules/${'$'}CMD_NAME/bin/${'$'}CMD_NAME.js" ]; then
  exec node "./node_modules/${'$'}CMD_NAME/bin/${'$'}CMD_NAME.js" "${'$'}@"
elif [ -f "./node_modules/${'$'}CMD_NAME/bin/${'$'}CMD_NAME" ]; then
  exec node "./node_modules/${'$'}CMD_NAME/bin/${'$'}CMD_NAME" "${'$'}@"
elif [ -f "./node_modules/${'$'}CMD_NAME/bin/cli.js" ]; then
  exec node "./node_modules/${'$'}CMD_NAME/bin/cli.js" "${'$'}@"
elif [ -f "./node_modules/@expo/cli/build/bin/index.js" ] && [ "${'$'}CMD_NAME" = "expo" ]; then
  exec node "./node_modules/@expo/cli/build/bin/index.js" "${'$'}@"
elif [ -f "./node_modules/expo/bin/cli" ] && [ "${'$'}CMD_NAME" = "expo" ]; then
  exec node "./node_modules/expo/bin/cli" "${'$'}@"
else
  exec npx --yes "${'$'}CMD_NAME" "${'$'}@"
fi
""".trimIndent() + "\n"

                val smartTools = listOf("expo", "vite", "next", "tsc", "nodemon")
                for (tool in smartTools) {
                    val toolFile = File(usrLocalBin, tool)
                    toolFile.writeText(genericLauncher)
                    toolFile.setExecutable(true, false)
                }

                val legacyExpoDir = File(debianDir, "usr/local/lib/node_modules/expo-cli")
                if (legacyExpoDir.exists()) {
                    legacyExpoDir.deleteRecursively()
                }
            } catch (_: Exception) {}

            // Proactively clear any stale apt/dpkg lock files from previous runs
            try {
                File(debianDir, "var/lib/dpkg/lock-frontend").delete()
                File(debianDir, "var/lib/dpkg/lock").delete()
                File(debianDir, "var/cache/apt/archives/lock").delete()
                File(debianDir, "var/lib/apt/lists/lock").delete()
            } catch (_: Exception) {}

            lastSystemConfigAt = System.currentTimeMillis()
        } catch (e: Exception) {
            Log.w(TAG, "Could not configure profile/dns: ${e.message}")
        }
    }

    fun ensureDeveloperToolchain(context: Context, debianDir: File) {
        ToolchainProvisioner.ensure(context, debianDir)
    }

    /** Delegate: stop an in-flight provisioning stage (see ToolchainProvisioner). */
    fun cancelProvisioning(): Boolean {
        return ToolchainProvisioner.cancel()
    }
}

