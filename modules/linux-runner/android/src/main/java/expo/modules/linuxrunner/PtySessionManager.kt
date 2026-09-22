package expo.modules.linuxrunner

import android.content.Context
import android.util.Log
import java.util.concurrent.ConcurrentHashMap
import kotlin.concurrent.thread

class PtySession(
    val sessionId: String,
    private val handle: Long,
    val childPid: Int,
    private val onData: (String) -> Unit,
    private val onExit: (Int) -> Unit
) {
    private val historyBuffer = StringBuilder()
    private val lock = Any()
    var isRunning: Boolean = true
        private set

    init {
        thread(start = true, name = "PtyReader-$sessionId") {
            try {
                val buffer = ByteArray(4096)
                while (true) {
                    val n = try {
                        PtyNative.ptyRead(handle, buffer, 0, buffer.size)
                    } catch (e: Exception) {
                        Log.e("PtySession", "read failed for $sessionId", e)
                        break
                    }
                    if (n == -2) continue // EINTR: retry
                    if (n <= 0) break // EOF / EIO: slave side is gone
                    val data = String(buffer, 0, n, Charsets.UTF_8)
                    if (data.isEmpty()) continue
                    synchronized(lock) {
                        historyBuffer.append(data)
                        if (historyBuffer.length > 100000) {
                            historyBuffer.delete(0, historyBuffer.length - 80000)
                        }
                    }
                    try {
                        onData(data)
                    } catch (_: Exception) {}
                }
            } finally {
                isRunning = false
                val code = try {
                    var c = PtyNative.ptyExitCode(handle)
                    var spins = 0
                    while (c < 0 && spins < 40) {
                        Thread.sleep(50)
                        c = PtyNative.ptyExitCode(handle)
                        spins++
                    }
                    c
                } catch (_: Exception) {
                    127
                }
                try {
                    onExit(code)
                } catch (_: Exception) {}
            }
        }
    }

    fun write(data: String) {
        try {
            // Write bytes verbatim: CR must reach the pty intact. Canonical-
            // mode shells accept CR (ICRNL) and LF alike, but raw-mode TUIs
            // (opencode, vim, htop) bind submit to CR and read LF as Ctrl+J /
            // "insert newline" — normalizing CR→LF here made Enter unusable
            // in every fullscreen app with no way for JS to compensate.
            val bytes = data.toByteArray(Charsets.UTF_8)
            PtyNative.ptyWrite(handle, bytes, 0, bytes.size)
        } catch (e: Exception) {
            Log.e("PtySession", "Error writing to session $sessionId", e)
        }
    }

    fun resize(cols: Int, rows: Int): Boolean {
        return try {
            PtyNative.ptySetWinsize(handle, rows, cols)
        } catch (e: Exception) {
            Log.e("PtySession", "resize failed for $sessionId", e)
            false
        }
    }

    fun getHistory(): String {
        synchronized(lock) {
            return historyBuffer.toString()
        }
    }

    fun stop() {
        try {
            isRunning = false
            // SIGTERM the whole guest tree first (leaves first), SIGKILL
            // survivors — same path as every other kill in the app.
            try {
                ProcessTreeKiller.killTree(childPid.toLong(), 800)
            } catch (_: Exception) {}
            try {
                PtyNative.ptyClose(handle)
            } catch (_: Exception) {}
        } catch (e: Exception) {
            Log.e("PtySession", "Error stopping session $sessionId", e)
        }
    }
}

object PtySessionManager {
    private const val TAG = "PtySessionManager"
    private val sessions = ConcurrentHashMap<String, PtySession>()

    fun hasSession(sessionId: String): Boolean {
        return sessions[sessionId]?.isRunning == true
    }

    fun startSession(
        context: Context,
        sessionId: String,
        workspaceId: String? = null,
        rows: Int = 24,
        cols: Int = 80,
        onData: (String) -> Unit,
        onExit: (Int) -> Unit
    ) {
        val existing = sessions[sessionId]
        if (existing != null && existing.isRunning) {
            val hist = existing.getHistory()
            if (hist.isNotEmpty()) onData(hist)
            return
        }

        stopSession(sessionId)

        try {
            val cfg = ProotSessionConfig.build(context, workspaceId)
            val handle = PtyNative.ptyOpen(rows, cols, cfg.argv.toTypedArray(), cfg.toEnvArray())
            if (handle == 0L) {
                onData("\r\n\u001b[31m[Failed to allocate PTY for session]\u001b[0m\r\n")
                return
            }
            val pid = PtyNative.ptyChildPid(handle)
            Log.i(TAG, "startSession $sessionId child=$pid grid=${rows}x$cols")
            sessions[sessionId] = PtySession(sessionId, handle, pid, onData, onExit)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start PTY session $sessionId", e)
            onData("\r\n\u001b[31m[Failed to launch PTY session: ${e.message}]\u001b[0m\r\n")
        }
    }

    fun writeInput(sessionId: String, data: String): Boolean {
        val s = sessions[sessionId] ?: return false
        s.write(data)
        return true
    }

    fun resizeSession(sessionId: String, cols: Int, rows: Int): Boolean {
        return sessions[sessionId]?.resize(cols, rows) ?: false
    }

    fun getSessionHistory(sessionId: String): String {
        return sessions[sessionId]?.getHistory() ?: ""
    }

    fun stopSession(sessionId: String) {
        sessions.remove(sessionId)?.stop()
    }
}
