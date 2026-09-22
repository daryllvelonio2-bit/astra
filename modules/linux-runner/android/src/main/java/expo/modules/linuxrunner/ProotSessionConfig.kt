package expo.modules.linuxrunner

import android.content.Context
import android.util.Log
import java.io.File

/**
 * Single source of truth for the interactive proot guest invocation.
 * Both the legacy pipe sessions and the PTY sessions exec the same guest.
 */
object ProotSessionConfig {
    private const val TAG = "ProotSessionConfig"
    private const val REGISTRY_NAME = "workspaces_registry.json"
    data class Config(
        val argv: List<String>,
        val env: Map<String, String>,
        val workDir: String
    ) {
        /** KEY=VALUE lines for execve. LD_PRELOAD is deliberately omitted. */
        fun toEnvArray(): Array<String> {
            return env.map { (k, v) -> "$k=$v" }.toTypedArray()
        }
    }

    /**
     * Resolve the guest-visible working directory for a workspace.
     *
     * The file explorer is registry-aware (custom "Specific Directory"
     * projects live outside filesDir/workspaces), but callers only pass
     * the workspace slug — so resolve the real folder here:
     * - blank slug -> legacy "/workspace"
     * - absolute path -> itself (unchanged legacy behavior)
     * - slug with registry dirPath under filesDir/workspaces/<id>
     *   -> "/workspaces/<id>" (unchanged default behavior)
     * - slug with registry dirPath anywhere else (custom dir, opened
     *   folder, cloned repo) -> that absolute host path; the argv
     *   builder below bind-mounts it into the guest verbatim.
     * - registry missing/unreadable -> legacy "/workspaces/<id>".
     */
    fun resolveGuestDir(context: Context, workspaceId: String? = null): String {
        if (workspaceId.isNullOrBlank()) return "/workspace"
        val clean = workspaceId.removePrefix("file://").trimEnd('/')
        if (clean.startsWith("/")) {
            try {
                val dir = File(clean)
                if (!dir.exists()) dir.mkdirs()
            } catch (_: Exception) {}
            return clean
        }
        val filesDir = context.filesDir.absolutePath
        val registryDir = readRegistryDirPath(context, clean)
        Log.d(TAG, "registry dirPath for '$clean' = $registryDir")
        if (registryDir != null) {
            val hostWorkspaces = "$filesDir/workspaces"
            val hostWorkspace = "$filesDir/workspace"
            // Default-storage project: keep the historical guest path so
            // guest-absolute consumers (/workspaces/<id> prefixes) keep working.
            if (registryDir == "$hostWorkspaces/$clean" || registryDir.startsWith("$hostWorkspaces/$clean/")) {
                val rest = registryDir.removePrefix("$hostWorkspaces/$clean")
                ensureHostDir(File(filesDir, "workspaces/$clean"))
                return "/workspaces/$clean$rest"
            }
            if (registryDir == hostWorkspace || registryDir.startsWith("$hostWorkspace/")) {
                val rest = registryDir.removePrefix(hostWorkspace)
                return "/workspace$rest"
            }
            // Custom / opened / cloned location: guest sees the host path
            // via the /sdcard, /storage, or explicit targetDir binds below.
            ensureHostDir(File(registryDir))
            return registryDir
        }
        ensureHostDir(File(filesDir, "workspaces/$clean"))
        return "/workspaces/$clean"
    }

    private fun ensureHostDir(dir: File) {
        try {
            if (!dir.exists()) dir.mkdirs()
        } catch (_: Exception) {}
    }

    /** Best-effort read of dirPath for [workspaceId] from the JS registry. */
    private fun readRegistryDirPath(context: Context, workspaceId: String): String? {
        return try {
            val reg = File(context.filesDir, REGISTRY_NAME)
            if (!reg.exists()) return null
            val root = org.json.JSONObject(reg.readText())
            val entry = root.optJSONObject(workspaceId) ?: return null
            var p = entry.optString("dirPath", "")
            if (p.isBlank()) return null
            p = p.removePrefix("file://").trimEnd('/')
            if (p.isBlank()) null else p
        } catch (_: Exception) {
            null
        }
    }

    fun build(context: Context, workspaceId: String? = null): Config {
        val filesDir = context.filesDir
        val prootPath = EnvironmentManager.getProotPath(context)
        val debianDir = File(filesDir, "debian").absolutePath
        val workspacesDir = File(filesDir, "workspaces").absolutePath
        val workspaceDir = File(filesDir, "workspace").absolutePath
        val tmpDir = File(filesDir, "tmp").absolutePath
        val extensionsDir = File(filesDir, "extensions").absolutePath

        if (!File(filesDir, "workspaces").exists()) File(filesDir, "workspaces").mkdirs()
        if (!File(filesDir, "workspace").exists()) File(filesDir, "workspace").mkdirs()
        if (!File(filesDir, "tmp").exists()) File(filesDir, "tmp").mkdirs()
        if (!File(filesDir, "extensions").exists()) File(filesDir, "extensions").mkdirs()
        if (!File(debianDir, "extensions").exists()) File(debianDir, "extensions").mkdirs()

        val targetDir = resolveGuestDir(context, workspaceId)
        Log.i(TAG, "workspace=$workspaceId targetDir=$targetDir")

        val nativeLibDir = context.applicationInfo.nativeLibraryDir
        val loaderPath = "$nativeLibDir/libproot-loader.so"
        val loader32Path = "$nativeLibDir/libproot-loader32.so"

        val argv = mutableListOf(
            prootPath,
            "-r", debianDir,
            "-0",
            "-w", targetDir,
            "-b", "/dev",
            "-b", "/proc",
            "-b", "/sys",
            "-b", "$workspacesDir:/workspaces",
            "-b", "$workspaceDir:/workspace",
            "-b", "$tmpDir:/tmp",
            "-b", "$extensionsDir:/extensions"
        )
        // proot-ex only: vanilla builds (x86_64 prebuilt) reject this flag.
        if (ProotCapabilities.supportsLink2Symlink(prootPath)) argv.add(1, "--link2symlink")
        if (File("/sdcard").exists()) {
            argv.add("-b")
            argv.add("/sdcard")
        }
        if (File("/storage").exists()) {
            argv.add("-b")
            argv.add("/storage")
        }
        val extDir = try { android.os.Environment.getExternalStorageDirectory().absolutePath } catch (_: Throwable) { null }
        if (extDir != null && File(extDir).exists() && !extDir.startsWith("/storage") && !extDir.startsWith("/sdcard")) {
            argv.add("-b")
            argv.add(extDir)
        }
        if (targetDir.startsWith("/") &&
            !targetDir.startsWith("/workspaces") &&
            !targetDir.startsWith("/workspace") &&
            !targetDir.startsWith("/sdcard") &&
            !targetDir.startsWith("/storage") &&
            File(targetDir).exists()
        ) {
            argv.add("-b")
            argv.add("$targetDir:$targetDir")
        }
        // Interactive shell: prefer bash so PS1 backslash-escapes (\w)
        // expand to the real cwd. Guest /bin/sh is dash, which prints
        // them literally (prompt stuck at "linux:\w#"). Fall back to sh
        // when bash is absent from the extracted rootfs.
        val shellBin = if (File(debianDir, "bin/bash").exists()) "/bin/bash" else "/bin/sh"
        if (shellBin == "/bin/sh") Log.w(TAG, "bin/bash missing, falling back to dash (no arrow-key history)")
        Log.i(TAG, "shell=$shellBin workspace=$workspaceId targetDir=$targetDir")
        argv.add(shellBin)
        argv.add("-l")
        // -i keeps the shell interactive so it reprints the dynamic PS1
        // (linux:<cwd>#) after every command instead of going silent.
        argv.add("-i")

        val themeEnvFile = File(debianDir, "root/.theme_env")
        var colorFgBg = "15;default;0"
        if (themeEnvFile.exists()) {
            try {
                val content = themeEnvFile.readText()
                val match = Regex("""COLORFGBG=["']?([^"'\s]+)["']?""").find(content)
                if (match != null) {
                    colorFgBg = match.groupValues[1]
                }
            } catch (_: Exception) {}
        } else {
            val configFile = File(filesDir, "config.json")
            if (configFile.exists()) {
                try {
                    val configText = configFile.readText()
                    if (configText.contains(""""selectedTheme":\s*"light"""".toRegex())) {
                        colorFgBg = "0;default;15"
                    }
                } catch (_: Exception) {}
            }
        }

        val env = linkedMapOf(
            "PATH" to "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/root/.local/bin:/root/.npm-global/bin:/root/.opencode/bin:/root/.bun/bin:/root/.cargo/bin:/root/go/bin",
            "NODE_PATH" to "/usr/local/lib/node_modules:/usr/lib/node_modules",
            "HOME" to "/root",
            "USER" to "root",
            "SHELL" to "/bin/bash",
            "CI" to "1",
            "EXPO_NO_TELEMETRY" to "1",
            "EXPO_USE_LOCAL_CLI" to "1",
            "TERM" to "xterm-256color",
            "COLORTERM" to "truecolor",
            "TERM_PROGRAM" to "AstraIDE",
            "COLORFGBG" to colorFgBg,
            "LANG" to "C.UTF-8",
            "LC_ALL" to "C.UTF-8",
            "ENV" to "/root/.profile",
            // Plain prompt on purpose: keep it ASCII-safe for the xterm
            // renderer and consistent across shells (dash, bash).
            "PS1" to "linux:\\w# ",
            "PROOT_TMP_DIR" to tmpDir,
            "LD_LIBRARY_PATH" to ProotCapabilities.guestLdLibraryPath(context)
        )
        if (File(loaderPath).exists()) env["PROOT_LOADER"] = loaderPath
        if (File(loader32Path).exists()) env["PROOT_LOADER_32"] = loader32Path

        return Config(argv, env, debianDir)
    }
}
