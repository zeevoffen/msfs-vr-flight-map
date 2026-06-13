import time
import sys
import os
import math
import re
import xml.etree.ElementTree as ET
import json
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

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
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        try:
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(local_telemetry).encode("utf-8"))
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError, OSError):
            # Browser or client disconnected before we could reply — safe to ignore
            pass

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    """Handle each request in a separate thread to avoid blocking."""
    daemon_threads = True
    allow_reuse_address = True

def start_local_server():
    try:
        # Binding to 0.0.0.0 on port 5912 to support VR devices / external local polling
        server = ThreadedHTTPServer(("0.0.0.0", 5912), LocalTelemetryServer)
        server.serve_forever()
    except Exception as e:
        print(f"[LOCAL SERVER ERROR] Could not bind to port 5912: {e}")

# Spin up the local HTTP CORS proxy in a background thread
server_thread = threading.Thread(target=start_local_server, daemon=True)
server_thread.start()

# API URL of this server
API_URL = "https://ais-dev-jmedlzjoiuuc3grfd56efq-255085531100.europe-west2.run.app/api/telemetry"

print("=" * 60)
print("     MSFS 2020 VR FLIGHT MAP - AUTOMATED TELEMETRY BRIDGE")
print("=" * 60)
print(f"Target Server: {API_URL}")
print("Local Loopback Server: http://127.0.0.1:5912/ (CORS-enabled)")

def parse_dms(pos_str):
    """Parses MSFS Degrees-Minutes-Seconds coordinate formats."""
    match = re.search(r"([NSEW])\s*(\d+)°?\s*(\d+)'?\s*([\d.]+)\"?", pos_str)
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
        return float(re.sub(r"[^\d.-]", "", pos_str))
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

def haversine_nm(lat1, lon1, lat2, lon2):
    """Returns the great-circle distance in nautical miles."""
    lat1_rad, lon1_rad, lat2_rad, lon2_rad = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    a = math.sin(dlat / 2.0) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return 3440.065 * c


def locate_active_flight_plan(current_lat=None, current_lon=None):
    """Locates and parses the active flight plan automatically from MSFS AppData directories."""
    local_appdata = os.environ.get("LOCALAPPDATA", "")
    appdata = os.environ.get("APPDATA", "")

    candidates = []
    search_roots = [
        os.path.join(local_appdata, "Packages", "Microsoft.FlightSimulator_8wekyb3d8bbwe", "LocalState", "MISSIONS", "Custom", "CustomFlight"),
        os.path.join(appdata, "Microsoft Flight Simulator", "MISSIONS", "Custom", "CustomFlight"),
        os.path.join(local_appdata, "Packages", "Microsoft.FlightSimulator_8wekyb3d8bbwe", "LocalState", "MISSIONS"),
        os.path.join(appdata, "Microsoft Flight Simulator", "MISSIONS"),
        os.path.join(local_appdata, "Packages", "Microsoft.FlightSimulator_8wekyb3d8bbwe", "LocalState", "FlightPlans"),
        os.path.join(appdata, "Microsoft Flight Simulator", "FlightPlans"),
        os.path.join(local_appdata, "Packages", "Microsoft.FlightSimulator_8wekyb3d8bbwe", "LocalState", "SavedFlights"),
        os.path.join(appdata, "Microsoft Flight Simulator", "SavedFlights"),
        os.path.join(local_appdata, "Packages", "Microsoft.FlightSimulator_8wekyb3d8bbwe", "LocalState"),
        os.path.join(appdata, "Microsoft Flight Simulator"),
        # Bush trip locations (Packages\Official\Steam\asobo-bushtrip-*)
        os.path.join(local_appdata, "Packages", "Microsoft.FlightSimulator_8wekyb3d8bbwe", "LocalState", "Packages", "Official", "Steam"),
        os.path.join(appdata, "Microsoft Flight Simulator", "Packages", "Official", "Steam"),
    ]

    for root in search_roots:
        if os.path.isfile(root) and root.lower().endswith(".pln"):
            candidates.append(root)
        elif os.path.isdir(root):
            for dirpath, _, files in os.walk(root):
                for filename in files:
                    if filename.lower().endswith(".pln"):
                        candidates.append(os.path.join(dirpath, filename))

    candidates = list(dict.fromkeys(candidates))

    parsed_candidates = []

    for path in candidates:
        try:
            tree = ET.parse(path)
            root = tree.getroot()
            waypoints = []

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
                            "icao": icao,
                        })

            if waypoints:
                mtime = os.path.getmtime(path)
                closest_distance_nm = float("inf")
                if current_lat is not None and current_lon is not None:
                    closest_distance_nm = min(
                        haversine_nm(current_lat, current_lon, wp["latitude"], wp["longitude"])
                        for wp in waypoints
                    )

                parsed_candidates.append({
                    "path": path,
                    "waypoints": waypoints,
                    "mtime": mtime,
                    "closest_distance_nm": closest_distance_nm,
                })
        except Exception as e:
            print(f"Error parsing flight plan {path}: {e}")

    if not parsed_candidates:
        return None

    if current_lat is not None and current_lon is not None:
        nearby_candidates = [c for c in parsed_candidates if c["closest_distance_nm"] <= 250.0]
        if nearby_candidates:
            best_candidate = min(
                nearby_candidates,
                key=lambda c: (c["closest_distance_nm"], -len(c["waypoints"]), -c["mtime"])
            )
        else:
            best_candidate = min(
                parsed_candidates,
                key=lambda c: (c["closest_distance_nm"], -len(c["waypoints"]), -c["mtime"])
            )
    else:
        best_candidate = max(parsed_candidates, key=lambda c: (c["mtime"], len(c["waypoints"])))

    waypoint_count = len(best_candidate['waypoints'])
    file_path = best_candidate['path']
    closest_nm = best_candidate.get('closest_distance_nm', float('inf'))
    print(f"-> SELECTED flight plan: {file_path}")
    print(f"   Waypoints: {waypoint_count}, Closest distance: {closest_nm:.1f}nm")
    return best_candidate["waypoints"]


def should_reload_flight_plan(current_lat, current_lon, cached_waypoints, threshold_nm=500.0):
    if not cached_waypoints or current_lat is None or current_lon is None:
        return True
    closest = min(
        haversine_nm(current_lat, current_lon, wp["latitude"], wp["longitude"]) for wp in cached_waypoints
    )
    return closest > threshold_nm

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

# Don't load flight plan on startup — wait until we have valid coordinates
cached_waypoints = None

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

                # Re-verify flight plan if empty or if the current aircraft is far from the cached route
                reload_check = should_reload_flight_plan(lat, lon, cached_waypoints)
                print(f"[DEBUG] Reload check: {reload_check}, cached waypoints: {len(cached_waypoints) if cached_waypoints else 0}", end="")
                if reload_check:
                    print(f" -> RELOADING!", end="")
                    cached_waypoints = locate_active_flight_plan(lat, lon)
                print()  # newline

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
                                print("\n" + "=" * 60)
                                print("[INFO] Server is running in Protected Developer Sandbox Mode.")
                                print("The Dev Sandbox (ais-dev-...) requires Google credentials in your browser.")
                                print("Terminal programs cannot authenticate, so Cloud Upload is bypassed.")
                                print("BUT THE DIRECT LOCAL LINK IS WORKING! Zero-lag local telemetry active at:")
                                print("       ---> http://127.0.0.1:5912/ <---")
                                print("Ensure '127.0.0.1' or 'localhost' is set in the Network IP box in your browser.")
                                print("=" * 60 + "\n")
                                requests._redirect_warn_printed = True
                            print(f"[LOCAL PC LINK ACTIVE] Lat: {lat:.5f} | Lng: {lon:.5f} | Alt: {alt:.0f}ft | Spd: {ias:.0f}kts        ", end="\r")
                        else:
                            print(f"[LIVE CLOUD LINK] Lat: {lat:.5f} | Lng: {lon:.5f} | Alt: {alt:.0f}ft | Spd: {ias:.0f}kts        ", end="\r")
                    else:
                        print(f"Error transmission: Server code {res.status_code} - Payload was successfully cached locally on 5912.")
                except Exception as e:
                    # Don't spam standard exceptions, just print cleanly
                    # If this fails (e.g. cloud deployment offline), we still cache on 5912 so local direct setup is perfect
                    print(f"Telemetry Post to Server Offline/Failed: {e} | Local CORS caching is still ACTIVE.", end="\r")
            else:
                # Still output local_telemetry isConnected = False status on loopback
                local_telemetry.clear()
                local_telemetry.update({"isConnected": False})
                print("Retrieving flight variables... waiting for telemetry session load.", end="\r")
                
        except Exception as inner_e:
            print(f"SimConnect read error (might be reloading/between flights): {inner_e}")
            
        time.sleep(1.0)
except KeyboardInterrupt:
    print("\nExiting Telemetry Bridge. Safe flying!")
