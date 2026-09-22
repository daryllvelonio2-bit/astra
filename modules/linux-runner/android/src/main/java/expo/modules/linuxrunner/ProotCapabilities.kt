package expo.modules.linuxrunner

import android.content.Context
import android.os.Build
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.ConcurrentHashMap

/**
 * proot capability probe (1 feature = 1 file).
 *
 * The bundled arm64 libproot.so is a proot-ex build (supports --link2symlink);
 * other builds (e.g. the vanilla x86_64 prebuilt) reject it with
 * "unknown option", which fails every provisioning stage and session.
 * Probe once per binary path, then pass the flag only where supported.
 * Any probe failure defaults to TRUE to preserve historical behavior.
 */
object ProotCapabilities {
    private const val FLAG = "--link2symlink"
    private val cache = ConcurrentHashMap<String, Boolean>()

    fun supportsLink2Symlink(prootPath: String): Boolean =
        cache.getOrPut(prootPath) { probe(prootPath) }

    /**
     * Writable dir for bundled support libs that AGP strips from the APK
     * (native libs whose names don't end in ".so", e.g. libtalloc.so.2).
     */
    fun supportLibDir(context: Context): File =
        File(context.filesDir, "lib").also { if (!it.exists()) it.mkdirs() }

    /** LD_LIBRARY_PATH covering both packaged JNI libs and extracted support libs. */
    fun guestLdLibraryPath(context: Context): String =
        "${context.applicationInfo.nativeLibraryDir}:${supportLibDir(context).absolutePath}"

    /**
     * Extract per-arch support libs from assets (mirrors the proot fallback
     * in EnvironmentManager). Idempotent: skips when size matches.
     * Call from environment initialization, which runs per PRoot call.
     */
    fun ensureSupportLibs(context: Context) {
        try {
            val supportedAbis = Build.SUPPORTED_ABIS?.toList() ?: emptyList()
            val arch = if (supportedAbis.any { it.contains("x86_64") || it == "x86" }) "x86_64" else "aarch64"
            val names = try {
                context.assets.list("linux/$arch")?.toList() ?: emptyList()
            } catch (_: Throwable) { emptyList() }
            // Versioned .so names only; plain libtalloc.so already ships via jniLibs.
            for (name in names) {
                if (!name.endsWith(".so.2")) continue
                val dest = File(supportLibDir(context), name)
                try {
                    context.assets.open("linux/$arch/$name").use { input ->
                        if (dest.exists() && dest.length() == input.available().toLong()) return@use
                        FileOutputStream(dest).use { output -> input.copyTo(output) }
                    }
                    dest.setReadable(true, false)
                } catch (_: Throwable) { /* keep going */ }
            }
        } catch (_: Throwable) { /* never break provisioning */ }
    }

    private fun probe(prootPath: String): Boolean {
        return try {
            val file = File(prootPath)
            if (!file.exists()) return true
            // Fast path: the option string is embedded in supporting binaries.
            if (file.length() in 1..25_000_000) {
                val bytes = file.inputStream().use { it.readBytes() }
                if (String(bytes, Charsets.ISO_8859_1).contains(FLAG)) return true
            }
            // Slow path: ask the binary (covers stripped builds).
            // --help exits before any guest is needed.
            val process = ProcessBuilder(prootPath, "--help")
                .redirectErrorStream(true)
                .start()
            val output = process.inputStream.bufferedReader().readText()
            try { process.waitFor() } catch (_: InterruptedException) { Thread.currentThread().interrupt() }
            output.contains(FLAG)
        } catch (_: Throwable) {
            true
        }
    }
}
