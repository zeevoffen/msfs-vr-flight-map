import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import { spawn, ChildProcess } from "child_process";

function logToFile(msg: string) {
  try {
    fs.appendFileSync(path.join(process.cwd(), "server_debug.log"), `${new Date().toISOString()} - ${msg}\n`);
  } catch (e) {}
}

interface Telemetry {
  latitude: number;
  longitude: number;
  altitude: number;
  heading: number;
  airspeed: number;
  verticalSpeed: number;
  pitch: number;
  bank: number;
  groundSpeed: number;
  isConnected: boolean;
  aircraftType: string;
  timestamp: number;
  onGround: boolean;
  flaps: number;
  gear: string;
  windSpeed: number;
  windDir: number;
  fuelPercent: number;
  waypoints?: any[];
}

let currentTelemetry: Telemetry | null = null;
let sseClients: express.Response[] = [];

// Bridge process management
let bridgeProcess: ChildProcess | null = null;
let bridgeLogBuffer: string[] = [];
const MAX_LOG_LINES = 500;
let bridgeLogClients: express.Response[] = [];

function broadcastBridgeLog(line: string) {
  bridgeLogBuffer.push(line);
  if (bridgeLogBuffer.length > MAX_LOG_LINES) {
    bridgeLogBuffer.shift();
  }
  const message = `data: ${JSON.stringify({ line })}\n\n`;
  bridgeLogClients.forEach((client) => {
    try { client.write(message); } catch (e) { /* client disconnected */ }
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Logger middleware to capture every incoming API request and debug connections
  app.use((req, res, next) => {
    if (req.url.startsWith("/api/telemetry")) {
      logToFile(`[HTTP ${req.method}] ${req.url} | Content-Length: ${req.headers["content-length"]} | Content-Type: ${req.headers["content-type"]}`);
    }
    next();
  });

  app.use(express.json());

  // CORS headers to ensure the telemetry bridge can connect from any local PC
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  // Endpoints for Telemetry data
  app.get("/api/telemetry/current", (req, res) => {
    logToFile(`[GET /api/telemetry/current] Requested telemetry. Has current: ${!!currentTelemetry}`);
    res.json(currentTelemetry || { isConnected: false });
  });

  app.post("/api/telemetry", (req, res) => {
    const data = req.body;
    logToFile(`[POST /api/telemetry] Received telemetry. Lat: ${data.latitude}, Lng: ${data.longitude}, Heading: ${data.heading}, Altitude: ${data.altitude}`);
    
    // Structure telemetry safely
    currentTelemetry = {
      latitude: Number(data.latitude || 0),
      longitude: Number(data.longitude || 0),
      altitude: Number(data.altitude || 0),
      heading: Number(data.heading || 0),
      airspeed: Number(data.airspeed || data.indicatedAirspeed || 0),
      verticalSpeed: Number(data.verticalSpeed || 0),
      pitch: Number(data.pitch || 0),
      bank: Number(data.bank || 0),
      groundSpeed: Number(data.groundSpeed || data.airspeed || 0),
      isConnected: data.isConnected !== false,
      aircraftType: String(data.aircraftType || "General Aviation"),
      timestamp: Date.now(),
      onGround: Boolean(data.onGround),
      flaps: Number(data.flaps || 0),
      gear: String(data.gear || "Unknown"),
      windSpeed: Number(data.windSpeed || 0),
      windDir: Number(data.windDir || 0),
      fuelPercent: Number(data.fuelPercent || 100),
      waypoints: data.waypoints || [],
    };

    // Broadcast to SSE clients
    const message = `data: ${JSON.stringify(currentTelemetry)}\n\n`;
    sseClients.forEach((client) => {
      client.write(message);
    });

    res.json({ status: "success", received: true });
  });

  // Server-Sent Events stream for real-time map updates
  app.get("/api/telemetry/stream", (req, res) => {
    logToFile(`[GET /api/telemetry/stream] SSE Client connected.`);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    // Send current state immediately on connect
    if (currentTelemetry) {
      res.write(`data: ${JSON.stringify(currentTelemetry)}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ isConnected: false })}\n\n`);
    }

    sseClients.push(res);

    req.on("close", () => {
      logToFile(`[GET /api/telemetry/stream] SSE Client disconnected.`);
      sseClients = sseClients.filter((client) => client !== res);
    });
  });

  // Endpoint to clear or reset the simulation telemetry session
  app.post("/api/telemetry/reset", (req, res) => {
    currentTelemetry = null;
    const message = `data: ${JSON.stringify({ isConnected: false })}\n\n`;
    sseClients.forEach((client) => client.write(message));
    res.json({ status: "reset" });
  });


  // --- Bridge Process Management ---

  // Start the Python bridge script
  app.post("/api/bridge/start", (req, res) => {
    if (bridgeProcess) {
      return res.json({ status: "already_running", message: "Bridge is already running." });
    }

    const bridgeScriptPath = path.join(process.cwd(), "bridge", "msfs_bridge.py");
    if (!fs.existsSync(bridgeScriptPath)) {
      return res.status(404).json({ status: "error", message: `Bridge script not found at ${bridgeScriptPath}` });
    }

    const pythonExe = req.body.pythonPath || "python.exe";
    broadcastBridgeLog(`[SYSTEM] Starting bridge: ${pythonExe} ${bridgeScriptPath}`);

    try {
      // Spawn the Python bridge script
      bridgeProcess = spawn(pythonExe, [bridgeScriptPath], {
        cwd: process.cwd(),
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
        detached: false,
        windowsHide: true,
      });

      // Log the PID so we can verify the process actually started
      broadcastBridgeLog(`[SYSTEM] Bridge process spawned (PID: ${bridgeProcess.pid})`);

      bridgeProcess.stdout?.on("data", (data: Buffer) => {
        // Normalize line endings: \r\n -> \n, standalone \r -> \n
        const text = data.toString().replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        const lines = text.split("\n").filter((l: string) => l.trim());
        // Send all lines from this data chunk as a single batch message
        if (lines.length > 0) {
          const message = `data: ${JSON.stringify({ lines })}\n\n`;
          bridgeLogClients.forEach((client) => {
            try { client.write(message); } catch (e) { /* client disconnected */ }
          });
          // Also add to buffer
          lines.forEach((line: string) => {
            bridgeLogBuffer.push(`[STDOUT] ${line}`);
          });
          if (bridgeLogBuffer.length > MAX_LOG_LINES) {
            bridgeLogBuffer.splice(0, bridgeLogBuffer.length - MAX_LOG_LINES);
          }
        }
      });

      bridgeProcess.stderr?.on("data", (data: Buffer) => {
        const text = data.toString().replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        const lines = text.split("\n").filter((l: string) => l.trim());
        if (lines.length > 0) {
          const message = `data: ${JSON.stringify({ lines })}\n\n`;
          bridgeLogClients.forEach((client) => {
            try { client.write(message); } catch (e) { /* client disconnected */ }
          });
          lines.forEach((line: string) => {
            bridgeLogBuffer.push(`[STDERR] ${line}`);
          });
          if (bridgeLogBuffer.length > MAX_LOG_LINES) {
            bridgeLogBuffer.splice(0, bridgeLogBuffer.length - MAX_LOG_LINES);
          }
        }
      });

      bridgeProcess.on("close", (code: number | null) => {
        broadcastBridgeLog(`[SYSTEM] Bridge process exited with code ${code}`);
        bridgeProcess = null;
      });

      bridgeProcess.on("error", (err: Error) => {
        broadcastBridgeLog(`[SYSTEM] Bridge process error: ${err.message}`);
        bridgeProcess = null;
      });

      // Check if process dies within 1 second (immediate crash)
      setTimeout(() => {
        if (bridgeProcess === null) {
          broadcastBridgeLog("[SYSTEM] WARNING: Bridge process exited immediately. Check Python path and dependencies.");
        }
      }, 1500);

      res.json({ status: "started", pid: bridgeProcess.pid, message: "Bridge process started." });
    } catch (e: any) {
      broadcastBridgeLog(`[SYSTEM] Failed to start bridge: ${e.message}`);
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  // Stop the Python bridge script
  app.post("/api/bridge/stop", (req, res) => {
    if (!bridgeProcess) {
      return res.json({ status: "not_running", message: "Bridge is not running." });
    }
    broadcastBridgeLog("[SYSTEM] Stopping bridge process...");
    bridgeProcess.kill("SIGTERM");
    bridgeProcess = null;
    res.json({ status: "stopped", message: "Bridge process stopped." });
  });

  // Get bridge status
  app.get("/api/bridge/status", (req, res) => {
    res.json({
      running: bridgeProcess !== null,
      logLines: bridgeLogBuffer,
    });
  });

  // SSE stream for bridge logs
  app.get("/api/bridge/logs", (req, res) => {
    logToFile("[GET /api/bridge/logs] SSE Client connected.");
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    // Send a hello marker so the client knows the stream is connected
    res.write(`data: ${JSON.stringify({ lines: ["[SYSTEM] Log stream connected."] })}\n\n`);

    bridgeLogClients.push(res);

    req.on("close", () => {
      logToFile("[GET /api/bridge/logs] SSE Client disconnected.");
      bridgeLogClients = bridgeLogClients.filter((client) => client !== res);
    });
  });

  // CENTRALIZED Python bridge script template generator to ensure 100% DRY compliance
  function getPythonScript(sanitizedUrl: string): string {
    return `import time
import sys
import os
import math
import re
import xml.etree.ElementTree as ET
import json
import threading
from http.server import BaseHTTPRequestHandler
try:
    from http.server import ThreadingHTTPServer as HTTPServerClass
except ImportError:
    from http.server import HTTPServer as HTTPServerClass

# Gracefully import requests
try:
    import requests
except ImportError:
    print("=" * 60)
    print("CRITICAL ERROR: 'requests' library not found!")
    print("Please install the required python packages first:")
    print("   pip install SimConnect requests")
    print("=" * 60)
    try:
        input("\nPress ENTER to exit...")
    except Exception:
        pass
    sys.exit(1)

# Gracefully import SimConnect
try:
    from SimConnect import SimConnect, AircraftRequests
except ImportError:
    print("=" * 60)
    print("CRITICAL ERROR: 'SimConnect' library not found!")
    print("Please install the required python packages first:")
    print("   pip install SimConnect requests")
    print("=" * 60)
    try:
        input("\nPress ENTER to exit...")
    except Exception:
        pass
    sys.exit(1)

# Local telemetry payload cache with thread safety
local_telemetry = {"isConnected": False}

class LocalTelemetryServer(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress logging of requests to keep console clean
        return

    def do_OPTIONS(self):
        try:
            self.send_response(200)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()
        except Exception:
            pass

    def do_GET(self):
        try:
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(local_telemetry).encode("utf-8"))
        except Exception:
            pass

class SilentThreadingHTTPServer(HTTPServerClass):
    def handle_error(self, request, client_address):
        # Gracefully suppress all socket abort traceback dumps (like Windows WinError 10053)
        pass

def start_local_server():
    try:
        # Binding to 0.0.0.0 on port 5912 to support VR devices / external local polling
        server = SilentThreadingHTTPServer(("0.0.0.0", 5912), LocalTelemetryServer)
        server.serve_forever()
    except Exception as e:
        print(f"[LOCAL SERVER ERROR] Could not bind to port 5912: {e}")

# Spin up the local HTTP CORS proxy in a background thread
server_thread = threading.Thread(target=start_local_server, daemon=True)
server_thread.start()

# API URL of this server
API_URL = "${sanitizedUrl}/api/telemetry"

print("=" * 60)
print("     MSFS 2020 VR FLIGHT MAP - AUTOMATED TELEMETRY BRIDGE")
print("=" * 60)
print(f"Target Server: {API_URL}")
print("Local Loopback Server: http://127.0.0.1:5912/ (CORS-enabled)")

def parse_dms(pos_str):
    """Parses MSFS Degrees-Minutes-Seconds coordinate formats."""
    match = re.search(r"([NSEW])\\s*(\\d+)°?\\s*(\\d+)'?\\s*([\\d.]+)\\\"?", pos_str)
    if match:
        dir_char = match.group(1)
        deg = float(match.group(2))
        min_val = float(match.group(3))
        sec_val = float(match.group(4))
        decimal = deg + (min_val / 60.0) + (sec_val / 3600.0)
        if dir_char in ["S", "W"]:
            decimal = -decimal
        return decimal
    try:
        return float(re.sub(r"[^\\d.-]", "", pos_str))
    except ValueError:
        return 0.0

def clean_data(obj):
    """Recursively converts bytes to strings to ensure JSON serializability."""
    if isinstance(obj, bytes):
        return obj.decode("utf-8", errors="ignore")
    elif isinstance(obj, dict):
        return {clean_data(k): clean_data(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_data(v) for v in obj]
    elif isinstance(obj, tuple):
        return tuple(clean_data(v) for v in obj)
    return obj

def locate_active_flight_plan():
    """Locates and parses the active flight plan automatically from MSFS AppData directories."""
    local_appdata = os.environ.get("LOCALAPPDATA", "")
    appdata = os.environ.get("APPDATA", "")
    
    paths = [
        # MS Store / Xbox App Version
        os.path.join(local_appdata, "Packages", "Microsoft.FlightSimulator_8wekyb3d8bbwe", "LocalState", "MISSIONS", "Custom", "CustomFlight", "CustomFlight.pln"),
        # Steam Version
        os.path.join(appdata, "Microsoft Flight Simulator", "MISSIONS", "Custom", "CustomFlight", "CustomFlight.pln")
    ]
    
    for path in paths:
        if os.path.exists(path):
            try:
                tree = ET.parse(path)
                root = tree.getroot()
                waypoints = []
                
                # Fetch ATCWaypoint elements
                atc_wps = root.findall(".//ATCWaypoint")
                for idx, wp in enumerate(atc_wps):
                    wp_id = wp.attrib.get("id", f"WP{idx}")
                    
                    icao_node = wp.find("ICAOIdent")
                    icao = icao_node.text if icao_node is not None else ""
                    
                    type_node = wp.find("ATCWaypointType")
                    wp_type = type_node.text if type_node is not None else "User"
                    
                    pos_node = wp.find("WorldPosition")
                    if pos_node is not None and pos_node.text:
                        parts = [p.strip() for p in pos_node.text.split(",")]
                        if len(parts) >= 2:
                            lat = parse_dms(parts[0])
                            lon = parse_dms(parts[1])
                            ele = float(parts[2].replace("+", "")) if len(parts) > 2 else 0.0
                            
                            waypoints.append({
                                "id": f"sim-{wp_id}-{idx}",
                                "name": icao if icao else wp_id,
                                "latitude": lat,
                                "longitude": lon,
                                "elevationFeet": int(ele),
                                "type": wp_type,
                                "icao": icao
                            })
                if waypoints:
                    print(f"-> Detected active MSFS flight plan: {len(waypoints)} waypoints loaded.")
                    return waypoints
            except Exception as e:
                print(f"Error parsing flight plan: {e}")
    return None

print("Connecting to MSFS 2020 via SimConnect...")

sm = None
while sm is None:
    try:
        sm = SimConnect()
        print("Connected to Microsoft Flight Simulator!")
    except Exception as e:
        print(f"Waiting for MSFS 2020... (Error detail: {e})")
        print("Please launch Microsoft Flight Simulator 2020 and load into a flight.")
        print("Retrying in 5 seconds...")
        time.sleep(5)

aq = AircraftRequests(sm)

print("Telemetry streaming active. Transmitting aircraft position and flight path auto-sync... Press Ctrl+C to exit.")
print("=" * 60)

# Check active flight plan on startup
cached_waypoints = locate_active_flight_plan()

try:
    while True:
        # Resolve variables from MSFS 2020
        try:
            # Lat/Lng in degrees
            lat = aq.get("PLANE_LATITUDE")
            lon = aq.get("PLANE_LONGITUDE")

            # Check if coordinates are loaded and valid
            if lat is not None and lon is not None:
                # Altitude in feet
                alt = aq.get("PLANE_ALTITUDE") or 0.0
                
                # Heading true & magnetic
                hdg = aq.get("PLANE_HEADING_DEGREES_MAGNETIC") or 0.0
                
                # Pitch, Bank (radians -> degrees)
                pitch = aq.get("PLANE_PITCH_DEGREES") or 0.0
                bank = aq.get("PLANE_BANK_DEGREES") or 0.0
                
                # Speed parameters
                ias = aq.get("AIRSPEED_INDICATED") or 0.0
                gs = aq.get("GPS_GROUND_SPEED") or ias
                
                # Vertical speed in feet per minute
                vs = aq.get("VERTICAL_SPEED")
                vs_val = (vs * 60.0) if vs is not None else 0.0

                title = aq.get("TITLE") or "General Aviation"
                on_ground = bool(aq.get("SIM_ON_GROUND"))
                flaps = aq.get("FLAPS_HANDLE_PERCENT") or 0
                
                gear_raw = aq.get("GEAR_POSITION_1")
                gear = "Down" if gear_raw == 100 else ("Up" if gear_raw == 0 else "Moving")
                
                wind_speed = aq.get("AMBIENT_WIND_VELOCITY") or 0
                wind_dir = aq.get("AMBIENT_WIND_DIRECTION") or 0
                
                fuel_total = aq.get("FUEL_TOTAL_QUANTITY") or 1
                fuel_capacity = aq.get("FUEL_TOTAL_CAPACITY") or 1
                fuel_pct = (fuel_total / fuel_capacity) * 100.0 if fuel_capacity > 0 else 100.0

                # Re-verify flight plan periodically if empty
                if not cached_waypoints:
                    cached_waypoints = locate_active_flight_plan()

                payload = {
                    "latitude": lat,
                    "longitude": lon,
                    "altitude": alt,
                    "heading": hdg,
                    "airspeed": ias,
                    "verticalSpeed": vs_val,
                    "pitch": pitch,
                    "bank": bank,
                    "groundSpeed": gs,
                    "isConnected": True,
                    "aircraftType": str(title),
                    "onGround": on_ground,
                    "flaps": flaps,
                    "gear": gear,
                    "windSpeed": wind_speed,
                    "windDir": wind_dir,
                    "fuelPercent": fuel_pct,
                    "waypoints": cached_waypoints or []
                }
                
                payload = clean_data(payload)
                
                # Update local loopback cache for direct browser connections
                local_telemetry.clear()
                local_telemetry.update(payload)
                
                try:
                    res = requests.post(API_URL, json=payload, timeout=3)
                    if res.status_code == 200:
                        content_type = res.headers.get("Content-Type", "")
                        if "text/html" in content_type:
                            if not hasattr(requests, '_redirect_warn_printed'):
                                print("\\n" + "=" * 60)
                                print("[INFO] Server is running in Protected Developer Sandbox Mode.")
                                print("The Dev Sandbox (ais-dev-...) requires Google credentials in your browser.")
                                print("Terminal programs cannot authenticate, so Cloud Upload is bypassed.")
                                print("BUT THE DIRECT LOCAL LINK IS WORKING! Zero-lag local telemetry active at:")
                                print("       ---> http://127.0.0.1:5912/ <---")
                                print("Ensure '127.0.0.1' or 'localhost' is set in the Network IP box in your browser.")
                                print("=" * 60 + "\\n")
                                requests._redirect_warn_printed = True
                            print(f"[LOCAL PC LINK ACTIVE] Lat: {lat:.5f} | Lng: {lon:.5f} | Alt: {alt:.0f}ft | Spd: {ias:.0f}kts        ", end="\\r")
                        else:
                            print(f"[LIVE CLOUD LINK] Lat: {lat:.5f} | Lng: {lon:.5f} | Alt: {alt:.0f}ft | Spd: {ias:.0f}kts        ", end="\\r")
                    else:
                        print(f"Error transmission: Server code {res.status_code} - Payload was successfully cached locally on 5912.")
                except Exception as e:
                    # Don't spam standard exceptions, just print cleanly
                    # If this fails (e.g. cloud deployment offline), we still cache on 5912 so local direct setup is perfect
                    print(f"Telemetry Post to Server Offline/Failed: {e} | Local CORS caching is still ACTIVE.", end="\\r")
            else:
                # Still output local_telemetry isConnected = False status on loopback
                local_telemetry.clear()
                local_telemetry.update({"isConnected": False})
                print("Retrieving flight variables... waiting for telemetry session load.", end="\\r")
                
        except Exception as inner_e:
            print(f"SimConnect read error (might be reloading/between flights): {inner_e}")
            
        time.sleep(1.0)
except KeyboardInterrupt:
    print("\\nExiting Telemetry Bridge. Safe flying!")
`;
  }

  // Diagnostic endpoint to check for GET method conversion redirect bugs
  app.get("/api/telemetry", (req, res) => {
    logToFile(`[GET /api/telemetry] WARNING: Received GET on telemetry POST path! Likely method conversion via redirect.`);
    res.status(405).json({
      error: "Method Not Allowed",
      message: "Please use POST to send telemetry. If you were redirected, check that you are POSTing to secure HTTPS."
    });
  });

  // Dynamically generate the Python tracker download script with correct URL
  app.get("/api/bridge/python", (req, res) => {
    let rawAppUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    if (!rawAppUrl.includes("localhost") && !rawAppUrl.includes("127.0.0.1") && rawAppUrl.startsWith("http://")) {
      rawAppUrl = rawAppUrl.replace("http://", "https://");
    }
    const sanitizedUrl = rawAppUrl.endsWith("/") ? rawAppUrl.slice(0, -1) : rawAppUrl;
    
    const scriptCode = getPythonScript(sanitizedUrl);
    res.setHeader("Content-Disposition", "attachment; filename=msfs_bridge.py");
    res.setHeader("Content-Type", "application/octet-stream");
    res.send(scriptCode);
  });

  // Plain-text endpoint for display/copy in the web application guide
  app.get("/api/bridge/python-code", (req, res) => {
    let rawAppUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    if (!rawAppUrl.includes("localhost") && !rawAppUrl.includes("127.0.0.1") && rawAppUrl.startsWith("http://")) {
      rawAppUrl = rawAppUrl.replace("http://", "https://");
    }
    const sanitizedUrl = rawAppUrl.endsWith("/") ? rawAppUrl.slice(0, -1) : rawAppUrl;
    
    const scriptCode = getPythonScript(sanitizedUrl);
    res.setHeader("Content-Type", "text/plain");
    res.send(scriptCode);
  });

  // Serving the Vite App
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SERVER] MSFS VR Flight Map Server running on http://localhost:${PORT}`);
  });

  // Graceful shutdown: kill bridge process when server exits
  const shutdown = () => {
    if (bridgeProcess) {
      bridgeProcess.kill("SIGTERM");
      bridgeProcess = null;
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startServer();
