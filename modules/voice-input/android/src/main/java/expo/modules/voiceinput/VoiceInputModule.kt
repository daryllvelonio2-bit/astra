package expo.modules.voiceinput

import android.content.Intent
import android.media.MediaRecorder
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * One-shot on-device speech-to-text for chat dictation.
 *
 * Uses the platform SpeechRecognizer (free, no API key, no network contract
 * of our own) and reports back over events so the JS side stays a thin
 * listener: onVoicePartial {text}, onVoiceFinal {text}, onVoiceError {code},
 * onVoiceState {state}. RECORD_AUDIO is requested from JS via
 * PermissionsAndroid before startListening is ever called.
 */
class VoiceInputModule : Module() {
    private var recognizer: SpeechRecognizer? = null
    private var recorder: MediaRecorder? = null
    private var recordingPath: String? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    private fun destroyRecognizer() {
        try {
            recognizer?.destroy()
        } catch (_: Exception) {
        }
        recognizer = null
    }

    private fun emitState(state: String) {
        try {
            sendEvent("onVoiceState", mapOf("state" to state))
        } catch (_: Exception) {
        }
    }

    private fun firstResult(results: Bundle?): String {
        return results
            ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            ?.firstOrNull() ?: ""
    }

    override fun definition() = ModuleDefinition {
        Name("VoiceInput")

        Events("onVoicePartial", "onVoiceFinal", "onVoiceError", "onVoiceState")

        Function("isSupported") {
            val context = appContext.reactContext ?: return@Function false
            return@Function SpeechRecognizer.isRecognitionAvailable(context)
        }

        AsyncFunction("startListening") {
            val context = appContext.reactContext ?: return@AsyncFunction false
            if (!SpeechRecognizer.isRecognitionAvailable(context)) {
                return@AsyncFunction false
            }
            // SpeechRecognizer owns a hidden UI connection: create, start,
            // and tear down on the main thread only.
            mainHandler.post {
                try {
                    destroyRecognizer()
                    val sr = SpeechRecognizer.createSpeechRecognizer(context)
                    recognizer = sr
                    sr.setRecognitionListener(object : RecognitionListener {
                        override fun onReadyForSpeech(params: Bundle?) {
                            emitState("listening")
                        }

                        override fun onBeginningOfSpeech() {
                            emitState("listening")
                        }

                        override fun onRmsChanged(rmsdB: Float) {}

                        override fun onBufferReceived(buffer: ByteArray?) {}

                        override fun onEndOfSpeech() {}

                        override fun onError(error: Int) {
                            try {
                                sendEvent("onVoiceError", mapOf("code" to error))
                            } catch (_: Exception) {
                            }
                            destroyRecognizer()
                            emitState("idle")
                        }

                        override fun onResults(results: Bundle?) {
                            val text = firstResult(results)
                            try {
                                sendEvent("onVoiceFinal", mapOf("text" to text))
                            } catch (_: Exception) {
                            }
                            destroyRecognizer()
                            emitState("idle")
                        }

                        override fun onPartialResults(partialResults: Bundle?) {
                            val text = firstResult(partialResults)
                            try {
                                sendEvent("onVoicePartial", mapOf("text" to text))
                            } catch (_: Exception) {
                            }
                        }

                        override fun onEvent(eventType: Int, params: Bundle?) {}
                    })
                    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                        putExtra(
                            RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                            RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
                        )
                        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                    }
                    sr.startListening(intent)
                } catch (_: Exception) {
                    try {
                        sendEvent("onVoiceError", mapOf("code" to -1))
                    } catch (_: Exception) {
                    }
                    destroyRecognizer()
                    emitState("idle")
                }
            }
            return@AsyncFunction true
        }

        // Graceful end: the recognizer still delivers final results first.
        Function("stopListening") {
            mainHandler.post {
                try {
                    recognizer?.stopListening()
                } catch (_: Exception) {
                    destroyRecognizer()
                    emitState("idle")
                }
                if (recognizer == null) emitState("idle")
            }
        }

        // Hard abort: discard anything pending.
        Function("cancel") {
            mainHandler.post {
                destroyRecognizer()
                emitState("idle")
            }
        }

        // ---- Fallback path: raw recording for cloud transcription --------
        // Used on devices with no system SpeechRecognizer (e.g. phones whose
        // Google apps live in a compatibility container instead of GMS).
        // MediaRecorder needs no Looper, so these run on the worker thread.

        AsyncFunction("startRecording") {
            val context = appContext.reactContext ?: return@AsyncFunction null
            try {
                recorder?.release()
            } catch (_: Exception) {
            }
            recorder = null
            recordingPath = null
            return@AsyncFunction try {
                val dir = File(context.cacheDir, "voice").apply { mkdirs() }
                val path = File(dir, "voice-${System.currentTimeMillis()}.m4a").absolutePath
                val rec = if (Build.VERSION.SDK_INT >= 31) {
                    MediaRecorder(context)
                } else {
                    @Suppress("DEPRECATION") MediaRecorder()
                }
                rec.setAudioSource(MediaRecorder.AudioSource.MIC)
                rec.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                rec.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                rec.setAudioSamplingRate(16000)
                rec.setAudioEncodingBitRate(64000)
                rec.setAudioChannels(1)
                rec.setOutputFile(path)
                rec.prepare()
                rec.start()
                recorder = rec
                recordingPath = path
                emitState("listening")
                path
            } catch (_: Exception) {
                emitState("idle")
                null
            }
        }

        // Graceful end: returns the recorded file path, or null if too short.
        AsyncFunction("stopRecording") {
            val rec = recorder
            recorder = null
            val path = recordingPath
            recordingPath = null
            try {
                rec?.stop()
            } catch (_: Exception) {
                // Stopped before any audio landed: discard the stub file.
                try {
                    rec?.release()
                } catch (_: Exception) {
                }
                try {
                    if (path != null) File(path).delete()
                } catch (_: Exception) {
                }
                emitState("idle")
                return@AsyncFunction null
            }
            try {
                rec?.release()
            } catch (_: Exception) {
            }
            emitState("idle")
            return@AsyncFunction path
        }

        Function("cancelRecording") {
            val rec = recorder
            recorder = null
            val path = recordingPath
            recordingPath = null
            try {
                rec?.stop()
            } catch (_: Exception) {
            }
            try {
                rec?.release()
            } catch (_: Exception) {
            }
            try {
                if (path != null) File(path).delete()
            } catch (_: Exception) {
            }
            emitState("idle")
        }
    }
}
