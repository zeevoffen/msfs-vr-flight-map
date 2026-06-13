import React, { useState, useEffect, useRef, useCallback } from "react";
import { Play, Square, Terminal, Trash2, ScrollText, AlertTriangle } from "lucide-react";

export default function BridgeLauncher() {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pythonPath, setPythonPath] = useState<string>(() => {
    return localStorage.getItem("msfs_python_path") || "C:\\Users\\zeevi\\AppData\\Local\\Programs\\Python\\Python314\\python.exe";
  });
  const logEndRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastLogCountRef = useRef<number>(0);

  // Auto-scroll logs to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Poll for new logs from the server
  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    lastLogCountRef.current = logs.length;
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/bridge/status");
        if (res.ok) {
          const data = await res.json();
          setIsRunning(data.running);
          if (data.logLines && data.logLines.length > lastLogCountRef.current) {
            const newLines = data.logLines.slice(lastLogCountRef.current);
            setLogs((prev) => {
              const next = [...prev, ...newLines];
              if (next.length > 500) next.splice(0, next.length - 500);
              return next;
            });
            lastLogCountRef.current = data.logLines.length;
          }
        }
      } catch (e) {
        // ignore poll errors
      }
    }, 1000);
  }, [logs.length]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // On mount: check status and start polling
  useEffect(() => {
    fetchStatus();
    startPolling();
    return () => stopPolling();
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/bridge/status");
      if (res.ok) {
        const data = await res.json();
        setIsRunning(data.running);
        if (data.logLines) {
          setLogs(data.logLines);
          lastLogCountRef.current = data.logLines.length;
        }
      }
    } catch (e) {
      // Server might not be ready yet
    }
  };

  const handleStart = async () => {
    setError(null);
    setLogs([]);
    lastLogCountRef.current = 0;
    try {
      const res = await fetch("/api/bridge/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pythonPath }),
      });
      const data = await res.json();
      if (res.ok) {
        setIsRunning(true);
        startPolling();
      } else {
        setError(data.message || "Failed to start bridge.");
        setIsRunning(false);
      }
    } catch (e: any) {
      setError(e.message || "Failed to communicate with server.");
      setIsRunning(false);
    }
  };

  const handleStop = async () => {
    setError(null);
    try {
      const res = await fetch("/api/bridge/stop", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setIsRunning(false);
        await fetchStatus();
      } else {
        setError(data.message || "Failed to stop bridge.");
      }
    } catch (e: any) {
      setError(e.message || "Failed to communicate with server.");
    }
  };

  const handleClearLogs = () => {
    setLogs([]);
    lastLogCountRef.current = 0;
  };

  const getLogLineColor = (line: string) => {
    if (line.includes("[STDERR]")) return "text-red-400";
    if (line.includes("[ERROR]") || line.includes("CRITICAL")) return "text-red-400";
    if (line.includes("[STDOUT]")) return "text-green-400";
    if (line.includes("[SYSTEM]")) return "text-cyan-400";
    if (line.includes("Connected") || line.includes("LIVE") || line.includes("ACTIVE")) return "text-emerald-400";
    if (line.includes("Waiting") || line.includes("Offline") || line.includes("Failed") || line.includes("exited")) return "text-amber-400";
    return "text-zinc-300";
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-950/60 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <span className="font-display font-bold text-sm tracking-wide">BRIDGE LAUNCHER</span>
        </div>
        <div className="flex items-center gap-2">
          {isRunning ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              RUNNING
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-zinc-500 font-mono">
              <span className="w-2 h-2 rounded-full bg-zinc-600" />
              STOPPED
            </span>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="px-4 py-3 border-b border-zinc-800 space-y-3">
        {/* Python path input */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-400 font-mono whitespace-nowrap">Python:</label>
          <input
            type="text"
            value={pythonPath}
            onChange={(e) => setPythonPath(e.target.value)}
            disabled={isRunning}
            className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="python.exe"
          />
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {!isRunning ? (
            <button
              onClick={handleStart}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold font-mono rounded transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              START BRIDGE
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
            onClick={handleClearLogs}
            className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono rounded transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            CLEAR
          </button>

          <div className="flex-1" />

          <span className="text-[10px] text-zinc-500 font-mono">
            {logs.length} lines
          </span>
        </div>

        {/* Error display */}
        {error && (
          <div className="flex items-start gap-2 px-3 py-2 bg-red-950/50 border border-red-800 rounded text-xs text-red-300 font-mono">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Log output */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-2">
            <ScrollText className="w-8 h-8" />
            <span className="text-xs">No logs yet. Start the bridge to see output.</span>
          </div>
        ) : (
          logs.map((line, idx) => (
            <div key={idx} className={`${getLogLineColor(line)} break-all whitespace-pre-wrap`}>
              {line}
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}
