# 🗺️ MSFS VR Flight Map

<p align="center">
  <b>Real-time flight map for Microsoft Flight Simulator 2020 — in your browser, in VR.</b>
</p>

<p align="center">
  <a href="https://github.com/zeevoffen/msfs-vr-flight-map"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <a href="https://nodejs.org"><img alt="Node.js" src="https://img.shields.io/badge/node-%3E%3D18-green.svg"></a>
  <a href="https://www.python.org"><img alt="Python" src="https://img.shields.io/badge/python-%3E%3D3.10-blue.svg"></a>
</p>

A **Leaflet-powered moving map** that displays your MSFS 2020 aircraft position in real time, with a glass-cockpit HUD, flight plan tracking, and waypoint navigation — all rendered in a browser window you can pin inside your VR headset.

---

## 📸 Screenshots

### 🗺️ Map Overview — HUD Panel
![Map Overview with HUD](https://raw.githubusercontent.com/zeevoffen/msfs-vr-flight-map/main/screenshots/01-map-overview.png)

*The main view: Leaflet moving map with the FlightDeckHUD overlay showing live telemetry — airspeed, altitude, heading, pitch/bank, fuel, gear/flaps, wind, and vertical speed.*

### 📋 Flight Plan Panel
![Flight Plan Panel](https://raw.githubusercontent.com/zeevoffen/msfs-vr-flight-map/main/screenshots/02-flight-plan.png)

*Flight Plan tab: waypoint list with active leg highlighting, distance, bearing, and ETA — displayed alongside the route polyline on the map.*

### 📖 Bridge Setup Guide
![Bridge Setup Guide](https://raw.githubusercontent.com/zeevoffen/msfs-vr-flight-map/main/screenshots/03-bridge-guide.png)

*Step-by-step MSFS Bridge setup guide built right into the UI — no need to dig through documentation.*

### 🚀 Bridge Launcher & Log Viewer
![Bridge Launcher](https://raw.githubusercontent.com/zeevoffen/msfs-vr-flight-map/main/screenshots/04-bridge-launcher.png)

*Start/stop the Python SimConnect bridge from the browser with a live log viewer and connection status indicator.*

---

## ✨ Features

- **Live Telemetry** — Aircraft position, heading, speed, altitude, pitch/bank, fuel, gear/flaps, wind, and vertical speed streamed in real time via Server-Sent Events
- **Moving Map** — Leaflet map with multiple tile layers (CartoDB Dark/Light, OpenStreetMap, OpenAIP airspace overlay) and a rotated plane icon that follows your heading
- **Flight Plan Panel** — Waypoint list with active leg highlighting, distance, bearing, and ETA calculations
- **Glass-Cockpit HUD** — Real-time flight instruments displayed in a clean overlay
- **Python SimConnect Bridge** — Reads telemetry directly from MSFS 2020 via SimConnect SDK and serves it to the Node.js backend
- **Bridge Control UI** — Start/stop the Python bridge from the browser with live log output
- **VR-Ready** — Open in a browser overlay (e.g., OVR Toolkit, Desktop+) pinned in your VR cockpit

---

## 🏗️ Architecture

```
MSFS 2020 (SimConnect SDK)
        │
        ▼
Python Bridge (msfs_bridge.py)
  ├─ Polls telemetry every 1–2s
  └─ Serves JSON at http://localhost:5912
        │
        ▼
Node.js Server (server.ts)
  ├─ Express REST + SSE endpoints
  ├─ Spawns/monitors bridge subprocess
  └─ Vite dev server for React SPA
        │
        ▼
React Frontend (src/)
  ├─ Leaflet map with tile layers
  ├─ FlightDeckHUD — telemetry gauges
  ├─ FlightPlanPanel — waypoint tracking
  └─ BridgeLauncher — bridge control UI
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system diagram and data flow details.

---

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org) ≥ 18
- [Python](https://www.python.org) ≥ 3.10
- [MSFS 2020](https://www.microsoft.com/en-us/p/microsoft-flight-simulator) with SimConnect SDK

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Server

```bash
npm run dev
```

This starts the Node.js server with Vite. The app will be available at **http://localhost:3000**.

### 3. Start the Python Bridge

Make sure MSFS 2020 is running, then either:

- **From the browser** — Click the "Start Bridge" button in the Bridge Launcher panel
- **From the terminal:**
  ```bash
  python bridge/msfs_bridge.py
  ```

The bridge connects to MSFS via SimConnect and begins streaming telemetry to the server.

### 4. Open in VR

Use your VR browser overlay tool (OVR Toolkit, Desktop+, etc.) to pin **http://localhost:3000** inside your cockpit view.

---

## 📁 Project Structure

```
msfs-vr-flight-map/
├── server.ts                  # Express + Vite server, SSE telemetry, bridge process manager
├── bridge/
│   └── msfs_bridge.py         # Python SimConnect bridge
├── src/
│   ├── App.tsx                # Root component with Leaflet map, sidebar, telemetry state
│   ├── main.tsx               # React entry point
│   ├── index.css              # Tailwind CSS
│   ├── types.ts               # TypeScript type definitions
│   ├── components/
│   │   ├── FlightDeckHUD.tsx       # Telemetry gauges overlay
│   │   ├── FlightPlanPanel.tsx     # Waypoint list & navigation info
│   │   ├── BridgeLauncher.tsx      # Bridge start/stop & log viewer
│   │   └── MSFSBridgeGuide.tsx     # Step-by-step setup instructions
│   └── utils/
│       ├── bearing.ts              # Bearing calculation utility
│       └── bearing.test.js         # Bearing unit tests
├── ARCHITECTURE.md            # Full architecture documentation
├── vite.config.ts             # Vite configuration
├── tsconfig.json              # TypeScript configuration
└── package.json
```

---

## 🛠️ Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the development server (Express + Vite) |
| `npm run build` | Build for production (Vite + esbuild) |
| `npm run start` | Run the production build |
| `npm run lint` | Type-check with TypeScript compiler |
| `npm run test` | Run bearing utility tests |

---

## 🔧 Configuration

The Python bridge runs an HTTP server on `http://localhost:5912` by default. The Node.js server expects to find it there. You can configure the bridge port and other settings in `bridge/msfs_bridge.py`.

---

## 📄 License

[MIT](./LICENSE)
