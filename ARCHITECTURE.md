# MSFS VR Flight Map — Architecture Overview

## System Architecture

The map is rendered by **Leaflet** (embedded directly in `App.tsx`) using **raster tile layers** fetched from online tile servers (CartoDB Dark/Light, OpenStreetMap, OpenAIP). Telemetry data flows from MSFS through the Python bridge to the Node server, which pushes it to the frontend via SSE — the Leaflet map then updates the plane marker, route polyline, and camera position in real time.

```mermaid
flowchart TB
    subgraph MSFS["🎮 Microsoft Flight Simulator 2020"]
        direction TB
        SimConnect["SimConnect API<br/><i>SDK for aircraft telemetry</i>"]
    end

    subgraph Bridge["🐍 Python Bridge<br/>bridge/msfs_bridge.py"]
        direction TB
        BridgeSimConnect["SimConnect Client<br/>Polls lat/lng/alt/heading/speed<br/>every 1–2 seconds"]
        BridgeHTTPServer["Local HTTP Server<br/>http://0.0.0.0:5912<br/>CORS-enabled JSON API"]
        BridgeCloudAPI["Cloud Telemetry API<br/>POST to AIS endpoint<br/>for remote access"]
    end

    subgraph Server["🟢 Node.js Server<br/>server.ts — Express + Vite"]
        direction TB
        ExpressAPI["REST & SSE Endpoints<br/>├─ GET  /api/telemetry/current<br/>├─ POST /api/telemetry<br/>├─ GET  /api/telemetry/stream<br/>├─ POST /api/telemetry/reset<br/>├─ GET  /api/bridge/logs<br/>└─ POST /api/bridge/start|stop"]
        BridgeMgr["Bridge Process Manager<br/>spawns / monitors / kills<br/>Python bridge subprocess"]
        ViteSSG["Vite Dev Server<br/>Serves React SPA<br/>Hot-module replacement"]
    end

    subgraph Frontend["⚛️ React Frontend<br/>src/ — Vite + Tailwind + Leaflet"]
        direction TB
        AppShell["App.tsx<br/>Sidebar layout, tab routing<br/>telemetry state, map viewport"]
        Map["🗺️ Leaflet Map (inside App.tsx)<br/>├─ Tile layers: CartoDB Dark/Light<br/>├─ Overlay: OpenAIP (airspace)<br/>├─ Plane marker (rotated icon)<br/>├─ Route polyline (flight plan)<br/>├─ Waypoint markers<br/>└─ Camera follow (auto-pan)"]
        HUD["FlightDeckHUD.tsx<br/>Airspeed · Altitude · Heading<br/>Pitch/Bank · Fuel · Gear/Flaps<br/>Wind · Vertical speed"]
        FlightPlan["FlightPlanPanel.tsx<br/>Waypoint list · Active leg<br/>Distance · Bearing · ETA"]
        BridgeLauncherUI["BridgeLauncher.tsx<br/>Start/Stop bridge · Log viewer<br/>Connection status · Python path"]
        Guide["MSFSBridgeGuide.tsx<br/>Step-by-step setup instructions"]
    end

    subgraph TileServers["🗺️ Tile Servers (Map Data)"]
        direction LR
        CartoDB["CartoDB<br/>Dark / Light / Voyager<br/>Base map tiles"]
        OSM["OpenStreetMap<br/>Alternative base layer"]
        OpenAIP["OpenAIP<br/>Airspace & airport overlay"]
    end

    subgraph Browser["🌐 Browser (Client)"]
        User["User / VR Headset<br/>http://localhost:3000"]
    end

    %% MSFS → Bridge
    SimConnect -- "SimConnect SDK<br/>(shared memory / IPC)" --> BridgeSimConnect

    %% Bridge internal
    BridgeSimConnect -- "Updates local_telemetry dict<br/>(thread-safe)" --> BridgeHTTPServer
    BridgeSimConnect -- "POST JSON payload" --> BridgeCloudAPI

    %% Bridge → Server
    BridgeHTTPServer -- "HTTP GET<br/>http://localhost:5912" --> BridgeMgr
    BridgeMgr -- "stdout/stderr logs" --> ExpressAPI

    %% Server → Frontend
    ViteSSG -- "Served at /" --> User
    ExpressAPI -- "SSE /api/telemetry/stream<br/>(real-time push)" --> AppShell
    ExpressAPI -- "REST polling fallback" --> BridgeLauncherUI

    %% Frontend internal — data flows
    AppShell -- "telemetry + waypoints" --> HUD
    AppShell -- "waypoints + active idx" --> FlightPlan
    AppShell -- "telemetry + map config" --> Map
    AppShell -- "bridge control" --> BridgeLauncherUI
    AppShell -- "setup help" --> Guide

    %% Map → Tile Servers (the map's own data source)
    Map -- "HTTPS tile requests<br/>/{z}/{x}/{y}.png" --> CartoDB
    Map -- "HTTPS tile requests" --> OSM
    Map -- "HTTPS overlay tiles" --> OpenAIP

    %% Styling
    classDef msfs fill:#1a1a2e,stroke:#16213e,color:#e0e0e0
    classDef bridge fill:#1b4332,stroke:#2d6a4f,color:#b7e4c7
    classDef server fill:#003049,stroke:#005f73,color:#caf0f8
    classDef frontend fill:#3c1361,stroke:#52307c,color:#e0aaff
    classDef tiles fill:#1a535c,stroke:#2a9d8f,color:#a8dadc
    classDef browser fill:#3a0ca3,stroke:#4361ee,color:#ffffff

    class MSFS msfs
    class BridgeSimConnect,BridgeHTTPServer,BridgeCloudAPI bridge
    class ExpressAPI,BridgeMgr,ViteSSG server
    class AppShell,HUD,FlightPlan,BridgeLauncherUI,Guide frontend
    class Map frontend
    class CartoDB,OSM,OpenAIP tiles
    class User browser
```

## Data Flow — Telemetry + Map Tiles

There are **two independent data pipelines** feeding the frontend:

1. **Telemetry pipeline** (blue) — aircraft position, speed, heading, etc. flows from MSFS through the bridge to the server and into the React app.
2. **Map tile pipeline** (green) — the Leaflet map fetches raster tiles directly from online tile servers (CartoDB, OpenStreetMap, OpenAIP) in the browser.

```mermaid
flowchart LR
    subgraph Telemetry["📡 Telemetry Pipeline"]
        direction LR
        A["MSFS 2020<br/>SimConnect SDK"]:::msfs
        B["Python Bridge<br/>msfs_bridge.py<br/>Polls every 1-2s"]:::bridge
        C["Local HTTP<br/>localhost:5912"]:::bridge
        D["Node.js Server<br/>server.ts<br/>POST /api/telemetry"]:::server
        E["In-Memory Store<br/>currentTelemetry"]:::server
        F["SSE Stream<br/>/api/telemetry/stream"]:::server
    end

    subgraph MapTiles["🗺️ Map Tile Pipeline"]
        direction LR
        T1["CartoDB<br/>Dark/Light tiles"]:::tiles
        T2["OpenStreetMap<br/>Base layer"]:::tiles
        T3["OpenAIP<br/>Airspace overlay"]:::tiles
    end

    G["App.tsx<br/>Leaflet Map + UI"]:::frontend
    H["FlightDeckHUD<br/>FlightPlanPanel"]:::frontend

    A --> B --> C --> D --> E --> F
    F --> G
    G --> H

    T1 -- "HTTPS tiles" --> G
    T2 -- "HTTPS tiles" --> G
    T3 -- "HTTPS overlay" --> G

    classDef msfs fill:#1a1a2e,stroke:#16213e,color:#e0e0e0
    classDef bridge fill:#1b4332,stroke:#2d6a4f,color:#b7e4c7
    classDef server fill:#003049,stroke:#005f73,color:#caf0f8
    classDef frontend fill:#3c1361,stroke:#52307c,color:#e0aaff
    classDef tiles fill:#1a535c,stroke:#2a9d8f,color:#a8dadc

    class A msfs
    class B,C bridge
    class D,E,F server
    class G,H frontend
    class T1,T2,T3 tiles
```

## Component Dependency Map

```mermaid
graph TB
    subgraph External["External Services"]
        SimConnectAPI["SimConnect API"]
        CloudAPI["Cloud Telemetry API<br/>(AIS endpoint)"]
        CartoDB["CartoDB<br/>Dark / Light / Voyager tiles"]
        OSM["OpenStreetMap<br/>Base layer tiles"]
        OpenAIP["OpenAIP<br/>Airspace & airport overlay"]
    end

    subgraph Backend["Backend Layer"]
        BridgePy["msfs_bridge.py<br/>Python · SimConnect · HTTP"]
        ServerTS["server.ts<br/>Node.js · Express · Vite"]
    end

    subgraph Frontend["Frontend Layer"]
        App["App.tsx<br/>Root component<br/>(contains Leaflet map)"]
        HUD["FlightDeckHUD.tsx<br/>Telemetry gauges"]
        Plan["FlightPlanPanel.tsx<br/>Waypoint management"]
        Launcher["BridgeLauncher.tsx<br/>Bridge control UI"]
        Guide["MSFSBridgeGuide.tsx<br/>Setup instructions"]
        BearingUtil["bearing.ts<br/>Navigation math"]
    end

    SimConnectAPI --> BridgePy
    BridgePy --> CloudAPI
    BridgePy --> ServerTS
    ServerTS -- "SSE + REST" --> App
    App -- "telemetry + waypoints" --> HUD
    App -- "waypoints + active idx" --> Plan
    App -- "bridge control" --> Launcher
    App -- "setup help" --> Guide
    Plan -- "bearing calculation" --> BearingUtil

    %% Map tile connections (browser → tile servers)
    App -- "L.tileLayer() → HTTPS" --> CartoDB
    App -- "L.tileLayer() → HTTPS" --> OSM
    App -- "L.tileLayer() → HTTPS" --> OpenAIP

    classDef ext fill:#2d2d2d,stroke:#555,color:#ccc
    classDef be fill:#003049,stroke:#005f73,color:#caf0f8
    classDef fe fill:#3c1361,stroke:#52307c,color:#e0aaff
    classDef tiles fill:#1a535c,stroke:#2a9d8f,color:#a8dadc

    class SimConnectAPI,CloudAPI ext
    class CartoDB,OSM,OpenAIP tiles
    class BridgePy,ServerTS be
    class App,HUD,Plan,Launcher,Guide,BearingUtil fe
```

## Bridge Process Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Idle: Server starts

    Idle --> Starting: User clicks "Start Bridge"
    Starting --> resolvePython: POST /api/bridge/start
    resolvePython --> Spawning: resolveExecutableOnPath()
    Spawning --> Running: spawn("python msfs_bridge.py")
    Spawning --> Failed: Python not found

    Running --> Logging: stdout/stderr → SSE /api/bridge/logs
    Running --> Polling: Server polls localhost:5912
    Polling --> Running: Telemetry received

    Running --> Stopping: User clicks "Stop Bridge"
    Stopping --> Killed: SIGTERM / taskkill
    Killed --> Idle: Process exited

    Failed --> Idle: Error shown in UI

    Running --> Crashed: Process exits unexpectedly
    Crashed --> Idle: Auto-detected via exit event
```

## Frontend Tab Structure

```mermaid
graph LR
    App["App.tsx<br/>Sidebar + Content Area"]

    subgraph Tabs["Tab Navigation"]
        T1["HUD Tab"]
        T2["Flight Plan Tab"]
        T3["Bridge Tab"]
        T4["Launcher Tab"]
    end

    App --> T1
    App --> T2
    App --> T3
    App --> T4

    T1 --> FD["FlightDeckHUD.tsx<br/>· Airspeed / Altitude / Heading<br/>· Pitch / Bank / Vertical Speed<br/>· Fuel / Gear / Flaps<br/>· Wind direction & speed"]
    T2 --> FP["FlightPlanPanel.tsx<br/>· Waypoint list<br/>· Active leg highlight<br/>· Distance & bearing<br/>· ETA calculation"]
    T3 --> SG["MSFSBridgeGuide.tsx<br/>· Step-by-step setup<br/>· SimConnect config<br/>· Troubleshooting"]
    T4 --> BL["BridgeLauncher.tsx<br/>· Start / Stop controls<br/>· Live log viewer<br/>· Connection status<br/>· Python path config"]

    classDef app fill:#1a1a2e,stroke:#16213e,color:#e0e0e0
    classDef tab fill:#3c1361,stroke:#52307c,color:#e0aaff
    classDef comp fill:#52307c,stroke:#7b2cbf,color:#f0d0ff

    class App app
    class T1,T2,T3,T4 tab
    class FD,FP,SG,BL comp
```

## Network Topology

```mermaid
flowchart TB
    subgraph LocalPC["💻 Local PC"]
        direction TB
        MSFS["MSFS 2020<br/>SimConnect"]
        Python["Python Bridge<br/>msfs_bridge.py<br/>Port 5912"]
        Node["Node.js Server<br/>server.ts<br/>Port 3000"]
        Browser["Browser<br/>localhost:3000"]

        MSFS <--> Python
        Python -- "HTTP GET /" --> Node
        Node -- "SSE + REST" --> Browser
    end

    subgraph Cloud["☁️ Cloud Services"]
        AIS["AIS Telemetry API<br/>europe-west2.run.app"]
        CartoDB["CartoDB<br/>Map tiles"]
        OSM["OpenStreetMap<br/>Map tiles"]
        OpenAIP["OpenAIP<br/>Airspace overlay"]
    end

    Python -- "POST /api/telemetry" --> AIS

    Browser -- "HTTPS tiles<br/>/{z}/{x}/{y}.png" --> CartoDB
    Browser -- "HTTPS tiles" --> OSM
    Browser -- "HTTPS overlay tiles" --> OpenAIP

    classDef pc fill:#1a1a2e,stroke:#16213e,color:#e0e0e0
    classDef cloud fill:#003049,stroke:#005f73,color:#caf0f8
    classDef tiles fill:#1a535c,stroke:#2a9d8f,color:#a8dadc

    class MSFS,Python,Node,Browser pc
    class AIS cloud
    class CartoDB,OSM,OpenAIP tiles
```

## Key Ports & Endpoints

| Component | Port / URL | Protocol | Purpose |
|-----------|-----------|----------|---------|
| Python Bridge | `localhost:5912` | HTTP | CORS JSON API for telemetry |
| Node.js Server | `localhost:3000` | HTTP + SSE | REST API + real-time stream |
| SimConnect | Shared memory | IPC | MSFS ↔ Python telemetry |
| Cloud API | `europe-west2.run.app` | HTTPS | Remote telemetry relay |

### REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/telemetry/current` | Latest telemetry snapshot |
| `POST` | `/api/telemetry` | Submit new telemetry |
| `GET` | `/api/telemetry/stream` | SSE real-time stream |
| `POST` | `/api/telemetry/reset` | Clear telemetry session |
| `GET` | `/api/bridge/logs` | SSE bridge log stream |
| `POST` | `/api/bridge/start` | Launch Python bridge |
| `POST` | `/api/bridge/stop` | Terminate Python bridge |
