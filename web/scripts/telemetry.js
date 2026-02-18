'use strict';
/**
 * telemetry.js — Structured runtime telemetry for Complyze proxy
 *
 * Features
 * ─────────
 *  • Rolling JSONL log files (default 10 MB / file, 5 files kept)
 *  • Startup snapshot: OS, Node, network interface, proxy state
 *  • Performance metrics: inspection latency (text + attachment),
 *    process memory, process CPU utilisation
 *  • Optional remote log forwarding via TELEMETRY_REMOTE_URL
 *
 * Environment knobs
 * ─────────────────
 *  TELEMETRY_MAX_FILE_MB  – max bytes before rotation   (default 10)
 *  TELEMETRY_MAX_FILES    – rotated files to keep        (default 5)
 *  TELEMETRY_FLUSH_MS     – metrics flush interval (ms)  (default 30000)
 *  TELEMETRY_REMOTE_URL   – POST endpoint for remote log forwarding
 *  TELEMETRY_REMOTE_BATCH – entries per remote POST      (default 50)
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');

// ─── Configuration ────────────────────────────────────────────────────────────

const LOG_DIR        = path.join(__dirname, '..', 'logs');
const LOG_BASENAME   = 'proxy-telemetry';
const MAX_FILE_BYTES = parseInt(process.env.TELEMETRY_MAX_FILE_MB  || '10', 10) * 1024 * 1024;
const MAX_FILES      = parseInt(process.env.TELEMETRY_MAX_FILES    || '5',  10);
const FLUSH_INTERVAL = parseInt(process.env.TELEMETRY_FLUSH_MS     || '30000', 10);
const REMOTE_URL     = process.env.TELEMETRY_REMOTE_URL  || null;
const REMOTE_BATCH   = parseInt(process.env.TELEMETRY_REMOTE_BATCH || '50', 10);
const REMOTE_ENABLED = !!REMOTE_URL;

// ─── Rolling file writer ──────────────────────────────────────────────────────

let _logPath   = null;
let _logStream = null;
let _logBytes  = 0;

function _currentLogPath() {
    return path.join(LOG_DIR, `${LOG_BASENAME}.jsonl`);
}

function _openStream() {
    try {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    } catch { /* directory already exists */ }
    _logPath  = _currentLogPath();
    _logBytes = fs.existsSync(_logPath) ? (fs.statSync(_logPath).size || 0) : 0;
    _logStream = fs.createWriteStream(_logPath, { flags: 'a' });
    _logStream.on('error', (err) => {
        console.error(`[TELEMETRY] Stream error: ${err.message}`);
        _logStream = null;
    });
}

function _rotateIfNeeded() {
    if (_logBytes < MAX_FILE_BYTES) return;

    if (_logStream) {
        try { _logStream.end(); } catch { }
        _logStream = null;
    }

    // Shift existing rotated files: .4 → .5, .3 → .4, …, .1 → .2
    for (let i = MAX_FILES - 2; i >= 1; i--) {
        const from = path.join(LOG_DIR, `${LOG_BASENAME}.${i}.jsonl`);
        const to   = path.join(LOG_DIR, `${LOG_BASENAME}.${i + 1}.jsonl`);
        if (fs.existsSync(from)) {
            try { fs.renameSync(from, to); } catch { }
        }
    }

    // Rotate current active file → .1
    const rotatedPath = path.join(LOG_DIR, `${LOG_BASENAME}.1.jsonl`);
    try {
        if (fs.existsSync(_logPath)) fs.renameSync(_logPath, rotatedPath);
    } catch { }

    // Drop the oldest file if we are over the limit
    const oldest = path.join(LOG_DIR, `${LOG_BASENAME}.${MAX_FILES}.jsonl`);
    if (fs.existsSync(oldest)) { try { fs.unlinkSync(oldest); } catch { } }

    _openStream();
}

function _writeEntry(entry) {
    try {
        if (!_logStream) _openStream();
        _rotateIfNeeded();
        const line = JSON.stringify(entry) + '\n';
        _logStream.write(line);
        _logBytes += Buffer.byteLength(line, 'utf8');
    } catch (err) {
        // Never let telemetry failures propagate to the proxy
        console.error(`[TELEMETRY] Write error: ${err.message}`);
    }
}

// ─── Remote forwarding (best-effort, optional) ────────────────────────────────

let _remoteBuf = [];

async function _flushRemote() {
    if (!REMOTE_ENABLED || _remoteBuf.length === 0) return;
    const batch = _remoteBuf.splice(0, REMOTE_BATCH);
    try {
        await fetch(REMOTE_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ events: batch }),
            signal:  AbortSignal.timeout(5000),
        });
    } catch {
        // Remote logging is fire-and-forget; silently discard failures
    }
}

// ─── Core log function ────────────────────────────────────────────────────────

/**
 * Write a structured telemetry entry to the rolling log file.
 * @param {string} event  - Machine-readable event name (e.g. 'proxy_start')
 * @param {object} data   - Arbitrary JSON-serialisable metadata
 */
function log(event, data = {}) {
    const entry = { ts: new Date().toISOString(), event, ...data };
    _writeEntry(entry);
    if (REMOTE_ENABLED) {
        _remoteBuf.push(entry);
        if (_remoteBuf.length >= REMOTE_BATCH) _flushRemote().catch(() => {});
    }
}

// ─── System info ──────────────────────────────────────────────────────────────

function _networkIfaceInfo() {
    const ifaces  = os.networkInterfaces();
    const primary = Object.entries(ifaces)
        .flatMap(([name, addrs]) => addrs.map(a => ({ name, ...a })))
        .find(a => !a.internal && a.family === 'IPv4');

    if (!primary) return { network_iface: 'none', iface_type: 'unknown' };

    let ifaceType = 'other';
    if (/wlan|wlp|wifi/i.test(primary.name))      ifaceType = 'wifi';
    else if (/eth|enp|ens|em\d/i.test(primary.name)) ifaceType = 'ethernet';
    else if (/tun|vpn|utun/i.test(primary.name))   ifaceType = 'vpn';

    return { network_iface: primary.name, iface_type: ifaceType };
}

function _systemInfo() {
    return {
        os_platform:     os.platform(),
        os_release:      os.release(),
        os_type:         os.type(),
        os_arch:         os.arch(),
        node_version:    process.version,
        cpu_count:       os.cpus().length,
        total_memory_mb: Math.round(os.totalmem() / (1024 * 1024)),
        hostname:        os.hostname(),
        ..._networkIfaceInfo(),
    };
}

// ─── Metrics accumulator ──────────────────────────────────────────────────────

const _metrics = {
    text:       { count: 0, total_ms: 0, min_ms: Infinity, max_ms: 0 },
    attachment: { count: 0, total_ms: 0, min_ms: Infinity, max_ms: 0 },
    _prevCpu:      process.cpuUsage(),
    _prevCpuWallMs: Date.now(),
};

/**
 * Record one inspection latency sample.
 * @param {number} ms       - Wall-clock milliseconds taken for the inspection
 * @param {'text'|'attachment'} type
 */
function recordInspectionTime(ms, type) {
    const bucket = type === 'attachment' ? _metrics.attachment : _metrics.text;
    bucket.count++;
    bucket.total_ms += ms;
    if (ms < bucket.min_ms) bucket.min_ms = ms;
    if (ms > bucket.max_ms) bucket.max_ms = ms;
}

function _cpuPercent() {
    const wallMs  = Date.now() - _metrics._prevCpuWallMs;
    const usage   = process.cpuUsage(_metrics._prevCpu);      // microseconds delta
    _metrics._prevCpu      = process.cpuUsage();
    _metrics._prevCpuWallMs = Date.now();
    if (wallMs <= 0) return 0;
    const cpuMs = (usage.user + usage.system) / 1000;         // μs → ms
    return Math.min(100 * os.cpus().length, +(cpuMs / wallMs * 100).toFixed(1));
}

function _memStats() {
    const m = process.memoryUsage();
    return {
        heap_used_mb:  +(m.heapUsed  / (1024 * 1024)).toFixed(1),
        heap_total_mb: +(m.heapTotal / (1024 * 1024)).toFixed(1),
        rss_mb:        +(m.rss       / (1024 * 1024)).toFixed(1),
        external_mb:   +(m.external  / (1024 * 1024)).toFixed(1),
    };
}

function _bucketSummary(b) {
    return {
        count:  b.count,
        avg_ms: b.count > 0 ? +(b.total_ms / b.count).toFixed(1) : null,
        min_ms: b.count > 0 ? b.min_ms : null,
        max_ms: b.count > 0 ? b.max_ms : null,
    };
}

function _resetBuckets() {
    _metrics.text       = { count: 0, total_ms: 0, min_ms: Infinity, max_ms: 0 };
    _metrics.attachment = { count: 0, total_ms: 0, min_ms: Infinity, max_ms: 0 };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Emit a structured startup record with OS, Node, network, and proxy state.
 * Call this once inside server.listen() callback.
 */
function logStartup(proxyPort, monitorMode) {
    log('proxy_start', {
        ..._systemInfo(),
        proxy_port:      proxyPort,
        monitor_mode:    monitorMode,
        fail_open:       process.env.FAIL_OPEN !== 'false',
        remote_logging:  REMOTE_ENABLED,
        log_file:        _currentLogPath(),
    });
}

/**
 * Flush accumulated performance metrics to the log and reset buckets.
 * @param {number} proxyPort
 * @param {string} monitorMode
 */
function flushMetrics(proxyPort, monitorMode) {
    log('metrics_snapshot', {
        proxy_port:            proxyPort,
        monitor_mode:          monitorMode,
        cpu_percent:           _cpuPercent(),
        ..._memStats(),
        text_inspection:       _bucketSummary(_metrics.text),
        attachment_inspection: _bucketSummary(_metrics.attachment),
    });
    _resetBuckets();
}

/**
 * Start the periodic metrics flush timer.
 * @param {number}   proxyPort
 * @param {function} getModeStr  - Zero-arg function returning current mode string
 */
function startMetricsFlush(proxyPort, getModeStr) {
    const timer = setInterval(() => {
        _flushRemote().catch(() => {});
        flushMetrics(proxyPort, getModeStr());
    }, FLUSH_INTERVAL);
    timer.unref(); // don't prevent clean process exit
}

module.exports = { log, logStartup, recordInspectionTime, flushMetrics, startMetricsFlush };
