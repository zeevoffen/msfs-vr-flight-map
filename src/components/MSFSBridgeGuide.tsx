import React, { useState, useEffect } from "react";
import { Download, Terminal, Settings, RefreshCw, Cpu, Wifi, WifiOff, Eye, Glasses, MapPin, Compass, BookOpen, Copy, Check, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { Telemetry } from "../types";

interface BridgeGuideProps {
  telemetry: Telemetry | null;
  onResetTelemetry: () => void;
  mockActive: boolean;
  onToggleMock: () => void;
  localPcIp: string;
  onLocalPcIpChange: (ip: string) => void;
}

export default function MSFSBridgeGuide({
  telemetry,
  onResetTelemetry,
  mockActive,
  onToggleMock,
  localPcIp,
  onLocalPcIpChange,
}: BridgeGuideProps) {
  const isConnected = telemetry && telemetry.isConnected;
  const [guideTab, setGuideTab] = useState<"link" | "vr" | "openkneeboard">("link");
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pythonScriptText, setPythonScriptText] = useState<string>("# Loading script from server...");

  useEffect(() => {
    // Fetch the canonical bridge script code dynamically to guarantee perfect sync
    fetch("/api/bridge/python-code")
      .then((res) => res.text())
      .then((text) => setPythonScriptText(text))
      .catch((err) => {
        console.error("Failed to load python script template:", err);
        setPythonScriptText(`# Manual setup code backup:
# Please use the DOWNLOAD button above as it will always succeed.
# Wait a moment or reload if this text persists.`);
      });
  }, []);

  // Connection Diagnostics Loop
  const [localStatus, setLocalStatus] = useState<"checking" | "connected" | "offline" | "blocked">("checking");
  const [localData, setLocalData] = useState<any>(null);

  useEffect(() => {
    let active = true;
    const checkLoop = async () => {
      const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1800); // 1.8s timeout offers great stability on local socket queues
        // Clean trailing spaces or slash from IP
        const cleanIp = (localPcIp || "127.0.0.1").trim();
        const isLocal = cleanIp === "127.0.0.1" || cleanIp === "localhost";

        const res = await fetch(`http://${cleanIp}:5912/`, { 
          mode: "cors", 
          signal: controller.signal 
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          if (active) {
            setLocalStatus("connected");
            setLocalData(data);
          }
        } else {
          if (active) {
            // Browsers allow non-SSL localhost requests, so direct 127.0.0.1/localhost is NEVER blocked!
            // Mixed-content block is only applicable to custom WAN/LAN PC IP addresses (e.g. 192.168.x.x) under HTTPS
            setLocalStatus(isHttps && !isLocal ? "blocked" : "offline");
            setLocalData(null);
          }
        }
      } catch (e) {
        if (active) {
          const cleanIp = (localPcIp || "127.0.0.1").trim();
          const isLocal = cleanIp === "127.0.0.1" || cleanIp === "localhost";
          setLocalStatus(isHttps && !isLocal ? "blocked" : "offline");
          setLocalData(null);
        }
      }
    };

    checkLoop();
    const interval = setInterval(checkLoop, 2500);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [localPcIp]);

  return (
    <div className="bg-zinc-900 border-zinc-800 border-b lg:border-b-0 lg:border-r h-full overflow-y-auto flex flex-col" id="msfs_bridge_guide">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-950/60 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <span className="font-display font-bold text-sm tracking-wide">MSFS INTEGRATION DECK</span>
        </div>
      </div>

      {/* Guide Type Tabs */}
      <div className="grid grid-cols-3 bg-zinc-950 border-b border-zinc-800 text-[10px] font-bold font-mono">
        <button 
          onClick={() => setGuideTab("link")}
          className={`py-2 px-1 border-b-2 flex flex-col sm:flex-row items-center justify-center gap-1 transition-all ${
            guideTab === "link"
              ? "border-cyan-400 text-cyan-400 bg-zinc-900/40"
              : "border-transparent text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>1. LINK</span>
        </button>
        <button 
          onClick={() => setGuideTab("vr")}
          className={`py-2 px-1 border-b-2 flex flex-col sm:flex-row items-center justify-center gap-1 transition-all ${
            guideTab === "vr"
              ? "border-cyan-400 text-cyan-400 bg-zinc-900/40"
              : "border-transparent text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <Glasses className="w-3.5 h-3.5" />
          <span>2. VR PIN</span>
        </button>
        <button 
          onClick={() => setGuideTab("openkneeboard")}
          className={`py-2 px-1 border-b-2 flex flex-col sm:flex-row items-center justify-center gap-1 transition-all ${
            guideTab === "openkneeboard"
              ? "border-cyan-400 text-cyan-400 bg-zinc-900/40"
              : "border-transparent text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>3. KNEEBOARD</span>
        </button>
      </div>

      {/* Connection Indicator Ring */}
      <div className="p-3 bg-zinc-950/20 border-b border-zinc-800/60">
        <div className="flex items-center justify-between p-2.5 bg-zinc-950/80 rounded-xl border border-zinc-800">
          <div className="flex items-center gap-2">
            <span className={`relative flex h-2 w-2`}>
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isConnected ? "bg-emerald-400" : "bg-red-400"}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isConnected ? "bg-emerald-500" : "bg-red-500"}`}></span>
            </span>
            <div className="flex flex-col">
              <span className="text-[10px] font-mono text-zinc-500 font-extrabold uppercase tracking-widest leading-none">Cloud Feed Stream</span>
              <span className="text-[11px] font-bold text-zinc-200 leading-tight">
                {isConnected ? "ACTIVE FLIGHT LINKED" : "OFFLINE / NO STREAM DATA"}
              </span>
            </div>
          </div>
          
          {isConnected && (
            <button 
              onClick={onResetTelemetry}
              className="p-1 px-2 rounded bg-red-950/40 border border-red-900/30 text-red-400 hover:bg-red-900/20 text-[9px] font-mono transition-colors"
            >
              RESET FEED
            </button>
          )}
        </div>
      </div>

      {/* Main Guide Content */}
      <div className="p-4 flex-1 space-y-4">
        {guideTab === "link" && (
          /* MSFS Automated Flight PC Telemetry Link */
          <div className="space-y-4">
            <div className="text-[10px] text-zinc-500 font-extrabold uppercase tracking-widest flex items-center gap-1.5">
              <Wifi className="w-4 h-4 text-cyan-400" />
              <span>SimConnect Auto-sync Setup</span>
            </div>

            <p className="text-[11px] text-zinc-350 leading-relaxed -mt-1 bg-zinc-950/40 p-2.5 rounded border border-zinc-900">
              The map runs within a secure container server. To transmit your aircraft's precise latitude, longitude, and active flight plans automatically to your browser overlay, use our premium SimConnect telemetry bridge:
            </p>

            {/* Direct Flight PC IP Field */}
            <div className="bg-zinc-950/50 p-3.5 rounded-lg border border-zinc-850 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9.5px] font-bold text-zinc-400 uppercase tracking-wider">Flight Sim PC Network IP</span>
                <span className="text-[10px] font-mono flex items-center gap-1 text-zinc-500">
                  <Info className="w-3 h-3 text-cyan-400/60" />
                  Used to bypass browser sandbox
                </span>
              </div>
              <div className="flex gap-2">
                <input 
                  type="text"
                  value={localPcIp}
                  onChange={(e) => onLocalPcIpChange(e.target.value)}
                  placeholder="e.g. 127.0.0.1 or 192.168.1.50"
                  className="bg-black border border-zinc-800 text-zinc-200 font-mono text-xs px-2.5 py-1.5 rounded flex-1 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>

              {/* Advanced Diagnostics Status */}
              <div className="mt-2.5 pt-2 border-t border-zinc-900 flex items-center justify-between text-[10px] font-mono">
                <span className="text-zinc-500">Local Bridge (5912):</span>
                {localStatus === "checking" && (
                  <span className="text-cyan-400 flex items-center gap-1 animate-pulse">
                    <RefreshCw className="w-3 h-3 animate-spin" /> CHECKING DIAGNOSTICS...
                  </span>
                )}
                {localStatus === "connected" && (
                  <span className="text-emerald-400 font-bold flex items-center gap-1 bg-emerald-950/35 px-1.5 py-0.5 rounded border border-emerald-900/30">
                    <CheckCircle className="w-3 h-3 text-emerald-400" /> SYNCED (DIRECT LAN)
                  </span>
                )}
                {localStatus === "offline" && (
                  <span className="text-zinc-500 flex items-center gap-1">
                    <WifiOff className="w-3 h-3 text-zinc-500" /> NOT DETECTED (CLOUD MODE ON)
                  </span>
                )}
                {localStatus === "blocked" && (
                  <span className="text-amber-400 flex items-center gap-1 bg-amber-950/30 px-1.5 py-0.5 rounded border border-amber-900/30">
                    <AlertTriangle className="w-3 h-3 text-amber-500" /> HTTPS Mixed-Content Block
                  </span>
                )}
              </div>
              
              {localStatus === "blocked" && (
                <p className="text-[9.5px] text-amber-400/80 bg-amber-950/10 p-2 rounded border border-amber-900/20 leading-relaxed font-sans">
                  ⚠️ <strong>Browser Mixed Content Warning:</strong> Because this map page is secure (HTTPS) and your custom WAN IP is unencrypted (HTTP), the Chrome browser blocks direct LAN connection. To resolve, use <strong>127.0.0.1</strong> as the IP (browser-exempted), or proceed entirely through the Cloud bridge below.
                </p>
              )}
            </div>

            {/* Sandbox Redirect Help */}
            <div className="bg-amber-950/15 border border-amber-900/30 p-3 rounded-xl text-xs leading-relaxed space-y-1.5 font-sans">
              <span className="font-bold text-amber-400 flex items-center gap-1 text-[11px] uppercase tracking-wider">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> SECURE DEVELOPER COOKIE GATE
              </span>
              <p className="text-[10.5px] text-zinc-300">
                Are you seeing a <code>[REDIRECTION ERROR] __cookie_check.html</code> warning in your Python bridge terminal?
              </p>
              <p className="text-[10.5px] text-zinc-400">
                This is normal! The developer sandbox (<code>-dev-</code> URL) is a secure, private room that requires your Google account cookies. Terminal scripts do not have these cookies, so cloud posting gets redirected. <strong>Your map will still sync perfectly!</strong> You have two seamless options:
              </p>
              <ul className="list-disc pl-4 text-[10px] text-zinc-400 space-y-1 leading-snug">
                <li>
                  <strong className="text-zinc-200">Option A: Zero-Lag Local Direct Link (Recommended)</strong>: Make sure <code>127.0.0.1</code> is entered in the <i>Flight Sim PC Network IP</i> box above. Your browser will read coordinates directly from your PC on port 5912. This bypasses the cloud entirely, avoiding any redirection warnings and offering absolute 0ms latency.
                </li>
                <li>
                  <strong className="text-zinc-200">Option B: Use the Public Stream URL</strong>: Open the unrestricted public <a href={typeof window !== "undefined" ? window.location.origin.replace("-dev-", "-pre-") : "#"} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline font-bold">Shared App URL</a>. Since shared URLs have no developer cookie gates, your Python stream uploads will connect and render live flawlessly!
                </li>
              </ul>
            </div>

            {/* Step Guides */}
            <div className="space-y-3">
              {/* Step 1 */}
              <div className="bg-zinc-950/40 p-3 rounded-lg border border-zinc-900 space-y-2">
                <div className="flex gap-2 items-center">
                  <span className="w-4 h-4 rounded bg-zinc-850 text-cyan-400 flex items-center justify-center font-bold text-[10px] font-mono border border-cyan-800/20">1</span>
                  <span className="font-bold text-zinc-200 uppercase tracking-wider text-[11px]">GET THE BRIDGE</span>
                </div>
                <p className="text-[11.5px] pl-6 text-zinc-400">
                  Download the pre-configured Python script. When executed, it automatically finds your active MSFS 2020 flight plan on your PC drive and uploads it seamlessly.
                </p>
                <div className="pl-6 pt-1 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <a 
                      href="/api/bridge/python" 
                      download="msfs_bridge.py"
                      className="inline-flex items-center gap-1.5 bg-cyan-950 border border-cyan-800/60 hover:bg-cyan-900 text-cyan-400 font-mono font-bold text-[10.5px] px-2.5 py-1.5 rounded transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      DOWNLOAD MSFS_BRIDGE.PY
                    </a>

                    <button
                      onClick={() => setShowCode(!showCode)}
                      className="inline-flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 hover:bg-zinc-750 text-zinc-300 font-mono text-[10.5px] px-2.5 py-1.5 rounded transition-colors cursor-pointer"
                    >
                      <Terminal className="w-3.5 h-3.5 text-zinc-400" />
                      {showCode ? "HIDE PYTHON CODE" : "SHOW CODE / COPY MANUALLY"}
                    </button>
                  </div>

                  {showCode && (
                    <div className="mt-2.5 space-y-2.5 bg-zinc-950 p-3 rounded-lg border border-zinc-850">
                      <div className="text-[11px] text-amber-400 font-sans leading-relaxed bg-amber-950/15 p-2.5 rounded border border-amber-900/40">
                        💡 <strong>Browser Download Help:</strong> If clicking download returned a web page or an HTML file, it's because of browser iframe security. Simply open Notepad on your computer, paste the script below, and save it as <code>msfs_bridge.py</code> in your <code>C:\Users\zeevi\msfs2020\</code> folder! It already has this exact cloud server link pre-filled inside.
                      </div>

                      <div className="flex items-center justify-between bg-zinc-900 px-2.5 py-1.5 rounded text-[10px] font-mono text-zinc-400">
                        <span className="font-bold">msfs_bridge.py</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(pythonScriptText);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }}
                          className="flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 font-sans cursor-pointer bg-cyan-950 px-2 py-1 rounded border border-cyan-800/40 text-[11px]"
                        >
                          {copied ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span className="font-bold">COPIED!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span className="font-bold">COPY TELEMETRY CODE</span>
                            </>
                          )}
                        </button>
                      </div>

                      <pre className="text-[10.5px] font-mono text-zinc-350 overflow-x-auto max-h-[220px] overflow-y-auto bg-black/85 p-3 rounded-lg border border-zinc-800 leading-relaxed select-all">
{pythonScriptText}
                      </pre>
                    </div>
                  )}
                </div>
              </div>

              {/* Step 2 */}
              <div className="bg-zinc-950/40 p-3 rounded-lg border border-zinc-900 space-y-2">
                <div className="flex gap-2 items-center">
                  <span className="w-4 h-4 rounded bg-zinc-850 text-cyan-400 flex items-center justify-center font-bold text-[10px] font-mono border border-cyan-800/20">2</span>
                  <span className="font-bold text-zinc-200 uppercase tracking-wider text-[11px]">INSTALL LIBRARIES</span>
                </div>
                <p className="text-[11px] pl-6 text-zinc-400">
                  Ensure you have Python 3.7+ installed. Run this command in command-prompt / terminal:
                </p>
                <div className="pl-6">
                  <div className="bg-black/60 p-2 rounded border border-zinc-800 text-[10px] font-mono text-cyan-400 select-all overflow-x-auto whitespace-nowrap">
                    pip install SimConnect requests
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="bg-zinc-950/40 p-3 rounded-lg border border-zinc-900 space-y-2">
                <div className="flex gap-2 items-center">
                  <span className="w-4 h-4 rounded bg-zinc-850 text-cyan-400 flex items-center justify-center font-bold text-[10px] font-mono border border-cyan-800/20">3</span>
                  <span className="font-bold text-zinc-200 uppercase tracking-wider text-[11px]">BOOT AND STREAM</span>
                </div>
                <p className="text-[11px] pl-6">
                  Load into your aircraft cockpit in MSFS 2020, then run the python script:
                </p>
                <div className="pl-6">
                  <div className="bg-black/60 p-2 rounded border border-zinc-800 text-[10px] font-mono text-cyan-400 select-all overflow-x-auto">
                    python msfs_bridge.py
                  </div>
                </div>
                <p className="text-[10px] pl-6 text-zinc-500 italic leading-snug">
                  The script parses your current flight plan and uploads your position immediately. Your plane will snap to its location in VR!
                </p>
              </div>
            </div>
          </div>
        )}

        {guideTab === "vr" && (
          /* High Fidelity VR Cockpit Pinning Guide */
          <div className="space-y-4">
            <div className="text-[10px] text-zinc-500 font-extrabold uppercase tracking-widest flex items-center gap-1.5">
              <Glasses className="w-4 h-4 text-cyan-400" />
              <span>Quest 3 Cockpit Placement Guide</span>
            </div>

            <p className="text-[11px] text-zinc-350 leading-relaxed -mt-1 bg-zinc-950/40 p-2.5 rounded border border-zinc-900">
              💡 <strong>You are 100% correct!</strong> Virtual Desktop does NOT natively have a thumbtack or pin button in its standard configuration deck. To get your map into the cockpit, you have three highly reliable options below:
            </p>

            <div className="space-y-3 text-xs text-zinc-400">
              {/* Method A */}
              <div className="bg-zinc-950/50 p-3.5 rounded-lg border border-zinc-800 space-y-2.5">
                <div className="flex items-center gap-2 border-b border-zinc-900 pb-1.5">
                  <span className="w-1.5 h-3 bg-cyan-400 rounded-full"></span>
                  <span className="font-bold text-zinc-200 uppercase tracking-wider text-[11px]">Option A: Run MSFS via SteamVR Mode (Recommended)</span>
                </div>
                <p className="text-[10.5px] leading-relaxed">
                  If you run MSFS 2020 through SteamVR (instead of raw VDXR/Oculus runtime) while connected to Virtual Desktop, you can pin any desktop window:
                </p>
                <ol className="space-y-1.5 pl-4 list-decimal text-[11px] leading-relaxed">
                  <li>Start MSFS 2020 in VR.</li>
                  <li>Click your <strong>Left Controller Menu Button</strong> (the button with three lines) with a brief click to summon the SteamVR Dashboard/Console.</li>
                  <li>In the dashboard, click the <strong>"+" (Add Window/Monitor)</strong> button on the bottom bar.</li>
                  <li>Choose the specific <strong>Chrome browser window</strong> running your Flight Map.</li>
                  <li>At the bottom-right corner of that floating browser overlay, look for the **Pushpin (Pin to World)** icon and click it.</li>
                  <li>Position, grab, and resize the window to float directly over your pilot knee. When you close the SteamVR Dashboard, the map stays right there!</li>
                </ol>
              </div>

              {/* Method B */}
              <div className="bg-zinc-950/50 p-3.5 rounded-lg border border-zinc-800 space-y-2.5">
                <div className="flex items-center gap-2 border-b border-zinc-900 pb-1.5">
                  <span className="w-1.5 h-3 bg-amber-400 rounded-full"></span>
                  <span className="font-bold text-zinc-200 uppercase tracking-wider text-[11px]">Option B: Use MSFS In-Game Tablets (Native VDXR / pure OpenXR)</span>
                </div>
                <p className="text-[10.5px] leading-relaxed">
                  If running in high-performance VDXR mode, third-party overlays are completely blocked by OpenXR. The professional community uses in-game web browser mods:
                </p>
                <ol className="space-y-1.5 pl-4 list-decimal text-[11px] leading-relaxed">
                  <li>Download a free native cockpit helper like <strong>FSKneeboard</strong> or the <strong>All-in-one Ingame Panel / VFR Map</strong> web injector from Flightsim.to.</li>
                  <li>These load a virtual tablet item directly inside your MSFS top drop-down menu.</li>
                  <li>Simply key in this Flight Map's local address (or your custom URL) into the in-game tablet. You can now grab and slide the tablet anywhere in your cockpit using standard MSFS controls!</li>
                </ol>
              </div>

              {/* Method C */}
              <div className="bg-zinc-950/50 p-3.5 rounded-lg border border-zinc-800 space-y-2.5">
                <div className="flex items-center gap-2 border-b border-zinc-900 pb-1.5">
                  <span className="w-1.5 h-3 bg-teal-400 rounded-full"></span>
                  <span className="font-bold text-zinc-200 uppercase tracking-wider text-[11.5px]">Option C: Swap to Oculus Link (AirLink)</span>
                </div>
                <p className="text-[10.5px] leading-relaxed">
                  If you prefer a seamless built-in Quest pinning option, swap over to Meta's native Link:
                </p>
                <ol className="space-y-1.5 pl-4 list-decimal text-[11px] leading-relaxed">
                  <li>Connect to your computer via official Quest AirLink / Link.</li>
                  <li>Open the Link dashboard and drag your Chrome window out of the screen view to sever the panel into a separate item.</li>
                  <li>In the bottom corner of this separate panel, hit the <strong>Pushpin/Pin</strong> button.</li>
                  <li>Fit it right onto your yoke or dashboard console. When playing MSFS in VR Link, it displays flawlessly.</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {guideTab === "openkneeboard" && (
          /* OpenKneeboard Guide */
          <div className="space-y-4">
            <div className="text-[10px] text-zinc-500 font-extrabold uppercase tracking-widest flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-cyan-400" />
              <span>OpenKneeboard VR Setup</span>
            </div>

            <p className="text-[11px] text-zinc-350 leading-relaxed -mt-1 bg-zinc-950/40 p-2.5 rounded border border-zinc-900">
              💡 <strong>Gold Standard Workaround:</strong> Since OpenKneeboard renders natively inside your VR session via OpenXR/OpenVR and uses the Microsoft Edge <strong>WebView2 Engine</strong>, it is 100% compatible with this map and works flawlessly over Virtual Desktop (even in pure VDXR performance mode)!
            </p>

            <div className="space-y-3 text-xs text-zinc-400">
              {/* Step 1 */}
              <div className="bg-zinc-950/40 p-3 rounded-lg border border-zinc-900 space-y-2">
                <div className="flex gap-2 items-center">
                  <span className="w-4 h-4 rounded bg-zinc-850 text-cyan-400 flex items-center justify-center font-bold text-[10px] font-mono border border-cyan-800/20">1</span>
                  <span className="font-bold text-zinc-200 uppercase tracking-wider text-[11px]">Install OpenKneeboard</span>
                </div>
                <p className="text-[11px] pl-6 text-zinc-400 leading-relaxed">
                  Download the latest release of <strong>OpenKneeboard</strong> (free, open-source on GitHub) and launch it on your Flight PC.
                </p>
              </div>

              {/* Step 2 */}
              <div className="bg-zinc-950/40 p-3 rounded-lg border border-zinc-900 space-y-2">
                <div className="flex gap-2 items-center">
                  <span className="w-4 h-4 rounded bg-zinc-850 text-cyan-400 flex items-center justify-center font-bold text-[10px] font-mono border border-cyan-800/20">2</span>
                  <span className="font-bold text-zinc-200 uppercase tracking-wider text-[11px]">Add a Web Dashboard Tab</span>
                </div>
                <ol className="space-y-1.5 pl-10 list-decimal text-[11px] leading-relaxed">
                  <li>In the OpenKneeboard application, click the <strong>Settings</strong> button (the cog icon in the bottom-left corner).</li>
                  <li>In the settings navigation panel, select <strong>Tabs</strong>.</li>
                  <li>Click the <strong>Add Tab</strong> button at the top-right.</li>
                  <li>From the dropdown menu, select <strong className="text-cyan-400 text-[11px]">Web Dashboard</strong>.</li>
                </ol>
              </div>

              {/* Step 3 */}
              <div className="bg-zinc-950/40 p-3 rounded-lg border border-zinc-900 space-y-2.5">
                <div className="flex gap-2 items-center">
                  <span className="w-4 h-4 rounded bg-zinc-850 text-cyan-400 flex items-center justify-center font-bold text-[10px] font-mono border border-cyan-800/20">3</span>
                  <span className="font-bold text-zinc-200 uppercase tracking-wider text-[11px]">URL Configuration</span>
                </div>
                <p className="text-[11.5px] pl-6 text-zinc-350 leading-relaxed font-sans">
                  Set the <strong>Tab Label</strong> to <code>Flight Map</code>. Depending on how you want to run the app, choose one of these two options:
                </p>
                <div className="pl-6 space-y-3">
                  {/* Option A: Cloud preview */}
                  <div className="bg-black/60 p-3 rounded border border-zinc-800 text-[10.5px] space-y-1">
                    <div className="text-[9.5px] text-zinc-500 font-mono uppercase tracking-wider font-bold">Option A: Use Live Web Preset (Easiest & Ready Now)</div>
                    <p className="text-[11px] text-zinc-450 leading-relaxed font-sans pb-1">
                      Paste your live cloud demo URL directly. This loads instantly from our remote servers without installing any tools:
                    </p>
                    <code className="text-amber-400 select-all font-mono font-bold leading-normal break-all block p-1.5 bg-zinc-900/50 rounded border border-zinc-850">{window.location.origin}</code>
                  </div>

                  {/* Option B: Local PC */}
                  <div className="bg-black/60 p-3 rounded border border-zinc-800 text-[10.5px] space-y-1">
                    <div className="text-[9.5px] text-zinc-500 font-mono uppercase tracking-wider font-bold">Option B: Use Localhost (To Run Locally on your PC)</div>
                    <p className="text-[11px] text-zinc-450 leading-relaxed font-sans">
                      If you'd rather run the map fully on your desktop computer, you must download this app first:
                    </p>
                    <ol className="list-decimal pl-4 text-[10.5px] text-zinc-450 space-y-1 leading-snug font-sans py-1.5 list-inside">
                      <li>Use the <strong>Export</strong> or <strong>Settings</strong> button in AI Studio to download this project as a ZIP.</li>
                      <li>Extract it, install <a href="https://nodejs.org/" target="_blank" rel="noreferrer" className="text-cyan-400 underline hover:text-cyan-300">Node.js</a> on your computer.</li>
                      <li>Open your terminal/command prompt in that folder and run <code className="bg-zinc-900 p-0.5 px-1 rounded text-zinc-350 border border-zinc-800">npm install</code>.</li>
                      <li>Run <code className="bg-zinc-900 p-0.5 px-1 rounded text-zinc-350 border border-zinc-800">npm run dev</code>. Now your local map will run at:</li>
                    </ol>
                    <code className="text-cyan-400 select-all font-mono font-bold leading-normal break-all block p-1.5 bg-zinc-900/50 rounded border border-zinc-850">http://localhost:3000</code>
                  </div>
                </div>
              </div>

              {/* Step 4 */}
              <div className="bg-zinc-950/40 p-3 rounded-lg border border-zinc-900 space-y-2">
                <div className="flex gap-2 items-center">
                  <span className="w-4 h-4 rounded bg-zinc-850 text-cyan-400 flex items-center justify-center font-bold text-[10px] font-mono border border-cyan-800/20">4</span>
                  <span className="font-bold text-zinc-200 uppercase tracking-wider text-[11px]">Interactive Controls</span>
                </div>
                <p className="text-[11px] pl-6 text-zinc-400 leading-relaxed font-sans">
                  Under <strong>Settings → Input</strong>, you can bind standard flight stick keys or hotkeys (like scroll wheel or trackball triggers) to easily pan, zoom, or refresh the map page while strapped in VR!
                </p>
              </div>

              {/* Step 5 */}
              <div className="bg-zinc-950/40 p-3 rounded-lg border border-zinc-900 space-y-2">
                <div className="flex gap-2 items-center">
                  <span className="w-4 h-4 rounded bg-zinc-850 text-cyan-400 flex items-center justify-center font-bold text-[10px] font-mono border border-cyan-800/20">5</span>
                  <span className="font-bold text-zinc-200 uppercase tracking-wider text-[11px]">Cockpit Placement & Scaling</span>
                </div>
                <p className="text-[11px] pl-6 text-zinc-400 leading-relaxed font-sans">
                  Start MSFS 2020 in VR mode, and OpenKneeboard will automatically display inside your headset. Double-click the grip buttons on your controllers or use the mouse cursor to grab, rescale, hook, curved bend, and lock the flight map nicely right where you can read it.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Mock/Simulator Fallback Option */}
        <div className="bg-zinc-950/30 border border-zinc-800/80 p-3.5 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-bold text-zinc-200">In-Browser Test Simulator</span>
            </div>
            
            <button 
              onClick={onToggleMock}
              className={`p-1 px-3 rounded-md font-mono text-[9px] font-extrabold border transition-all ${
                mockActive 
                  ? "bg-amber-950/80 text-amber-400 border-amber-500/40" 
                  : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-750"
              }`}
            >
              {mockActive ? "DISABLE TEST SIM" : "ENABLE TEST SIM"}
            </button>
          </div>

          <p className="text-[10px] text-zinc-500 leading-normal">
            No flight computer on hand? Enable the built-in simulator to generate fake flight telemetry, tilt pitch gauges, and navigate virtual flight paths for previewing features.
          </p>
        </div>
      </div>
    </div>
  );
}
