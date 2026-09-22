package expo.modules.linuxrunner

/** JNI bridge to the `ptysession` native library (fork + pts slave + exec). */
object PtyNative {
    init {
        System.loadLibrary("ptysession")
    }

    external fun ptyOpen(rows: Int, cols: Int, argv: Array<String>, envp: Array<String>): Long
    external fun ptyRead(handle: Long, buf: ByteArray, off: Int, len: Int): Int
    external fun ptyWrite(handle: Long, buf: ByteArray, off: Int, len: Int): Int
    external fun ptySetWinsize(handle: Long, rows: Int, cols: Int): Boolean
    external fun ptyExitCode(handle: Long): Int
    external fun ptyChildPid(handle: Long): Int
    external fun ptyClose(handle: Long)
}
