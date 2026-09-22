// pty_session.c — minimal PTY spawn for terminal sessions.
//
// Opens /dev/ptmx, forks; the child gets the pts slave as stdio plus a
// controlling terminal, then execs. ioctls are issued manually (no bionic
// pty.h dependency) — same technique as Termux's terminal-jni.
//
// Only async-signal-safe calls happen between fork and execve.
#include <errno.h>
#include <fcntl.h>
#include <jni.h>
#include <signal.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <termios.h>
#include <unistd.h>

#include <android/log.h>

#define LOG_TAG "PtySession"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN, LOG_TAG, __VA_ARGS__)

#ifndef TIOCGPTN
#define TIOCGPTN 0x80045430
#endif
#ifndef TIOCSPTLCK
#define TIOCSPTLCK 0x40045431
#endif
#ifndef TIOCSCTTY
#define TIOCSCTTY 0x540E
#endif
#ifndef TIOCSWINSZ
#define TIOCSWINSZ 0x5414
#endif

typedef struct {
    int master_fd;
    pid_t child_pid;
} pty_session_t;

static char **to_c_str_array(JNIEnv *env, jobjectArray arr) {
    jsize n = (*env)->GetArrayLength(env, arr);
    char **out = (char **)malloc(((size_t)n + 1) * sizeof(char *));
    if (!out) return NULL;
    for (jsize i = 0; i < n; i++) {
        jstring s = (jstring)(*env)->GetObjectArrayElement(env, arr, i);
        const char *utf = s ? (*env)->GetStringUTFChars(env, s, NULL) : NULL;
        out[i] = strdup(utf ? utf : "");
        if (utf) (*env)->ReleaseStringUTFChars(env, s, utf);
        if (s) (*env)->DeleteLocalRef(env, s);
    }
    out[n] = NULL;
    return out;
}

static void free_c_str_array(char **arr) {
    if (!arr) return;
    for (char **p = arr; *p; p++) free(*p);
    free(arr);
}

static pty_session_t *from_handle(jlong h) {
    return (pty_session_t *)(intptr_t)h;
}

JNIEXPORT jlong JNICALL
Java_expo_modules_linuxrunner_PtyNative_ptyOpen(JNIEnv *env, jclass clazz,
                                                jint rows, jint cols,
                                                jobjectArray argv, jobjectArray envp) {
    (void)clazz;
    int master = open("/dev/ptmx", O_RDWR | O_CLOEXEC);
    if (master < 0) {
        LOGW("open /dev/ptmx failed: %s", strerror(errno));
        return 0;
    }
    int unlock = 0;
    if (ioctl(master, TIOCSPTLCK, &unlock) != 0) {
        LOGW("unlock ptmx failed: %s", strerror(errno));
        close(master);
        return 0;
    }
    int ptn = 0;
    if (ioctl(master, TIOCGPTN, &ptn) != 0) {
        LOGW("ptn query failed: %s", strerror(errno));
        close(master);
        return 0;
    }
    char pts[64];
    snprintf(pts, sizeof(pts), "/dev/pts/%d", ptn);

    struct winsize ws;
    memset(&ws, 0, sizeof(ws));
    ws.ws_row = rows > 0 ? (unsigned short)rows : 24;
    ws.ws_col = cols > 0 ? (unsigned short)cols : 80;
    ioctl(master, TIOCSWINSZ, &ws);

    char **c_argv = to_c_str_array(env, argv);
    char **c_envp = to_c_str_array(env, envp);
    if (!c_argv || !c_argv[0] || !c_envp) {
        free_c_str_array(c_argv);
        free_c_str_array(c_envp);
        close(master);
        return 0;
    }

    pid_t pid = fork();
    if (pid < 0) {
        LOGW("fork failed: %s", strerror(errno));
        free_c_str_array(c_argv);
        free_c_str_array(c_envp);
        close(master);
        return 0;
    }
    if (pid == 0) {
        // Child: detach, take the slave as stdio + controlling tty, exec.
        close(master);
        for (int fd = 3; fd < 1024; fd++) close(fd);
        setsid();
        int slave = open(pts, O_RDWR);
        if (slave < 0) _exit(127);
        ioctl(slave, TIOCSCTTY, 0);
        ioctl(slave, TIOCSWINSZ, &ws);
        // Sane baseline discipline: no XON/XOFF flow control (an accidental
        // Ctrl+S would otherwise freeze all output with no visible cause on
        // a mobile keyboard), DEL erases, Ctrl+C interrupts. The guest line
        // editor may adjust bits further for its own use.
        {
            struct termios tio;
            if (tcgetattr(slave, &tio) == 0) {
                tio.c_iflag &= (unsigned int)~(IXON | IXOFF);
                tio.c_lflag |= (ECHO | ECHOE | ECHOK | ECHOCTL | ECHOKE);
                tio.c_cc[VERASE] = 127;
                tio.c_cc[VINTR] = 3;
                tcsetattr(slave, TCSANOW, &tio);
            }
        }
        dup2(slave, 0);
        dup2(slave, 1);
        dup2(slave, 2);
        if (slave > 2) close(slave);
        execve(c_argv[0], c_argv, c_envp);
        _exit(127);
    }

    free_c_str_array(c_argv);
    free_c_str_array(c_envp);

    pty_session_t *s = (pty_session_t *)malloc(sizeof(pty_session_t));
    if (!s) {
        close(master);
        kill(pid, SIGKILL);
        return 0;
    }
    s->master_fd = master;
    s->child_pid = pid;
    LOGI("ptyOpen: master=%d child=%d grid=%dx%d", master, (int)pid,
         ws.ws_row, ws.ws_col);
    return (jlong)(intptr_t)s;
}

// Returns bytes read, -1 on EOF/error, -2 on EINTR (caller retries).
JNIEXPORT jint JNICALL
Java_expo_modules_linuxrunner_PtyNative_ptyRead(JNIEnv *env, jclass clazz,
                                                jlong handle, jbyteArray buf,
                                                jint off, jint len) {
    (void)clazz;
    pty_session_t *s = from_handle(handle);
    if (!s || s->master_fd < 0) return -1;
    jbyte *dst = (*env)->GetByteArrayElements(env, buf, NULL);
    if (!dst) return -1;
    ssize_t n = read(s->master_fd, dst + off, (size_t)len);
    int e = errno;
    (*env)->ReleaseByteArrayElements(env, buf, dst, 0);
    if (n < 0) return (e == EINTR) ? -2 : -1;
    return (jint)n;
}

JNIEXPORT jint JNICALL
Java_expo_modules_linuxrunner_PtyNative_ptyWrite(JNIEnv *env, jclass clazz,
                                                 jlong handle, jbyteArray buf,
                                                 jint off, jint len) {
    (void)clazz;
    pty_session_t *s = from_handle(handle);
    if (!s || s->master_fd < 0) return -1;
    jbyte *src = (*env)->GetByteArrayElements(env, buf, NULL);
    if (!src) return -1;
    jint written = 0;
    while (written < len) {
        ssize_t n = write(s->master_fd, src + off + written,
                          (size_t)(len - written));
        if (n < 0) {
            if (errno == EINTR) continue;
            (*env)->ReleaseByteArrayElements(env, buf, src, JNI_ABORT);
            return -1;
        }
        written += (jint)n;
    }
    (*env)->ReleaseByteArrayElements(env, buf, src, JNI_ABORT);
    return written;
}

JNIEXPORT jboolean JNICALL
Java_expo_modules_linuxrunner_PtyNative_ptySetWinsize(JNIEnv *env, jclass clazz,
                                                      jlong handle, jint rows,
                                                      jint cols) {
    (void)env;
    (void)clazz;
    pty_session_t *s = from_handle(handle);
    if (!s || s->master_fd < 0 || s->child_pid <= 0) return JNI_FALSE;
    struct winsize ws;
    memset(&ws, 0, sizeof(ws));
    ws.ws_row = rows > 0 ? (unsigned short)rows : 24;
    ws.ws_col = cols > 0 ? (unsigned short)cols : 80;
    if (ioctl(s->master_fd, TIOCSWINSZ, &ws) != 0) return JNI_FALSE;
    kill(s->child_pid, SIGWINCH);
    return JNI_TRUE;
}

// -1 while running, otherwise the exit code (128+signal on signal death).
JNIEXPORT jint JNICALL
Java_expo_modules_linuxrunner_PtyNative_ptyExitCode(JNIEnv *env, jclass clazz,
                                                    jlong handle) {
    (void)env;
    (void)clazz;
    pty_session_t *s = from_handle(handle);
    if (!s || s->child_pid <= 0) return -1;
    int status = 0;
    pid_t r = waitpid(s->child_pid, &status, WNOHANG);
    if (r == 0) return -1;
    if (r < 0) return 127;
    if (WIFEXITED(status)) return WEXITSTATUS(status);
    if (WIFSIGNALED(status)) return 128 + WTERMSIG(status);
    return 127;
}

JNIEXPORT jint JNICALL
Java_expo_modules_linuxrunner_PtyNative_ptyChildPid(JNIEnv *env, jclass clazz,
                                                    jlong handle) {
    (void)env;
    (void)clazz;
    pty_session_t *s = from_handle(handle);
    return (s && s->child_pid > 0) ? (jint)s->child_pid : -1;
}

JNIEXPORT void JNICALL
Java_expo_modules_linuxrunner_PtyNative_ptyClose(JNIEnv *env, jclass clazz,
                                                 jlong handle) {
    (void)env;
    (void)clazz;
    pty_session_t *s = from_handle(handle);
    if (!s) return;
    if (s->master_fd >= 0) close(s->master_fd);
    free(s);
}
