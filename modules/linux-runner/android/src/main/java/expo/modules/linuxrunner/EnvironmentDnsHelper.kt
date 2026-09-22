package expo.modules.linuxrunner

import android.content.Context
import android.os.Build

object EnvironmentDnsHelper {
    // Speed: getprop spawn + LinkProperties lookup run per PRoot call via
    // ensureSystemConfigs. Cache 30s; resolv.conf always keeps public
    // fallbacks (8.8.8.8/1.1.1.1/...) so a network switch degrades
    // gracefully inside the window instead of failing DNS outright.
    private const val DNS_CACHE_TTL_MS = 30_000L
    @Volatile private var cachedDns: List<String>? = null
    @Volatile private var cachedDnsAt: Long = 0L

    fun getActiveDnsServers(context: Context): List<String> {
        val now = System.currentTimeMillis()
        cachedDns?.let { if (now - cachedDnsAt < DNS_CACHE_TTL_MS) return it }
        val fresh = queryDnsServers(context)
        cachedDns = fresh
        cachedDnsAt = now
        return fresh
    }

    private fun queryDnsServers(context: Context): List<String> {
        val dnsList = mutableListOf<String>()

        // 1. Try reading getprop properties containing dns
        try {
            val p = Runtime.getRuntime().exec("getprop")
            p.inputStream.bufferedReader().useLines { lines ->
                lines.forEach { line ->
                    val match = Regex("""\[.*dns.*\]:\s*\[([^\]]+)\]""").find(line)
                    if (match != null) {
                        val ip = match.groupValues[1].trim()
                        if (ip.matches(Regex("""\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}""")) && !dnsList.contains(ip)) {
                            dnsList.add(ip)
                        }
                    }
                }
            }
        } catch (_: Exception) {}

        // 2. Try Android ConnectivityManager LinkProperties
        try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? android.net.ConnectivityManager
            if (cm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val activeNetwork = cm.activeNetwork
                if (activeNetwork != null) {
                    val linkProps = cm.getLinkProperties(activeNetwork)
                    if (linkProps != null) {
                        for (inetAddr in linkProps.dnsServers) {
                            val host = inetAddr.hostAddress
                            if (!host.isNullOrBlank() && !host.contains(":") && !dnsList.contains(host)) {
                                dnsList.add(host)
                            }
                        }
                    }
                }
            }
        } catch (_: Exception) {}

        // 3. Fallback public DNS
        for (fallback in listOf("8.8.8.8", "1.1.1.1", "8.8.4.4", "9.9.9.9")) {
            if (!dnsList.contains(fallback)) {
                dnsList.add(fallback)
            }
        }
        return dnsList
    }
}
