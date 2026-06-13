import React, { useState, useEffect, useRef } from "react";
import { Terminal, Play, Square, Download, ExternalLink, CheckCircle, AlertTriangle, Info, Copy, Check, Plane, WifiOff } from "lucide-react";

export default function BridgeLauncher() {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [bridgeData, setBridgeData] = useState<any>(null);
  const [serverStatus, setServerStatus] = useState<{ running: boolean; pid: number | null; logLines: string[] }>({ running: false, pid: null, logLines: [] });
  const [bridgeLogs, setBridgeLogs] = useState<string[]>([]);
  const [logsCleared, setLogsCleared] = useState<boolean>(false);
  const [bridgeStopRequested, setBridgeStopRequested] = useState<boolean>(false);
  const [logConnected, setLogConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logSourceRef = useRef<EventSource | null>(null);

  const connectLogStream = () => {
    if (logSourceRef.current) return;
    const source = new EventSource("/api/bridge/logs");

    source.onopen = () => {
      setLogConnected(true);
    };

    source.onmessage = (event) => {
      setLogConnected(true);
      try {
        const payload = JSON.parse(event.data);
        if (Array.isArray(payload?.lines)) {
          setBridgeLogs((prev) => [...prev, ...payload.lines].slice(-200));
        } else if (payload?.line) {
          setBridgeLogs((prev) => [...prev, payload.line].slice(-200));
        }
      } catch (err) {
        setBridgeLogs((prev) => [...prev, String(event.data)].slice(-200));
      } finally {
        setLogsCleared(false);
      }
    };

    source.onerror = () => {
      setLogConnected(false);
      source.close();
      if (logSourceRef.current === source) {
        logSourceRef.current = null;
      }
      setTimeout(() => {
        connectLogStream();
      }, 1500);
    };

    logSourceRef.current = source;
  };

  // Poll the Python bridge's own HTTP server on port 5912
  const pollBridge = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch("http://127.0.0.1:5912/", {
        mode: "cors",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        setBridgeData(data);
        if (!bridgeStopRequested) {
          setIsConnected(true);
        }
        setIsStarting(false);
        setError(null);
      } else {
        setIsConnected(false);
        setBridgeData(null);
      }
    } catch (e) {
      setIsConnected(false);
      setBridgeData(null);
    }
  };

  useEffect(() => {
    pollBridge();
    pollIntervalRef.current = setInterval(pollBridge, 2000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (logSourceRef.current) {
        logSourceRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    const fetchServerStatus = async () => {
      try {
        const res = await fetch("/api/bridge/status");
        if (res.ok) {
          const data = await res.json();
          setServerStatus({
            running: !!data.running,
            pid: data.pid ?? null,
            logLines: Array.isArray(data.logLines) ? data.logLines : [],
          });
        }
      } catch (e) {
        // ignore status fetch failures
      }
    };

    fetchServerStatus();
    const statusInterval = setInterval(fetchServerStatus, 2000);

    connectLogStream();

    return () => {
      clearInterval(statusInterval);
      if (logSourceRef.current) {
        logSourceRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (!logsCleared && serverStatus.logLines.length > 0 && bridgeLogs.length === 0) {
      setBridgeLogs(serverStatus.logLines.slice(-200));
    }
    if (serverStatus.running) {
      setBridgeStopRequested(false);
    }
  }, [serverStatus.logLines, bridgeLogs.length, logsCleared, serverStatus.running]);

  const handleStart = async () => {
    setError(null);
    setIsStarting(true);
    try {
      const res = await fetch("/api/bridge/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Failed to start bridge.");
        setIsStarting(false);
      } else {
        setServerStatus((prev) => ({ ...prev, running: true, pid: data.pid ?? prev.pid }));
        setError(null);
        setLogsCleared(false);
        setBridgeLogs([]);
        setBridgeStopRequested(false);
        setLogConnected(false);
        if (logSourceRef.current) {
          logSourceRef.current.close();
          logSourceRef.current = null;
        }
        setTimeout(() => {
          connectLogStream();
        }, 300);
      }
      // Poll and SSE will detect when the bridge comes online.
    } catch (e: any) {
      setError(e.message || "Failed to communicate with server.");
      setIsStarting(false);
    }
  };

  const handleStop = async () => {
    setError(null);
    try {
      const res = await fetch("/api/bridge/stop", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Failed to stop bridge.");
      } else {
        setServerStatus((prev) => ({ ...prev, running: false, pid: null }));
        setIsConnected(false);
        setBridgeData(null);
        setLogConnected(false);
        setBridgeLogs([]);
        setLogsCleared(false);
        setBridgeStopRequested(true);
        if (logSourceRef.current) {
          logSourceRef.current.close();
          logSourceRef.current = null;
        }
      }
    } catch (e: any) {
      setError(e.message || "Failed to communicate with server.");
    }
  };

  const handleClearLogs = async () => {
    try {
      await fetch("/api/bridge/logs/clear", { method: "POST" });
    } catch (e) {
      // ignore, still clear locally
    }
    setBridgeLogs([]);
    setLogsCleared(true);
  };

  const handleCopyCommand = () => {
    const cmd = "cd bridge && python msfs_bridge.py";
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownloadScript = () => {
    window.open("/api/bridge/python-code", "_blank");
  };

  const bridgeOnline = serverStatus.running && isConnected && !bridgeStopRequested;

  return (
    <div className="flex flex-col h-full bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-950/60 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <span className="font-display font-bold text-sm tracking-wide">BRIDGE LAUNCHER</span>
        </div>
        <div className="flex items-center gap-2">
          {bridgeOnline ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              CONNECTED
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-zinc-500 font-mono">
              <WifiOff className="w-3 h-3" />
              DISCONNECTED
            </span>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="px-4 py-3 border-b border-zinc-800 space-y-3">
        <div className="flex items-center gap-2">
          {!serverStatus.running ? (
            <button
              onClick={handleStart}
              disabled={isStarting}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:cursor-wait text-white text-xs font-bold font-mono rounded transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              {isStarting ? "STARTING..." : "START BRIDGE"}
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold font-mono rounded transition-colors cursor-pointer"
            >
              <Square className="w-3.5 h-3.5" />
              STOP BRIDGE
            </button>
          )}
          <button
            onClick={handleDownloadScript}
            className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono rounded transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            DOWNLOAD
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 px-3 py-2 bg-red-950/50 border border-red-800 rounded text-xs text-red-300 font-mono">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Connection Status */}
        <div className={`rounded-lg border p-4 ${bridgeOnline ? "border-emerald-800 bg-emerald-950/20" : "border-zinc-700 bg-zinc-800/50"}`}>
          <div className="flex items-start gap-3">
            {bridgeOnline ? (
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div>
              <h3 className={`text-sm font-bold ${bridgeOnline ? "text-emerald-300" : "text-amber-300"}`}>
                {bridgeOnline ? "Bridge Connected" : isStarting ? "Starting Bridge..." : "Bridge Not Running"}
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                {bridgeOnline
                  ? "Telemetry data is being received from MSFS 2020."
                  : serverStatus.running
                    ? "Bridge launched successfully; waiting for MSFS telemetry to arrive."
                    : isStarting
                      ? "Starting the bridge and waiting for it to come online..."
                      : "Click START BRIDGE to launch the Python telemetry bridge."}
              </p>
              {serverStatus.pid !== null && (
                <p className="text-[10px] text-zinc-500 mt-1">Bridge PID: {serverStatus.pid}</p>
              )}
            </div>
          </div>
        </div>

        {/* Live Telemetry */}
        {bridgeOnline && bridgeData && (
          <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Plane className="w-3.5 h-3.5" />
              Live Telemetry
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-zinc-900 rounded p-2.5">
                <div className="text-[10px] text-zinc-500 uppercase">Position</div>
                <div className="text-xs text-zinc-200 font-mono mt-0.5">
                  {bridgeData.latitude?.toFixed(4)}, {bridgeData.longitude?.toFixed(4)}
                </div>
              </div>
              <div className="bg-zinc-900 rounded p-2.5">
                <div className="text-[10px] text-zinc-500 uppercase">Altitude</div>
                <div className="text-xs text-zinc-200 font-mono mt-0.5">
                  {Math.round(bridgeData.altitude || 0)} ft
                </div>
              </div>
              <div className="bg-zinc-900 rounded p-2.5">
                <div className="text-[10px] text-zinc-500 uppercase">Heading</div>
                <div className="text-xs text-zinc-200 font-mono mt-0.5">
                  {Math.round(bridgeData.heading || 0)}°
                </div>
              </div>
              <div className="bg-zinc-900 rounded p-2.5">
                <div className="text-[10px] text-zinc-500 uppercase">Speed</div>
                <div className="text-xs text-zinc-200 font-mono mt-0.5">
                  {Math.round(bridgeData.airspeed || 0)} kts
                </div>
              </div>
              <div className="bg-zinc-900 rounded p-2.5">
                <div className="text-[10px] text-zinc-500 uppercase">Ground Speed</div>
                <div className="text-xs text-zinc-200 font-mono mt-0.5">
                  {Math.round(bridgeData.groundSpeed || 0)} kts
                </div>
              </div>
              <div className="bg-zinc-900 rounded p-2.5">
                <div className="text-[10px] text-zinc-500 uppercase">Vertical Speed</div>
                <div className="text-xs text-zinc-200 font-mono mt-0.5">
                  {Math.round(bridgeData.verticalSpeed || 0)} fpm
                </div>
              </div>
              <div className="bg-zinc-900 rounded p-2.5 col-span-2">
                <div className="text-[10px] text-zinc-500 uppercase">Aircraft</div>
                <div className="text-xs text-zinc-200 font-mono mt-0.5 truncate">
                  {bridgeData.aircraftType || "Unknown"}
                </div>
              </div>
              {bridgeData.fuelPercent !== undefined && (
                <div className="bg-zinc-900 rounded p-2.5">
                  <div className="text-[10px] text-zinc-500 uppercase">Fuel</div>
                  <div className="text-xs text-zinc-200 font-mono mt-0.5">
                    {Math.round(bridgeData.fuelPercent)}%
                  </div>
                </div>
              )}
              {bridgeData.gear && (
                <div className="bg-zinc-900 rounded p-2.5">
                  <div className="text-[10px] text-zinc-500 uppercase">Gear</div>
                  <div className="text-xs text-zinc-200 font-mono mt-0.5">
                    {bridgeData.gear}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Manual Start Instructions */}
        {!isConnected && !isStarting && (
          <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Info className="w-3.5 h-3.5" />
              Manual Start (if auto-start fails)
            </h3>
            <ol className="space-y-2 text-xs text-zinc-300">
              <li className="flex gap-2">
                <span className="shrink-0 w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] font-bold">1</span>
                <span>Open a terminal (PowerShell or Command Prompt)</span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] font-bold">2</span>
                <span>Run the bridge script:</span>
              </li>
            </ol>
            <div className="mt-3 bg-zinc-900 rounded p-3 font-mono text-[11px] relative">
              <code className="text-emerald-300">cd bridge &amp;&amp; python msfs_bridge.py</code>
              <button
                onClick={handleCopyCommand}
                className="absolute top-2 right-2 p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors cursor-pointer"
                title="Copy command"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-zinc-400" />}
              </button>
            </div>
            <div className="mt-3 p-2.5 bg-amber-950/30 border border-amber-800/50 rounded text-[11px] text-amber-300">
              <strong>Prerequisites:</strong> <code className="bg-zinc-800 px-1 rounded">pip install SimConnect requests</code>. MSFS 2020 must be running.
            </div>
          </div>
        )}

        {/* Connection Info */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
          <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide mb-2">Connection Details</h4>
          <div className="space-y-1 text-[11px] font-mono text-zinc-400">
            <div className="flex justify-between">
              <span>Bridge URL:</span>
              <span className="text-zinc-300">http://127.0.0.1:5912/</span>
            </div>
            <div className="flex justify-between">
              <span>Process Status:</span>
              <span className={serverStatus.running ? "text-emerald-400" : "text-red-400"}>
                {serverStatus.running ? "Running" : "Stopped"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Bridge Reachable:</span>
              <span className={isConnected ? "text-emerald-400" : "text-red-400"}>
                {isConnected ? "Yes" : "No"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Log stream:</span>
              <span className={logConnected ? "text-emerald-400" : "text-amber-400"}>
                {logConnected ? "Connected" : "Disconnected"}
              </span>
            </div>
          </div>
        </div>

        {/* Bridge Logs */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Bridge Logs</h4>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-500">{bridgeLogs.length} lines</span>
              <button
                onClick={handleClearLogs}
                disabled={bridgeLogs.length === 0}
                className={`text-[10px] px-2 py-1 rounded font-mono transition-colors ${bridgeLogs.length === 0 ? "bg-zinc-800 text-zinc-600 cursor-not-allowed" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"}`}
              >
                CLEAR
              </button>
            </div>
          </div>
          <div className="h-40 overflow-y-auto rounded bg-zinc-950 p-3 font-mono text-[11px] leading-5 text-zinc-300">
            {bridgeLogs.length === 0 ? (
              <div className="text-zinc-500">Waiting for logs from the bridge...</div>
            ) : (
              bridgeLogs.map((line, index) => (
                <div key={`${line}-${index}`} className="whitespace-pre-wrap break-words pb-0.5">
                  {line}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
