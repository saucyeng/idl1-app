package com.saucyeng.idl1.device

import android.annotation.SuppressLint
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiNetworkSpecifier
import android.os.Build
import android.util.Log
import app.tauri.plugin.Channel
import app.tauri.plugin.JSObject
import org.json.JSONObject

private const val TAG = "idl1-wifi"

/**
 * SPEC §6.2 network binding, ported from idl0-app's WifiNetworkPlugin: one
 * `WifiNetworkSpecifier` request at a time, held for the whole linked
 * period, with a [LoopbackProxy] per `onAvailable`. The process is never
 * bound to the AP (`bindProcessToNetwork` is not used), so the rest of the
 * app keeps its normal network. No timers and no policy: the Rust link
 * reconciler decides when to request, release and give up.
 */
internal class WifiLink(context: Context) {
    private val connectivity =
        context.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    private var callback: ConnectivityManager.NetworkCallback? = null
    private var proxy: LoopbackProxy? = null

    @SuppressLint("MissingPermission")
    @Synchronized
    fun request(ssid: String, password: String, events: Channel) {
        // A new request supersedes whatever was live, which also keys the
        // network to this SSID: no cached Network is ever reused.
        release()

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            // No specifier API: the user joins the AP in Settings and
            // 192.168.4.1 routes directly, as on desktop.
            Log.i(TAG, "request($ssid): API ${Build.VERSION.SDK_INT} < 29, direct mode")
            events.send(JSObject().put("type", "available").put("port", JSONObject.NULL))
            return
        }

        Log.i(TAG, "request($ssid)")
        val specifier = WifiNetworkSpecifier.Builder()
            .setSsid(ssid)
            .setWpa2Passphrase(password)
            .build()
        // The AP is local-only: without removing NET_CAPABILITY_INTERNET the
        // request can never be satisfied and no callback ever fires.
        val request = NetworkRequest.Builder()
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
            .removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .setNetworkSpecifier(specifier)
            .build()

        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                Log.i(TAG, "onAvailable($ssid)")
                val port = synchronized(this@WifiLink) {
                    proxy?.stop()
                    val p = LoopbackProxy(network)
                    try {
                        p.start().also { proxy = p }
                    } catch (e: Exception) {
                        Log.e(TAG, "proxy start failed: $e")
                        null
                    }
                }
                if (port == null) {
                    events.send(JSObject().put("type", "unavailable"))
                } else {
                    events.send(JSObject().put("type", "available").put("port", port))
                }
            }

            override fun onLost(network: Network) {
                Log.w(TAG, "onLost($ssid)")
                synchronized(this@WifiLink) {
                    proxy?.stop()
                    proxy = null
                }
                events.send(JSObject().put("type", "lost"))
            }

            override fun onUnavailable() {
                Log.w(TAG, "onUnavailable($ssid)")
                // Terminal for this request: unregister so the registration
                // never leaks (ConnectivityManager caps requests per app).
                synchronized(this@WifiLink) { unregister() }
                events.send(JSObject().put("type", "unavailable"))
            }
        }
        callback = cb
        connectivity.requestNetwork(request, cb)
    }

    @Synchronized
    fun release() {
        unregister()
        proxy?.stop()
        proxy = null
    }

    private fun unregister() {
        callback?.let { runCatching { connectivity.unregisterNetworkCallback(it) } }
        callback = null
    }
}
