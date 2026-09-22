package expo.modules.linuxrunner

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.asCoroutineDispatcher
import java.util.concurrent.Executors

class LinuxRunnerModule : Module() {
    // Kills bypass the single shared AsyncFunction queue: a streaming agent
    // turn would otherwise park them behind minutes of command execution.
    private val killScope = CoroutineScope(
        Executors.newSingleThreadExecutor { r -> Thread(r, "LinuxRunnerKill") }.asCoroutineDispatcher() +
            SupervisorJob()
    )
    override fun definition() = ModuleDefinition {
        Name("LinuxRunner")

        Events("onTerminalData", "onCommandOutput", "onTerminalExit", "onProvisioningProgress")

        OnCreate {
            ToolchainProvisioner.onProgressUpdate = { status ->
                try {
                    sendEvent("onProvisioningProgress", mapOf(
                        "isProvisioning" to status.isProvisioning,
                        "stageName" to status.stageName,
                        "stageIndex" to status.stageIndex,
                        "totalStages" to status.totalStages,
                        "attempt" to status.attempt,
                        "maxRetries" to status.maxRetries,
                        "currentPackage" to status.currentPackage,
                        "lastOutput" to status.lastOutput,
                        "isComplete" to status.isComplete,
                        "hasError" to status.hasError,
                        "errorMessage" to (status.errorMessage ?: "")
                    ))
                } catch (_: Exception) {}
            }
        }

        Function("isEnvironmentReady") {
            val context = appContext.reactContext ?: return@Function false
            return@Function EnvironmentManager.isEnvironmentReady(context)
        }

        Function("getProvisioningStatus") {
            val context = appContext.reactContext ?: return@Function emptyMap<String, Any?>()
            return@Function ToolchainProvisioner.getStatus(context)
        }

        Function("cancelProvisioning") {
            return@Function ToolchainProvisioner.cancel()
        }

        Function("isAutoProvisionEnabled") {
            val context = appContext.reactContext ?: return@Function false
            return@Function ToolchainProvisioner.isAutoDownloadEnabled(context)
        }

        Function("setAutoProvisionEnabled") { enabled: Boolean ->
            val context = appContext.reactContext ?: return@Function false
            ToolchainProvisioner.setAutoDownloadEnabled(context, enabled)
            return@Function true
        }

        AsyncFunction("startProvisioning") {
            val context = appContext.reactContext ?: return@AsyncFunction false
            val debianDir = java.io.File(context.filesDir, "debian")
            ToolchainProvisioner.forceRestart(context, debianDir)
            return@AsyncFunction true
        }

        AsyncFunction("initializeEnvironment") {
            val context = appContext.reactContext ?: return@AsyncFunction false
            return@AsyncFunction EnvironmentManager.initialize(context)
        }

        AsyncFunction("executeCommand") { command: String, workspaceId: String? ->
            val context = appContext.reactContext ?: return@AsyncFunction mapOf(
                "stdout" to "Error: React context unavailable",
                "exitCode" to -1
            )
            EnvironmentManager.initialize(context)
            val result = ProcessExecutor.execute(context, command, workspaceId, 0)
            return@AsyncFunction mapOf(
                "stdout" to result.stdout,
                "exitCode" to result.exitCode
            )
        }

        AsyncFunction("executeCommandStream") { commandId: String, command: String, workspaceId: String? ->
            val context = appContext.reactContext ?: return@AsyncFunction mapOf(
                "stdout" to "Error: React context unavailable",
                "exitCode" to -1
            )
            EnvironmentManager.initialize(context)
            val result = ProcessExecutor.execute(context, command, workspaceId, 0, commandId) { line ->
                sendEvent("onCommandOutput", mapOf("commandId" to commandId, "line" to line))
            }
            return@AsyncFunction mapOf(
                "stdout" to result.stdout,
                "exitCode" to result.exitCode
            )
        }

        Function("stopCommand") { commandId: String ->
            return@Function ProcessExecutor.stopCommand(commandId)
        }

        Function("stopAllCommands") {
            return@Function ProcessExecutor.stopAll()
        }

        AsyncFunction("killProcessTree") { pid: Int ->
            return@AsyncFunction ProcessTreeKiller.killTree(pid.toLong(), 800)
        }.runOnQueue(killScope)

        AsyncFunction("killByPattern") { pattern: String ->
            return@AsyncFunction ProcessTreeKiller.killByPattern(pattern, 800)
        }.runOnQueue(killScope)

        AsyncFunction("startTerminalSession") { sessionId: String, workspaceId: String? ->
            val context = appContext.reactContext ?: return@AsyncFunction
            EnvironmentManager.initialize(context)
            TerminalSessionManager.startSession(context, sessionId, workspaceId) { data ->
                sendEvent("onTerminalData", mapOf("sessionId" to sessionId, "data" to data))
            }
        }

        // PTY-backed session: the guest gets a real controlling terminal
        // (isatty true, job control, window size) instead of pipes.
        AsyncFunction("startPtySession") { sessionId: String, workspaceId: String?, rows: Int, cols: Int ->
            val context = appContext.reactContext ?: return@AsyncFunction
            EnvironmentManager.initialize(context)
            PtySessionManager.startSession(context, sessionId, workspaceId, rows, cols,
                onData = { data ->
                    sendEvent("onTerminalData", mapOf("sessionId" to sessionId, "data" to data))
                },
                onExit = { code ->
                    sendEvent("onTerminalExit", mapOf("sessionId" to sessionId, "exitCode" to code))
                })
        }

        Function("writeTerminalInput") { sessionId: String, data: String ->
            // PTY sessions first; pipe sessions otherwise. Same event stream.
            if (!PtySessionManager.writeInput(sessionId, data)) {
                TerminalSessionManager.writeInput(sessionId, data)
            }
        }

        Function("getSessionHistory") { sessionId: String ->
            val ptyHist = PtySessionManager.getSessionHistory(sessionId)
            return@Function ptyHist.ifEmpty { TerminalSessionManager.getSessionHistory(sessionId) }
        }

        Function("resizeTerminalSession") { sessionId: String, cols: Int, rows: Int ->
            return@Function PtySessionManager.resizeSession(sessionId, cols, rows)
        }

        Function("listActiveSessions") {
            return@Function TerminalSessionManager.listActiveSessions()
        }

        Function("stopTerminalSession") { sessionId: String ->
            PtySessionManager.stopSession(sessionId)
            TerminalSessionManager.stopSession(sessionId)
        }

        Function("copyToClipboard") { text: String ->
            val context = appContext.reactContext ?: return@Function false
            val clipboard = context.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
            val clip = android.content.ClipData.newPlainText("Copied Text", text)
            clipboard.setPrimaryClip(clip)
            return@Function true
        }

        Function("getStringFromClipboard") {
            val context = appContext.reactContext ?: return@Function ""
            val clipboard = context.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
            val clip = clipboard.primaryClip ?: return@Function ""
            val sb = StringBuilder()
            for (i in 0 until clip.itemCount) {
                val text = clip.getItemAt(i)?.coerceToText(context)?.toString() ?: continue
                if (sb.isNotEmpty()) sb.append("\n")
                sb.append(text)
            }
            return@Function sb.toString()
        }

        Function("readDirectory") { rawPath: String ->
            return@Function NativeFileSystemHelper.readDirectory(rawPath)
        }

        Function("getFileInfo") { rawPath: String ->
            return@Function NativeFileSystemHelper.getFileInfo(rawPath)
        }

        Function("readFile") { rawPath: String ->
            return@Function NativeFileSystemHelper.readFile(rawPath)
        }

        Function("writeFile") { rawPath: String, content: String ->
            return@Function NativeFileSystemHelper.writeFile(rawPath, content)
        }

        Function("makeDirectory") { rawPath: String ->
            return@Function NativeFileSystemHelper.makeDirectory(rawPath)
        }

        Function("deletePath") { rawPath: String ->
            return@Function NativeFileSystemHelper.deletePath(rawPath)
        }

        Function("movePath") { fromRaw: String, toRaw: String ->
            return@Function NativeFileSystemHelper.movePath(fromRaw, toRaw)
        }

        Function("hasAllFilesPermission") {
            val context = appContext.reactContext ?: return@Function false
            return@Function NativeFileSystemHelper.hasAllFilesPermission(context)
        }

        Function("requestAllFilesPermission") {
            val context = appContext.reactContext ?: return@Function false
            val activity = appContext.currentActivity
            return@Function NativeFileSystemHelper.requestAllFilesPermission(context, activity)
        }

        Function("isIgnoringBatteryOptimizations") {
            val context = appContext.reactContext ?: return@Function true
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                val powerManager = context.getSystemService(android.content.Context.POWER_SERVICE) as? android.os.PowerManager
                return@Function powerManager?.isIgnoringBatteryOptimizations(context.packageName) ?: true
            }
            return@Function true
        }

        Function("requestIgnoreBatteryOptimizations") {
            val context = appContext.reactContext ?: return@Function false
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                try {
                    val intent = android.content.Intent(
                        android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                        android.net.Uri.parse("package:${context.packageName}")
                    ).apply {
                        flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    context.startActivity(intent)
                    return@Function true
                } catch (e: Exception) {
                    try {
                        val fallbackIntent = android.content.Intent(
                            android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS
                        ).apply {
                            flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK
                        }
                        context.startActivity(fallbackIntent)
                        return@Function true
                    } catch (_: Exception) {
                        return@Function false
                    }
                }
            }
            return@Function false
        }

        Function("openBatteryOptimizationSettings") {
            val context = appContext.reactContext ?: return@Function false
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                try {
                    val intent = android.content.Intent(
                        android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS
                    ).apply {
                        flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    context.startActivity(intent)
                    return@Function true
                } catch (_: Exception) {
                    return@Function false
                }
            }
            return@Function false
        }

        Function("openAppDetailsSettings") {
            val context = appContext.reactContext ?: return@Function false
            try {
                val intent = android.content.Intent(
                    android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    android.net.Uri.parse("package:${context.packageName}")
                ).apply {
                    flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK
                }
                context.startActivity(intent)
                return@Function true
            } catch (_: Exception) {
                return@Function false
            }
        }
    }
}
