package expo.modules.linuxrunner

import android.content.Context
import java.io.File

/**
 * Single source of truth for the interactive proot guest invocation.
 * Both the legacy pipe sessions and the PTY sessions exec the same guest.
 */
object ProotSessionConfig {
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

        val targetDir = if (!workspaceId.isNullOrBlank()) {
            val clean = workspaceId.removePrefix("file://").trimEnd('/')
            if (clean.startsWith("/")) {
                val dir = File(clean)
                if (!dir.exists()) dir.mkdirs()
                clean
            } else {
                val specificWs = File(filesDir, "workspaces/$workspaceId")
                if (!specificWs.exists()) specificWs.mkdirs()
                "/workspaces/$workspaceId"
            }
        } else {
            "/workspace"
        }

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
        argv.add("/bin/sh")
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
            "PATH" to "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/root/.local/bin:/root/.npm-global/bin",
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
