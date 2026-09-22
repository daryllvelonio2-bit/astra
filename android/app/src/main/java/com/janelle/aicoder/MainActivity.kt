package com.janelle.aicoder

import android.os.Build
import android.os.Bundle

import android.view.KeyEvent

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.ReactContext
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme)
    window.setSoftInputMode(
      android.view.WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN or
      android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
    )
    super.onCreate(null)

    // Globally configure all inputs when keyboard & mouse mode or hardware keyboard is active
    window.decorView.viewTreeObserver.addOnGlobalFocusChangeListener { _, newFocus ->
      if (isKeyboardMouseModeEnabled()) {
        hideSoftKeyboard()
        window.decorView.post { hideSoftKeyboard() }
      }

      if (newFocus is android.widget.EditText && isKeyboardMouseModeEnabled()) {
        try {
          newFocus.showSoftInputOnFocus = false
          newFocus.privateImeOptions = "nm"
          newFocus.imeOptions = newFocus.imeOptions or
            android.view.inputmethod.EditorInfo.IME_FLAG_NO_EXTRACT_UI or
            android.view.inputmethod.EditorInfo.IME_FLAG_NO_FULLSCREEN or
            android.view.inputmethod.EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING

          val isMultiline = (newFocus.inputType and android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE) != 0
          newFocus.inputType = android.text.InputType.TYPE_CLASS_TEXT or
            android.text.InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD or
            android.text.InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS or
            (if (isMultiline) android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE else 0)
        } catch (_: Exception) {}

        hideSoftKeyboard()
        window.decorView.post { hideSoftKeyboard() }
      }
    }

    // Proactively squash soft keyboard if it attempts to become visible during keyboard & mouse mode
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      window.decorView.setOnApplyWindowInsetsListener { view, insets ->
        if (isKeyboardMouseModeEnabled() && insets.isVisible(android.view.WindowInsets.Type.ime())) {
          view.post { hideSoftKeyboard() }
        }
        view.onApplyWindowInsets(insets)
      }
    }
  }

  private fun isPhysicalKeyboardPresent(): Boolean {
    val deviceIds = android.view.InputDevice.getDeviceIds() ?: return false
    for (id in deviceIds) {
      val device = android.view.InputDevice.getDevice(id) ?: continue
      if (!device.isVirtual && (device.sources and android.view.InputDevice.SOURCE_KEYBOARD) == android.view.InputDevice.SOURCE_KEYBOARD) {
        if (device.keyboardType == android.view.InputDevice.KEYBOARD_TYPE_ALPHABETIC) {
          return true
        }
      }
    }
    return false
  }

  private fun isKeyboardMouseModeEnabled(): Boolean {
    try {
      val configFile = java.io.File(filesDir, "config.json")
      if (configFile.exists()) {
        val text = configFile.readText()
        if (text.contains("\"keyboardMouseMode\":true") || text.contains("\"keyboardMouseMode\": true")) {
          return true
        }
      }
    } catch (_: Exception) {}
    return isPhysicalKeyboardPresent()
  }

  private fun getAppReactContext(): ReactContext? {
    return (application as? ReactApplication)?.reactHost?.currentReactContext
      ?: (application as? ReactApplication)?.reactNativeHost?.reactInstanceManager?.currentReactContext
      ?: reactInstanceManager?.currentReactContext
  }

  private fun hideSoftKeyboard() {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        window.insetsController?.hide(android.view.WindowInsets.Type.ime())
      }
      val imm = getSystemService(INPUT_METHOD_SERVICE) as? android.view.inputmethod.InputMethodManager
      val focusedView = currentFocus ?: window.decorView
      imm?.hideSoftInputFromWindow(focusedView.windowToken, 0)
    } catch (_: Exception) {}
  }

  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    val isCtrl = event.isCtrlPressed || event.isMetaPressed
    if (isCtrl) {
      val shortcut = when (event.keyCode) {
        KeyEvent.KEYCODE_E -> "Ctrl+E"
        KeyEvent.KEYCODE_T -> "Ctrl+T"
        KeyEvent.KEYCODE_B -> "Ctrl+B"
        KeyEvent.KEYCODE_G -> "Ctrl+G"
        else -> null
      }
      if (shortcut != null) {
        if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
          getAppReactContext()?.emitDeviceEvent("onHardwareShortcut", shortcut)
        }
        return true
      }
    }

    if (isKeyboardMouseModeEnabled()) {
      val handled = super.dispatchKeyEvent(event)
      hideSoftKeyboard()
      window.decorView.post { hideSoftKeyboard() }
      if (event.keyCode == KeyEvent.KEYCODE_ENTER) {
        window.decorView.postDelayed({ hideSoftKeyboard() }, 40)
        window.decorView.postDelayed({ hideSoftKeyboard() }, 100)
        window.decorView.postDelayed({ hideSoftKeyboard() }, 200)
      }
      return handled
    }

    return super.dispatchKeyEvent(event)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}
