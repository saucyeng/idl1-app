package com.saucyeng.idl1.device

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter

/**
 * The Android half of local crash reports (crash reports spec, 2026-10-21;
 * C3 §3.13). Rust owns the directory and lists the reports; this side adds
 * what Rust can't see: an uncaught Kotlin exception, and — at the next
 * launch — any other way the last run died (a native crash, an ANR), from
 * Android's own exit records. Nothing here sends anything anywhere.
 */
internal object CrashReports {
    /** Set by [setup]; the uncaught handler writes nowhere until then. */
    @Volatile private var dir: File? = null
    @Volatile private var handlerInstalled = false

    /** A report within this many ms of an exit record is the same crash. */
    private const val SAME_CRASH_MS = 10_000L
    private const val MAX_TRACE_BYTES = 32 * 1024
    private const val SEEN_FILE = "exit-seen"

    /** Installs the uncaught-exception handler once, chained to the one before. */
    fun installHandler() {
        if (handlerInstalled) return
        handlerInstalled = true
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            runCatching { writeKotlinReport(thread, error) }
            previous?.uncaughtException(thread, error)
        }
    }

    private fun header(kind: String, atMs: Long): String =
        "idl1 crash report ($kind)\n" +
            "android: ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT}), ${Build.MANUFACTURER} ${Build.MODEL}\n" +
            "time: $atMs ms since the Unix epoch\n"

    private fun writeKotlinReport(thread: Thread, error: Throwable) {
        val d = dir ?: return
        val atMs = System.currentTimeMillis()
        val trace = StringWriter().also { error.printStackTrace(PrintWriter(it)) }.toString()
        File(d, "kotlin-$atMs.txt").writeText(header("Kotlin exception", atMs) + "thread: ${thread.name}\n\n$trace")
    }

    /** Records where reports go, then turns exit records newer than the last
     *  one seen into reports. Safe to call more than once. */
    fun setup(context: Context, path: String) {
        val d = File(path).apply { mkdirs() }
        dir = d
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val seenFile = File(d, SEEN_FILE)
        val lastSeen = runCatching { seenFile.readText().trim().toLong() }.getOrDefault(0L)
        val exits = am.getHistoricalProcessExitReasons(context.packageName, 0, 5)
        var newest = lastSeen
        for (exit in exits) {
            if (exit.timestamp <= lastSeen) continue
            newest = maxOf(newest, exit.timestamp)
            val kind = when (exit.reason) {
                ApplicationExitInfo.REASON_CRASH -> "app crash"
                ApplicationExitInfo.REASON_CRASH_NATIVE -> "native crash"
                ApplicationExitInfo.REASON_ANR -> "not responding (ANR)"
                else -> continue
            }
            if (hasReportNear(d, exit.timestamp)) continue
            val body = StringBuilder(header(kind, exit.timestamp))
            body.append("description: ${exit.description ?: "(none)"}\n")
            body.append("status: ${exit.status}, importance: ${exit.importance}\n")
            // An ANR's trace is text; a native crash's is a binary tombstone,
            // left out (the Rust panic hook already covers Rust panics).
            if (exit.reason == ApplicationExitInfo.REASON_ANR) {
                runCatching {
                    exit.traceInputStream?.use { s ->
                        val bytes = s.readBytes()
                        body.append("\ntrace:\n").append(String(bytes, 0, minOf(bytes.size, MAX_TRACE_BYTES)))
                    }
                }
            }
            File(d, "exit-${exit.timestamp}.txt").writeText(body.toString())
        }
        if (newest > lastSeen) seenFile.writeText(newest.toString())
    }

    /** Whether a panic or Kotlin report (pending or already seen) was
     *  written within [SAME_CRASH_MS] of `atMs`. */
    private fun hasReportNear(d: File, atMs: Long): Boolean {
        val names = (d.list()?.toList() ?: emptyList()) + (File(d, "seen").list()?.toList() ?: emptyList())
        return names.any { name ->
            val ms = Regex("^(panic|kotlin)-(\\d+)\\.txt$").find(name)?.groupValues?.get(2)?.toLongOrNull()
            ms != null && kotlin.math.abs(ms - atMs) <= SAME_CRASH_MS
        }
    }
}
