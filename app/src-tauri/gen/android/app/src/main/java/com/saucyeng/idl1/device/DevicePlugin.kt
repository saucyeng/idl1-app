package com.saucyeng.idl1.device

import android.Manifest
import android.app.Activity
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.util.Base64
import app.tauri.PermissionState
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.util.UUID

/** SPEC §7.1 service UUID every IDL0 logger advertises. */
internal val SERVICE_UUID: UUID = UUID.fromString("000000ff-0000-1000-8000-00805f9b34fb")

@InvokeArg
internal class ScanArgs {
    var timeoutMs: Long = 10_000
    lateinit var onEvent: Channel
}

@InvokeArg
internal class ConnectArgs {
    lateinit var id: String
    lateinit var onEvent: Channel
}

@InvokeArg
internal class IdArgs {
    lateinit var id: String
}

@InvokeArg
internal class CharArgs {
    lateinit var id: String
    lateinit var uuid: String
}

@InvokeArg
internal class WriteArgs {
    lateinit var id: String
    lateinit var uuid: String
    /** Base64 of the bytes to write. */
    lateinit var value: String
}

@InvokeArg
internal class WifiRequestArgs {
    lateinit var ssid: String
    lateinit var password: String
    lateinit var onEvent: Channel
}

/**
 * SPEC §14b.2: the Android side of idl1's device transport. A sensor/actuator
 * only — BLE GATT, the §6.2 network request and loopback proxy, the
 * multicast lock and runtime permissions. Every policy decision (retries,
 * backoff, identity checks, what an ACK byte means) lives in Rust.
 */
@TauriPlugin(
    permissions = [
        // API <= 30: BLE scans need location (and location services on).
        Permission(strings = [Manifest.permission.ACCESS_FINE_LOCATION], alias = "bleLegacy"),
        // API >= 31: the Nearby devices group.
        Permission(
            strings = [Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT],
            alias = "ble"
        ),
    ]
)
class DevicePlugin(private val activity: Activity) : Plugin(activity) {
    private val main = Handler(Looper.getMainLooper())
    private val sessions = HashMap<String, BleSession>()
    private val wifi = WifiLink(activity)
    private var multicastLock: WifiManager.MulticastLock? = null
    private var scanCallback: ScanCallback? = null

    private fun bleAlias(): String = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) "ble" else "bleLegacy"

    private fun bluetoothManager(): BluetoothManager =
        activity.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager

    // ---- permissions ----------------------------------------------------

    /** Resolves `{granted}`; prompts only when the alias isn't granted yet. */
    @Command
    fun bleEnsurePermissions(invoke: Invoke) {
        if (getPermissionState(bleAlias()) == PermissionState.GRANTED) {
            invoke.resolve(JSObject().put("granted", true))
        } else {
            requestPermissionForAlias(bleAlias(), invoke, "onBlePermissions")
        }
    }

    @PermissionCallback
    private fun onBlePermissions(invoke: Invoke) {
        invoke.resolve(JSObject().put("granted", getPermissionState(bleAlias()) == PermissionState.GRANTED))
    }

    // ---- BLE ------------------------------------------------------------

    @Command
    @Suppress("MissingPermission")
    fun bleScan(invoke: Invoke) {
        val args = invoke.parseArgs(ScanArgs::class.java)
        val adapter = bluetoothManager().adapter
        if (adapter == null || !adapter.isEnabled) {
            invoke.reject("Bluetooth is off", "bluetooth_off")
            return
        }
        val scanner = adapter.bluetoothLeScanner
        if (scanner == null) {
            invoke.reject("Bluetooth LE scanner unavailable", "bluetooth_off")
            return
        }
        scanCallback?.let { runCatching { scanner.stopScan(it) } }
        val callback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                val uuids = JSArray()
                result.scanRecord?.serviceUuids?.forEach { uuids.put(it.uuid.toString()) }
                val name = result.scanRecord?.deviceName ?: result.device.name ?: ""
                args.onEvent.send(
                    JSObject()
                        .put("type", "device")
                        .put("id", result.device.address)
                        .put("name", name)
                        .put("rssiDbm", result.rssi)
                        .put("serviceUuids", uuids)
                )
            }

            override fun onScanFailed(errorCode: Int) {
                args.onEvent.send(JSObject().put("type", "error").put("message", "scan failed ($errorCode)"))
                args.onEvent.send(JSObject().put("type", "done"))
            }
        }
        scanCallback = callback
        val filters = listOf(ScanFilter.Builder().setServiceUuid(ParcelUuid(SERVICE_UUID)).build())
        val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
        scanner.startScan(filters, settings, callback)
        main.postDelayed({
            if (scanCallback === callback) {
                runCatching { scanner.stopScan(callback) }
                scanCallback = null
            }
            args.onEvent.send(JSObject().put("type", "done"))
        }, args.timeoutMs)
        invoke.resolve()
    }

    @Command
    fun bleConnect(invoke: Invoke) {
        val args = invoke.parseArgs(ConnectArgs::class.java)
        val adapter = bluetoothManager().adapter
        if (adapter == null || !adapter.isEnabled) {
            invoke.reject("Bluetooth is off", "bluetooth_off")
            return
        }
        val device = try {
            adapter.getRemoteDevice(args.id)
        } catch (e: IllegalArgumentException) {
            invoke.reject("not a Bluetooth address: ${args.id}", "invalid_argument")
            return
        }
        sessions.remove(args.id)?.close()
        val session = BleSession(activity, device, args.onEvent) { sessions.remove(args.id) }
        sessions[args.id] = session
        session.connect(invoke)
    }

    @Command
    fun bleRead(invoke: Invoke) {
        val args = invoke.parseArgs(CharArgs::class.java)
        val session = sessions[args.id] ?: return invoke.reject("not connected", "not_connected")
        session.read(UUID.fromString(args.uuid), invoke)
    }

    @Command
    fun bleWrite(invoke: Invoke) {
        val args = invoke.parseArgs(WriteArgs::class.java)
        val session = sessions[args.id] ?: return invoke.reject("not connected", "not_connected")
        session.write(UUID.fromString(args.uuid), Base64.decode(args.value, Base64.NO_WRAP), invoke)
    }

    @Command
    fun bleDisconnect(invoke: Invoke) {
        val args = invoke.parseArgs(IdArgs::class.java)
        sessions.remove(args.id)?.close()
        invoke.resolve()
    }

    // ---- WiFi (SPEC §6.2) ----------------------------------------------

    @Command
    fun wifiRequest(invoke: Invoke) {
        val args = invoke.parseArgs(WifiRequestArgs::class.java)
        wifi.request(args.ssid, args.password, args.onEvent)
        invoke.resolve()
    }

    @Command
    fun wifiRelease(invoke: Invoke) {
        wifi.release()
        invoke.resolve()
    }

    // ---- LAN sync discovery (L9 task 7) --------------------------------

    @Command
    fun multicastAcquire(invoke: Invoke) {
        if (multicastLock == null) {
            val wm = activity.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            multicastLock = wm.createMulticastLock("idl1-sync").apply {
                setReferenceCounted(false)
                acquire()
            }
        }
        invoke.resolve()
    }

    @Command
    fun multicastRelease(invoke: Invoke) {
        multicastLock?.release()
        multicastLock = null
        invoke.resolve()
    }
}
