package expo.modules.linuxrunner

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import java.io.File

object NativeFileSystemHelper {

    fun cleanPath(raw: String): String {
        var p = raw.trim()
        if (p.startsWith("file://")) {
            p = p.substring(7)
        }
        try {
            p = Uri.decode(p)
        } catch (_: Exception) {}
        if (p.startsWith("/sdcard/")) {
            p = "/storage/emulated/0/" + p.substring(8)
        } else if (p == "/sdcard") {
            p = "/storage/emulated/0"
        }
        return p
    }

    fun readDirectory(rawPath: String): List<Map<String, Any>> {
        val path = cleanPath(rawPath)
        val file = File(path)
        if (!file.exists() || !file.isDirectory) return emptyList()
        val list = file.listFiles() ?: return emptyList()
        return list.map { f ->
            mapOf(
                "name" to f.name,
                "path" to f.absolutePath,
                "isDirectory" to f.isDirectory,
                "size" to (if (f.isFile) f.length() else 0L),
                "lastModified" to f.lastModified()
            )
        }.sortedWith(compareBy({ !(it["isDirectory"] as Boolean) }, { it["name"] as String }))
    }

    fun getFileInfo(rawPath: String): Map<String, Any> {
        val path = cleanPath(rawPath)
        val file = File(path)
        return mapOf(
            "exists" to file.exists(),
            "isDirectory" to file.isDirectory,
            "size" to (if (file.isFile) file.length() else 0L),
            "path" to file.absolutePath,
            "lastModified" to file.lastModified()
        )
    }

    fun readFile(rawPath: String): String {
        val path = cleanPath(rawPath)
        val file = File(path)
        if (!file.exists() || !file.isFile) return ""
        return try {
            file.readText(Charsets.UTF_8)
        } catch (e: Exception) {
            ""
        }
    }

    fun writeFile(rawPath: String, content: String): Boolean {
        val path = cleanPath(rawPath)
        val file = File(path)
        return try {
            file.parentFile?.mkdirs()
            file.writeText(content, Charsets.UTF_8)
            true
        } catch (e: Exception) {
            false
        }
    }

    fun makeDirectory(rawPath: String): Boolean {
        val path = cleanPath(rawPath)
        val file = File(path)
        return try {
            file.mkdirs() || file.exists()
        } catch (e: Exception) {
            false
        }
    }

    fun deletePath(rawPath: String): Boolean {
        val path = cleanPath(rawPath)
        val file = File(path)
        return try {
            file.deleteRecursively()
        } catch (e: Exception) {
            false
        }
    }

    fun movePath(fromRaw: String, toRaw: String): Boolean {
        val from = File(cleanPath(fromRaw))
        val to = File(cleanPath(toRaw))
        return try {
            to.parentFile?.mkdirs()
            from.renameTo(to)
        } catch (e: Exception) {
            false
        }
    }

    fun scanMediaFile(context: Context, rawPath: String) {
        try {
            val path = cleanPath(rawPath)
            android.media.MediaScannerConnection.scanFile(
                context,
                arrayOf(path),
                null,
                null
            )
        } catch (e: Exception) {}
    }

    fun hasAllFilesPermission(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Environment.isExternalStorageManager()
        } else {
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.READ_EXTERNAL_STORAGE
            ) == PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.WRITE_EXTERNAL_STORAGE
            ) == PackageManager.PERMISSION_GRANTED
        }
    }

    fun requestAllFilesPermission(context: Context, activity: Activity? = null): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                if (!Environment.isExternalStorageManager()) {
                    try {
                        val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
                            data = Uri.parse("package:${context.packageName}")
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK
                        }
                        context.startActivity(intent)
                        true
                    } catch (e: Exception) {
                        try {
                            val intent = Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION).apply {
                                flags = Intent.FLAG_ACTIVITY_NEW_TASK
                            }
                            context.startActivity(intent)
                            true
                        } catch (e2: Exception) {
                            openAppSettings(context)
                        }
                    }
                } else {
                    true
                }
            } else {
                val readGranted = ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.READ_EXTERNAL_STORAGE
                ) == PackageManager.PERMISSION_GRANTED
                val writeGranted = ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.WRITE_EXTERNAL_STORAGE
                ) == PackageManager.PERMISSION_GRANTED

                if (!readGranted || !writeGranted) {
                    if (activity != null) {
                        activity.runOnUiThread {
                            ActivityCompat.requestPermissions(
                                activity,
                                arrayOf(
                                    Manifest.permission.READ_EXTERNAL_STORAGE,
                                    Manifest.permission.WRITE_EXTERNAL_STORAGE
                                ),
                                1001
                            )
                        }
                        true
                    } else {
                        openAppSettings(context)
                    }
                } else {
                    true
                }
            }
        } catch (e: Exception) {
            openAppSettings(context)
        }
    }

    fun openAppSettings(context: Context): Boolean {
        return try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:${context.packageName}")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(intent)
            true
        } catch (e: Exception) {
            false
        }
    }
}
