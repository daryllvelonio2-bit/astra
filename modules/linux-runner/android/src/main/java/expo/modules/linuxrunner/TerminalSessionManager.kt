package expo.modules.linuxrunner

import android.content.Context
import android.util.Log
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.util.concurrent.ConcurrentHashMap
import kotlin.concurrent.thread

class TerminalSession(
    val sessionId: String,
    private val process: Process,
    private val outputStream: OutputStream,
    private val onData: (String) -> Unit
) {
    private val historyBuffer = StringBuilder()
    private val lock = Any()
    var isRunning: Boolean = true
        private set

    init {
        thread(start = true, name = "TerminalReader-$sessionId") {
            try {
                val buffer = ByteArray(2048)
                val inputStream = process.inputStream
                var bytesRead: Int
                while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                    val raw = String(buffer, 0, bytesRead, Charsets.UTF_8)
                    // Strip the non-tty warning once here so history length and
                    // live stream bytes stay identical for JS delta-merging.
                    val data = raw.replace("/bin/sh: can't access tty; job control turned off", "")
                    if (data.isEmpty()) continue
                    synchronized(lock) {
                        historyBuffer.append(data)
                        if (historyBuffer.length > 100000) {
                            historyBuffer.delete(0, historyBuffer.length - 80000)
                        }
                    }
                    onData(data)
                }
            } catch (e: Exception) {
                Log.e("TerminalSession", "Stream closed for session $sessionId", e)
            } finally {
                isRunning = false
                val endMsg = "\r\n[Process completed]\r\n"
                synchronized(lock) {
                    historyBuffer.append(endMsg)
                }
                onData(endMsg)
            }
        }
    }

    fun write(data: String) {
        try {
            val converted = data.replace("\r\n", "\n").replace("\r", "\n")
            outputStream.write(converted.toByteArray(Charsets.UTF_8))
            outputStream.flush()
        } catch (e: Exception) {
            Log.e("TerminalSession", "Error writing to session $sessionId", e)
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
            outputStream.close()
            try {
                process.destroyForcibly()
            } catch (_: Exception) {}
            // Kill the whole PTY subtree so no child outlives the session.
            ProcessTreeKiller.killTreeOf(process)
        } catch (e: Exception) {
            Log.e("TerminalSession", "Error stopping session $sessionId", e)
        }
    }
}

object TerminalSessionManager {
    private val sessions = ConcurrentHashMap<String, TerminalSession>()

    fun startSession(
        context: Context,
        sessionId: String,
        workspaceId: String? = null,
        onData: (String) -> Unit
    ) {
        // If an active session exists, return cached history
        val existing = sessions[sessionId]
        if (existing != null && existing.isRunning) {
            val hist = existing.getHistory()
            if (hist.isNotEmpty()) {
                onData(hist)
            }
            return
        }

        stopSession(sessionId)

        // Guest argv/env shared with the PTY sessions (ProotSessionConfig).
        val cfg = ProotSessionConfig.build(context, workspaceId)

        val pb = ProcessBuilder(cfg.argv)
        pb.directory(File(cfg.workDir))
        pb.redirectErrorStream(true)
        val env = pb.environment()
        env.putAll(cfg.env)
        env.remove("LD_PRELOAD")

        try {
            val process = pb.start()
            val session = TerminalSession(sessionId, process, process.outputStream, onData)
            sessions[sessionId] = session
        } catch (e: Exception) {
            Log.e("TerminalSessionManager", "Failed to start terminal session $sessionId", e)
            onData("\r\n\u001b[31m[Failed to launch Debian PRoot session: ${e.message}]\u001b[0m\r\n")
        }
    }

    fun writeInput(sessionId: String, data: String) {
        sessions[sessionId]?.write(data)
    }

    fun getSessionHistory(sessionId: String): String {
        return sessions[sessionId]?.getHistory() ?: ""
    }

    fun listActiveSessions(): List<String> {
        return sessions.keys().toList()
    }

    fun stopSession(sessionId: String) {
        sessions.remove(sessionId)?.stop()
    }
}
