package com.saucyeng.idl1.device

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothStatusCodes
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.util.Base64
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import java.util.ArrayDeque
import java.util.UUID

private val STATUS_UUID: UUID = UUID.fromString("0000ff04-0000-1000-8000-00805f9b34fb")
private val CONTROL_UUID: UUID = UUID.fromString("0000ff03-0000-1000-8000-00805f9b34fb")
private val CCCD_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

/** SPEC §14b.2: every GATT operation is bounded by this, ms. */
private const val OP_TIMEOUT_MS = 10_000L
private const val MTU_REQUEST = 517

/**
 * One GATT link to one logger (SPEC §7.4, §14b.2). Android allows one
 * outstanding GATT operation per link, so every operation — the connect
 * sequence's steps included — goes through [queue] on a private thread,
 * one at a time, each bounded by [OP_TIMEOUT_MS]. Device answers are never
 * retried here: a write resolves with whatever status the device returned.
 */
@SuppressLint("MissingPermission")
internal class BleSession(
    private val context: Context,
    private val device: BluetoothDevice,
    private val events: Channel,
    private val onClosed: () -> Unit,
) {
    private val thread = HandlerThread("idl1-ble-${device.address}").apply { start() }
    private val handler = Handler(thread.looper)

    private var gatt: BluetoothGatt? = null
    private var mtu = 23
    private var closed = false

    /** The operation currently waiting on a GATT callback. */
    private var current: Op? = null
    private val queue = ArrayDeque<Op>()

    private class Op(
        val name: String,
        val start: () -> Boolean,
        val invoke: Invoke?,
    )

    // ---- connect sequence (SPEC §7.4) ---------------------------------

    private var connectInvoke: Invoke? = null
    private val connectTimeout = Runnable { failConnect("connect timed out") }

    fun connect(invoke: Invoke) = handler.post {
        connectInvoke = invoke
        handler.postDelayed(connectTimeout, OP_TIMEOUT_MS)
        gatt = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            device.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE)
        } else {
            device.connectGatt(context, false, callback)
        }
    }

    private fun stepDone() {
        handler.removeCallbacks(connectTimeout)
        handler.postDelayed(connectTimeout, OP_TIMEOUT_MS)
    }

    private fun failConnect(message: String) {
        handler.removeCallbacks(connectTimeout)
        connectInvoke?.reject(message, "connect_failed")
        connectInvoke = null
        close()
    }

    private fun finishConnect() {
        handler.removeCallbacks(connectTimeout)
        val name = device.name ?: ""
        connectInvoke?.resolve(JSObject().put("mtu", mtu).put("name", name))
        connectInvoke = null
    }

    private fun characteristic(uuid: UUID): BluetoothGattCharacteristic? =
        gatt?.getService(SERVICE_UUID)?.getCharacteristic(uuid)

    // ---- public operations ----------------------------------------------

    fun read(uuid: UUID, invoke: Invoke) = handler.post {
        val ch = characteristic(uuid) ?: return@post invoke.reject("characteristic $uuid not found", "not_found")
        enqueue(Op("read $uuid", { gatt?.readCharacteristic(ch) == true }, invoke))
    }

    fun write(uuid: UUID, value: ByteArray, invoke: Invoke) = handler.post {
        val ch = characteristic(uuid) ?: return@post invoke.reject("characteristic $uuid not found", "not_found")
        enqueue(Op("write $uuid", { writeWithResponse(ch, value) }, invoke))
    }

    fun close() = handler.post {
        if (closed) return@post
        closed = true
        current?.invoke?.reject("disconnected", "disconnected")
        current = null
        while (queue.isNotEmpty()) queue.poll()?.invoke?.reject("disconnected", "disconnected")
        gatt?.let {
            runCatching { it.disconnect() }
            runCatching { it.close() }
        }
        gatt = null
        events.send(JSObject().put("type", "disconnected").put("status", 0))
        onClosed()
        thread.quitSafely()
    }

    // ---- queue ------------------------------------------------------------

    private val opTimeout = Runnable {
        val op = current ?: return@Runnable
        current = null
        op.invoke?.reject("${op.name} timed out", "timeout")
        next()
    }

    private fun enqueue(op: Op) {
        queue.add(op)
        if (current == null) next()
    }

    private fun next() {
        if (closed) return
        val op = queue.poll() ?: return
        current = op
        if (!op.start()) {
            current = null
            op.invoke?.reject("${op.name} could not start", "gatt_busy")
            next()
            return
        }
        handler.postDelayed(opTimeout, OP_TIMEOUT_MS)
    }

    private fun complete(result: (Op) -> Unit) {
        val op = current ?: return
        handler.removeCallbacks(opTimeout)
        current = null
        result(op)
        next()
    }

    @Suppress("DEPRECATION")
    private fun writeWithResponse(ch: BluetoothGattCharacteristic, value: ByteArray): Boolean {
        val g = gatt ?: return false
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            g.writeCharacteristic(ch, value, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT) ==
                BluetoothStatusCodes.SUCCESS
        } else {
            ch.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
            ch.value = value
            g.writeCharacteristic(ch)
        }
    }

    @Suppress("DEPRECATION")
    private fun enableStatusNotifications(): Boolean {
        val g = gatt ?: return false
        val status = characteristic(STATUS_UUID) ?: return false
        if (!g.setCharacteristicNotification(status, true)) return false
        val cccd = status.getDescriptor(CCCD_UUID) ?: return false
        val enable = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            g.writeDescriptor(cccd, enable) == BluetoothStatusCodes.SUCCESS
        } else {
            cccd.value = enable
            g.writeDescriptor(cccd)
        }
    }

    private fun b64(bytes: ByteArray?): String = Base64.encodeToString(bytes ?: ByteArray(0), Base64.NO_WRAP)

    // ---- GATT callbacks (binder threads → our handler) ------------------

    private val callback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
            handler.post {
                if (newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
                    stepDone()
                    if (!g.requestMtu(MTU_REQUEST)) {
                        // MTU negotiation unavailable: carry on at the default.
                        if (!g.discoverServices()) failConnect("service discovery could not start")
                    }
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    if (connectInvoke != null) {
                        failConnect("connect failed (GATT status $status)")
                    } else if (!closed) {
                        events.send(JSObject().put("type", "disconnected").put("status", status))
                        closed = true
                        current?.invoke?.reject("disconnected", "disconnected")
                        current = null
                        while (queue.isNotEmpty()) queue.poll()?.invoke?.reject("disconnected", "disconnected")
                        runCatching { g.close() }
                        gatt = null
                        onClosed()
                        thread.quitSafely()
                    }
                }
            }
        }

        override fun onMtuChanged(g: BluetoothGatt, newMtu: Int, status: Int) {
            handler.post {
                if (status == BluetoothGatt.GATT_SUCCESS) mtu = newMtu
                if (connectInvoke != null) {
                    stepDone()
                    if (!g.discoverServices()) failConnect("service discovery could not start")
                }
            }
        }

        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
            handler.post {
                if (connectInvoke == null) return@post
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    failConnect("service discovery failed (GATT status $status)")
                    return@post
                }
                if (characteristic(CONTROL_UUID) == null || characteristic(STATUS_UUID) == null) {
                    failConnect("not an IDL0 logger: Control/Status characteristics missing")
                    return@post
                }
                stepDone()
                if (!enableStatusNotifications()) failConnect("enabling Status notifications failed")
            }
        }

        override fun onDescriptorWrite(g: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
            handler.post {
                if (connectInvoke == null) return@post
                if (status == BluetoothGatt.GATT_SUCCESS) finishConnect()
                else failConnect("enabling Status notifications failed (GATT status $status)")
            }
        }

        override fun onCharacteristicWrite(g: BluetoothGatt, ch: BluetoothGattCharacteristic, status: Int) {
            // Resolve with the raw status, whatever it is (SPEC §14b.2):
            // the device's §7.2 ACK codes arrive here.
            handler.post { complete { it.invoke?.resolve(JSObject().put("status", status)) } }
        }

        @Deprecated("API < 33 path")
        @Suppress("DEPRECATION")
        override fun onCharacteristicRead(g: BluetoothGatt, ch: BluetoothGattCharacteristic, status: Int) {
            val value = ch.value
            handler.post { completeRead(value, status) }
        }

        override fun onCharacteristicRead(
            g: BluetoothGatt,
            ch: BluetoothGattCharacteristic,
            value: ByteArray,
            status: Int
        ) {
            handler.post { completeRead(value, status) }
        }

        @Deprecated("API < 33 path")
        @Suppress("DEPRECATION")
        override fun onCharacteristicChanged(g: BluetoothGatt, ch: BluetoothGattCharacteristic) {
            val value = ch.value
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) notify(ch.uuid, value)
        }

        override fun onCharacteristicChanged(g: BluetoothGatt, ch: BluetoothGattCharacteristic, value: ByteArray) {
            notify(ch.uuid, value)
        }
    }

    private fun completeRead(value: ByteArray?, status: Int) = complete { op ->
        if (status == BluetoothGatt.GATT_SUCCESS) op.invoke?.resolve(JSObject().put("value", b64(value)))
        else op.invoke?.reject("read failed (GATT status $status)", "gatt_status_$status")
    }

    private fun notify(uuid: UUID, value: ByteArray?) {
        if (uuid == STATUS_UUID) events.send(JSObject().put("type", "status").put("value", b64(value)))
    }
}
