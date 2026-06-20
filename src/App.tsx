import React, { useEffect, useRef, useState } from "react";
import { Telemetry, Waypoint, MapStyle } from "./types";
import FlightDeckHUD from "./components/FlightDeckHUD";
import FlightPlanPanel from "./components/FlightPlanPanel";
import MSFSBridgeGuide from "./components/MSFSBridgeGuide";
import BridgeLauncher from "./components/BridgeLauncher";
import { 
  Compass, Map, Settings, Layers, Lock, Unlock, Navigation, 
  ChevronRight, ChevronLeft, RefreshCw, Plane, CheckCircle, Rocket
} from "lucide-react";
import { computeBearing } from "./utils/bearing";

const DEFAULT_WAYPOINTS: Waypoint[] = [];

export default function App() {
  const [waypoints, setWaypoints] = useState<Waypoint[]>(DEFAULT_WAYPOINTS);
  const [activeWaypointIdx, setActiveWaypointIdx] = useState<number>(0);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [activeTab, setActiveTab] = useState<"hud" | "plan" | "bridge" | "launcher">("hud");
  
  // Map and viewport settings
  const [mapStyle, setMapStyle] = useState<MapStyle>("dark");
  const [mapLock, setMapLock] = useState<boolean>(true); // Holds camera follow on plane
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [mockActive, setMockActive] = useState<boolean>(false);
  // Debug demo mode – auto-activates to visually verify heading rotation
  const [debugMode, setDebugMode] = useState<boolean>(true);
  const debugIntervalRef = useRef<any>(null);
  const [localPcIp, setLocalPcIpState] = useState<string>(() => {
    return localStorage.getItem("msfs_local_pc_ip") || "127.0.0.1";
  });
  const localPcIpRef = useRef<string>(localPcIp);

  const setLocalPcIp = (ip: string) => {
    localStorage.setItem("msfs_local_pc_ip", ip);
    setLocalPcIpState(ip);
    localPcIpRef.current = ip;
  };

  // References for Leaflet map elements
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const routePolylineRef = useRef<any>(null);
  const activeLegPolylineRef = useRef<any>(null);
  const planeMarkerRef = useRef<any>(null);
  const waypointMarkersRef = useRef<any[]>([]);
  // Store previous aircraft position to compute heading from movement vector
  const prevPosRef = useRef<[number, number] | null>(null);
  // Persist last displayed rotation when aircraft is stationary.
  const rotationRef = useRef<number>(0);

  // Debug demo: generate a random flight path between two real airports
  const generateDebugPath = (): Waypoint[] => {
    // Real airports with ICAO codes around the world
    const airports: { icao: string; name: string; lat: number; lng: number }[] = [
      // Europe
      { icao: "EGLL", name: "London Heathrow", lat: 51.47, lng: -0.46 },
      { icao: "LFPG", name: "Paris CDG", lat: 49.01, lng: 2.55 },
      { icao: "LIRF", name: "Rome Fiumicino", lat: 41.80, lng: 12.24 },
      { icao: "LEBL", name: "Barcelona", lat: 41.29, lng: 2.08 },
      { icao: "EHAM", name: "Amsterdam Schiphol", lat: 52.31, lng: 4.76 },
      { icao: "EDDB", name: "Berlin Brandenburg", lat: 52.35, lng: 13.52 },
      { icao: "LGAV", name: "Athens", lat: 37.94, lng: 23.94 },
      { icao: "LTFM", name: "Istanbul", lat: 41.27, lng: 28.75 },
      { icao: "BIKF", name: "Reykjavik Keflavik", lat: 63.99, lng: -22.61 },
      { icao: "LPPT", name: "Lisbon", lat: 38.78, lng: -9.13 },
      { icao: "LFMN", name: "Nice Côte d'Azur", lat: 43.66, lng: 7.22 },
      { icao: "LSZH", name: "Zurich", lat: 47.46, lng: 8.55 },
      { icao: "LOWW", name: "Vienna", lat: 48.11, lng: 16.57 },
      // North America
      { icao: "KJFK", name: "New York JFK", lat: 40.64, lng: -73.78 },
      { icao: "KLAX", name: "Los Angeles", lat: 33.94, lng: -118.41 },
      { icao: "KSFO", name: "San Francisco", lat: 37.62, lng: -122.38 },
      { icao: "KMIA", name: "Miami", lat: 25.79, lng: -80.29 },
      { icao: "KORD", name: "Chicago O'Hare", lat: 41.98, lng: -87.90 },
      { icao: "KSEA", name: "Seattle Tacoma", lat: 47.45, lng: -122.31 },
      { icao: "KLAS", name: "Las Vegas", lat: 36.08, lng: -115.15 },
      { icao: "CYVR", name: "Vancouver", lat: 49.19, lng: -123.18 },
      { icao: "MMMX", name: "Mexico City", lat: 19.44, lng: -99.07 },
      { icao: "MMUN", name: "Cancún", lat: 21.04, lng: -86.87 },
      { icao: "KDFW", name: "Dallas Fort Worth", lat: 32.90, lng: -97.04 },
      { icao: "KATL", name: "Atlanta", lat: 33.64, lng: -84.43 },
      // South America
      { icao: "SBGL", name: "Rio de Janeiro Galeão", lat: -22.81, lng: -43.25 },
      { icao: "SAEZ", name: "Buenos Aires Ezeiza", lat: -34.82, lng: -58.54 },
      { icao: "SPJC", name: "Lima Jorge Chávez", lat: -12.02, lng: -77.11 },
      { icao: "SKBO", name: "Bogotá El Dorado", lat: 4.70, lng: -74.15 },
      { icao: "SCEL", name: "Santiago Arturo Merino", lat: -33.39, lng: -70.79 },
      // Asia
      { icao: "RJTT", name: "Tokyo Haneda", lat: 35.55, lng: 139.78 },
      { icao: "ZBAA", name: "Beijing Capital", lat: 40.08, lng: 116.58 },
      { icao: "VTBS", name: "Bangkok Suvarnabhumi", lat: 13.69, lng: 100.75 },
      { icao: "WSSS", name: "Singapore Changi", lat: 1.36, lng: 103.99 },
      { icao: "OMDB", name: "Dubai", lat: 25.25, lng: 55.36 },
      { icao: "VABB", name: "Mumbai", lat: 19.09, lng: 72.87 },
      { icao: "VHHH", name: "Hong Kong", lat: 22.31, lng: 113.92 },
      { icao: "RKSI", name: "Seoul Incheon", lat: 37.46, lng: 126.45 },
      { icao: "WADD", name: "Bali Ngurah Rai", lat: -8.75, lng: 115.17 },
      { icao: "RCTP", name: "Taipei Taoyuan", lat: 25.08, lng: 121.23 },
      // Africa
      { icao: "HECA", name: "Cairo", lat: 30.12, lng: 31.41 },
      { icao: "FACT", name: "Cape Town", lat: -33.97, lng: 18.60 },
      { icao: "HKJK", name: "Nairobi Jomo Kenyatta", lat: -1.32, lng: 36.93 },
      { icao: "GMMX", name: "Marrakech Menara", lat: 31.61, lng: -8.03 },
      { icao: "DNMM", name: "Lagos Murtala Muhammed", lat: 6.58, lng: 3.32 },
      // Oceania
      { icao: "YSSY", name: "Sydney Kingsford Smith", lat: -33.94, lng: 151.18 },
      { icao: "NZAA", name: "Auckland", lat: -37.01, lng: 174.79 },
      { icao: "PHNL", name: "Honolulu", lat: 21.32, lng: -157.92 },
    ];

    // Pick two different airports
    const idx1 = Math.floor(Math.random() * airports.length);
    let idx2 = Math.floor(Math.random() * airports.length);
    while (idx2 === idx1) idx2 = Math.floor(Math.random() * airports.length);
    const dep = airports[idx1];
    const arr = airports[idx2];

    // Calculate distance between airports
    const toRad = (d: number) => d * Math.PI / 180;
    const dLat = toRad(arr.lat - dep.lat);
    const dLng = toRad(arr.lng - dep.lng);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(dep.lat)) * Math.cos(toRad(arr.lat)) * Math.sin(dLng/2)**2;
    const distNm = 3440.065 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    // Place waypoints every ~150-250 NM along the route
    const legNm = 150 + Math.random() * 100;
    const numIntermediate = Math.max(1, Math.floor(distNm / legNm));
    const totalWps = numIntermediate + 2;

    const wps: Waypoint[] = [];
    for (let i = 0; i < totalWps; i++) {
      const fraction = i / (totalWps - 1);
      // Use proper great-circle interpolation (slerp)
      const A = Math.sin((1 - fraction) * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))) / Math.sqrt(a);
      const B = Math.sin(fraction * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))) / Math.sqrt(a);
      const x = A * Math.cos(toRad(dep.lat)) * Math.cos(toRad(dep.lng)) + B * Math.cos(toRad(arr.lat)) * Math.cos(toRad(arr.lng));
      const y = A * Math.cos(toRad(dep.lat)) * Math.sin(toRad(dep.lng)) + B * Math.cos(toRad(arr.lat)) * Math.sin(toRad(arr.lng));
      const z = A * Math.sin(toRad(dep.lat)) + B * Math.sin(toRad(arr.lat));
      const lat = Math.atan2(z, Math.sqrt(x*x + y*y)) * 180 / Math.PI;
      const lng = Math.atan2(y, x) * 180 / Math.PI;

      const isFirst = i === 0;
      const isLast = i === totalWps - 1;
      wps.push({
        id: `DBG-${i}`,
        name: isFirst ? dep.name : isLast ? arr.name : `Waypoint ${i}`,
        latitude: lat,
        longitude: lng,
        elevationFeet: isFirst || isLast ? 0 : 3000 + Math.floor(Math.random() * 7000),
        type: isFirst || isLast ? "Airport" : "Waypoint",
      });
    }
    console.log(`[DEBUG] Flight: ${dep.icao} → ${arr.icao}, ${distNm.toFixed(0)} NM, ${totalWps} waypoints`);
    return wps;
  };

  // Simulation state variables if using Mock Tracker
  const mockStateRef = useRef({
    lat: 39.5, // Default Nevada area (near Reno)
    lng: -119.8,
    heading: 240,
    altitude: 3500,
    airspeed: 120,
    pitch: 1.5,
    bank: 0,
    verticalSpeed: 0,
    fuelPercent: 88,
    flaps: 0,
    gear: "Up",
  });

  // Calculate distance & heading between aircraft and active waypoint
  const getDistanceAndBearingToActive = () => {
    if (!telemetry || waypoints.length === 0 || activeWaypointIdx >= waypoints.length) {
      return { distance: null, bearing: null };
    }

    const wp = waypoints[activeWaypointIdx];
    const lat1 = telemetry.latitude;
    const lon1 = telemetry.longitude;
    const lat2 = wp.latitude;
    const lon2 = wp.longitude;

    // Great circle route distance
    const radLat1 = (lat1 * Math.PI) / 180;
    const radLat2 = (lat2 * Math.PI) / 180;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;

    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) + 
      Math.cos(radLat1) * Math.cos(radLat2) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceNm = c * 3440.065; // Earth radius in NM

    // Course bearing
    const y = Math.sin(dLon) * Math.cos(radLat2);
    const x = 
      Math.cos(radLat1) * Math.sin(radLat2) - 
      Math.sin(radLat1) * Math.cos(radLat2) * Math.cos(dLon);
    
    let bearingDeg = (Math.atan2(y, x) * 180) / Math.PI;
    bearingDeg = (bearingDeg + 360) % 360;

    return { distance: distanceNm, bearing: bearingDeg };
  };

  const areWaypointsEqual = (a: Waypoint[], b: Waypoint[]) => {
    if (a.length !== b.length) return false;
    return a.every((wp, idx) => {
      const other = b[idx];
      return (
        wp.name === other.name &&
        wp.latitude === other.latitude &&
        wp.longitude === other.longitude &&
        wp.elevationFeet === other.elevationFeet
      );
    });
  };

  const { distance: distanceToActive, bearing: bearingToActive } = getDistanceAndBearingToActive();

  // 1. Establish robust HTTP polling telemetry link (1-second intervals)
  useEffect(() => {
    let pollInterval: any = null;

    const updateState = (data: any) => {
      if (data.isConnected) {
        setTelemetry(data);
        // Turn off mockup simulator to let live sim control instruments
        setMockActive(false);

        // Update waypoints automatically from the MSFS active flight plan
        if (data.waypoints && data.waypoints.length > 0) {
          setWaypoints((current) => {
            if (current.length === 0) {
              return data.waypoints;
            }
            if (!areWaypointsEqual(current, data.waypoints)) {
              return data.waypoints;
            }
            return current;
          });
        }
      } else {
        // Keep current state but toggle live off
        setTelemetry((prev) => (prev ? { ...prev, isConnected: false } : null));
      }
    };

    const pollTelemetry = async () => {
      // A. Attempt to fetch direct from local PC tracker bridge first (zero server latency)
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1800); // 1.8s timeout offers great stability on local socket queues
        const targetIp = localPcIpRef.current || "127.0.0.1";
        const localRes = await fetch(`http://${targetIp}:5912/`, { 
          mode: "cors", 
          signal: controller.signal 
        });
        clearTimeout(timeoutId);
        if (localRes.ok) {
          const data = await localRes.json();
          if (data && data.latitude !== undefined) {
            updateState(data);
            return; // Local link active! Skip cloud fetch for this cycle
          }
        }
      } catch (e) {
        // Local bridge is offline, silent fallback to cloud
      }

      // B. Standard Server Fallback
      try {
        const res = await fetch("/api/telemetry/current");
        if (res.ok) {
          const data = await res.json();
          updateState(data);
        }
      } catch (e) {
        console.error("Telemetry poll error:", e);
      }
    };

    console.log("[TELEMETRY] Starting high-reliability HTTP telemetry polling...");
    pollTelemetry(); // Run immediately
    pollInterval = setInterval(pollTelemetry, 1000);

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, []);

  // 2. Clear server telemetry telemetry session
  const handleResetTelemetryOnServer = async () => {
    try {
      await fetch("/api/telemetry/reset", { method: "POST" });
      setTelemetry(null);
    } catch (e) {
      console.error("Failed to reset telemetry on server", e);
    }
  };

  // 3. Debug demo mode – auto-starts a flight over the Mediterranean
  useEffect(() => {
    if (!debugMode) return;
    // Generate a random Mediterranean path and start flying
    const debugWps = generateDebugPath();
    setWaypoints(debugWps);
    setActiveWaypointIdx(0);
    mockStateRef.current.lat = debugWps[0].latitude;
    mockStateRef.current.lng = debugWps[0].longitude;
    mockStateRef.current.altitude = 5000;
    mockStateRef.current.heading = 135; // SE heading
    setMockActive(true);
    setTelemetry({
      latitude: debugWps[0].latitude,
      longitude: debugWps[0].longitude,
      altitude: 5000,
      heading: 135,
      airspeed: 120,
      verticalSpeed: 0,
      pitch: 1.5,
      bank: 0,
      groundSpeed: 122,
      isConnected: true,
      aircraftType: "Debug Demo – Cessna 172",
      timestamp: Date.now(),
      onGround: false,
      flaps: 0,
      gear: "Up",
      windSpeed: 5,
      windDir: 225,
      fuelPercent: 95,
    });
    // Center map on the debug path
    setTimeout(() => {
      const map = mapInstanceRef.current;
      if (map) map.setView([debugWps[0].latitude, debugWps[0].longitude], 6);
    }, 500);
  }, [debugMode]);

  // Track progress along the flight path for debug mode
  const debugPathProgressRef = useRef(0); // fractional waypoint index
  const debugPathDirectionRef = useRef(1); // 1 = forward, -1 = reverse

  // 3b. Built-in Cockpit autopilot simulation state update (Mock system)
  useEffect(() => {
    if (!mockActive) return;

    // Pre-load default flight plan if none loaded to make testing instant
    if (waypoints.length === 0) {
      const sampleWaypoints: Waypoint[] = [
        { id: "KRNO-L", name: "KRNO (Reno)", latitude: 39.4991, longitude: -119.7681, elevationFeet: 4415, type: "Airport" },
        { id: "KLOL-L", name: "KLOL (Lovelock)", latitude: 40.0983, longitude: -118.5689, elevationFeet: 3960, type: "Airport" },
        { name: "KWMC (Winnemucca)", id: "KWMC-L", latitude: 40.7007, longitude: -117.7917, elevationFeet: 4308, type: "Airport" },
        { id: "KEKO-L", name: "KEKO (Elko)", latitude: 40.8249, longitude: -115.7917, elevationFeet: 5140, type: "Airport" },
      ];
      for (let i = 0; i < sampleWaypoints.length - 1; i++) {
        const p1 = sampleWaypoints[i];
        const p2 = sampleWaypoints[i + 1];
        const radLat1 = (p1.latitude * Math.PI) / 180;
        const radLat2 = (p2.latitude * Math.PI) / 180;
        const dLat = ((p2.latitude - p1.latitude) * Math.PI) / 180;
        const dLon = ((p2.longitude - p1.longitude) * Math.PI) / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        p1.distanceToNextNm = c * 3440.065;
        p1.headingToNextDeg = (Math.atan2(Math.sin(dLon) * Math.cos(radLat2), Math.cos(radLat1) * Math.sin(radLat2) - Math.sin(radLat1) * Math.cos(radLat2) * Math.cos(dLon)) * 180 / Math.PI + 360) % 360;
      }
      setWaypoints(sampleWaypoints);
      setActiveWaypointIdx(0);
      mockStateRef.current.lat = 39.4991;
      mockStateRef.current.lng = -119.7681;
      mockStateRef.current.altitude = 4415;
      debugPathProgressRef.current = 0;
    }

    const interval = setInterval(() => {
      const state = mockStateRef.current;

      if (waypoints.length < 2) return;

      if (debugMode) {
        // DEBUG MODE: Interpolate plane position directly along the path
        // This guarantees the plane flies exactly on the drawn route
        const totalLegs = waypoints.length - 1;
        // Advance progress (speed: ~0.04 legs per tick at 200ms = ~200 knots)
        debugPathProgressRef.current = Math.min(totalLegs, debugPathProgressRef.current + 0.04);
        const progress = debugPathProgressRef.current;
        const legIdx = Math.min(Math.floor(progress), totalLegs - 1);
        const legFrac = progress - legIdx;
        const fromWp = waypoints[legIdx];
        const toWp = waypoints[legIdx + 1];
        // Linear interpolation between waypoints
        const lat = fromWp.latitude + (toWp.latitude - fromWp.latitude) * legFrac;
        const lng = fromWp.longitude + (toWp.longitude - fromWp.longitude) * legFrac;
        // Calculate heading from movement direction
        const dLng = ((toWp.longitude - fromWp.longitude) * Math.PI) / 180;
        const lat1r = (fromWp.latitude * Math.PI) / 180;
        const lat2r = (toWp.latitude * Math.PI) / 180;
        const y = Math.sin(dLng) * Math.cos(lat2r);
        const x = Math.cos(lat1r) * Math.sin(lat2r) - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLng);
        const hdg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
        // Altitude: cruise at FL180-ish, descend near destination
        const altFrac = legIdx / totalLegs;
        const alt = altFrac > 0.85 ? 5000 - (altFrac - 0.85) / 0.15 * 3000 : 5000 + Math.sin(legFrac * Math.PI) * 2000;
        // Update active waypoint index for the HUD
        if (legIdx !== activeWaypointIdx && legIdx < waypoints.length) {
          setActiveWaypointIdx(legIdx);
        }
        state.lat = lat;
        state.lng = lng;
        state.heading = hdg;
        state.altitude = alt;
        state.bank = 0;
        state.verticalSpeed = 0;
        state.pitch = 1.5;
        state.airspeed = 180;
        state.groundSpeed = 182;
        state.fuelPercent = Math.max(0, state.fuelPercent - 0.02);
        // Bounce: reverse direction at both ends instead of jumping
        if (progress >= totalLegs) {
          debugPathProgressRef.current = totalLegs;
          debugPathDirectionRef.current = -1;
        } else if (progress <= 0) {
          debugPathProgressRef.current = 0;
          debugPathDirectionRef.current = 1;
        }
        debugPathProgressRef.current += 0.04 * debugPathDirectionRef.current;
        setTelemetry({
          latitude: lat, longitude: lng, altitude: alt,
          heading: hdg, airspeed: 180, verticalSpeed: 0, pitch: 1.5, bank: 0,
          groundSpeed: 182, isConnected: true, aircraftType: "Debug Demo – Cessna 172",
          timestamp: Date.now(), onGround: false, flaps: 0, gear: "Up",
          windSpeed: 5, windDir: (hdg + 120) % 360, fuelPercent: state.fuelPercent,
        });
      } else {
        // NORMAL SIM MODE: fly toward active waypoint with smooth physics
        let targetLat = state.lat;
        let targetLng = state.lng;
        let targetAlt = 3500;
        let desiredHdg = state.heading;

        if (activeWaypointIdx < waypoints.length) {
          const activeWp = waypoints[activeWaypointIdx];
          targetLat = activeWp.latitude;
          targetLng = activeWp.longitude;
          targetAlt = activeWp.elevationFeet ? activeWp.elevationFeet + 3000 : 3500;
          const dLon1 = ((targetLng - state.lng) * Math.PI) / 180;
          const lat1r = (state.lat * Math.PI) / 180;
          const lat2r = (targetLat * Math.PI) / 180;
          const y1 = Math.sin(dLon1) * Math.cos(lat2r);
          const x1 = Math.cos(lat1r) * Math.sin(lat2r) - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLon1);
          desiredHdg = (Math.atan2(y1, x1) * 180 / Math.PI + 360) % 360;
          const dLat1 = ((targetLat - state.lat) * Math.PI) / 180;
          const dLon2 = ((targetLng - state.lng) * Math.PI) / 180;
          const a1 = Math.sin(dLat1/2)*Math.sin(dLat1/2) + Math.cos((state.lat*Math.PI)/180)*Math.cos((targetLat*Math.PI)/180)*Math.sin(dLon2/2)*Math.sin(dLon2/2);
          const currentDistNm = 3440.065 * 2 * Math.atan2(Math.sqrt(a1), Math.sqrt(1-a1));
          if (currentDistNm < 0.3 && activeWaypointIdx < waypoints.length - 1) {
            setActiveWaypointIdx((prev) => prev + 1);
          }
        }
        let hdgDiff = desiredHdg - state.heading;
        if (hdgDiff > 180) hdgDiff -= 360;
        if (hdgDiff < -180) hdgDiff += 360;
        const turnRateDegPerSec = 4;
        if (Math.abs(hdgDiff) > 0.5) {
          const turnStep = Math.sign(hdgDiff) * Math.min(turnRateDegPerSec, Math.abs(hdgDiff));
          state.heading = (state.heading + turnStep + 360) % 360;
          state.bank = Math.sign(hdgDiff) * Math.min(18, Math.abs(hdgDiff) * 3);
        } else {
          state.heading = desiredHdg;
          state.bank = 0;
        }
        const altDiff = targetAlt - state.altitude;
        if (Math.abs(altDiff) > 50) {
          state.altitude += Math.sign(altDiff) * Math.min(100, Math.abs(altDiff));
          state.verticalSpeed = Math.sign(altDiff) * 400;
          state.pitch = Math.sign(altDiff) * 5;
        } else {
          state.altitude = targetAlt;
          state.verticalSpeed = 0;
          state.pitch = 1.0;
        }
        const speedFactor = 0.0005;
        const radHdg = (state.heading * Math.PI) / 180;
        state.lat += Math.cos(radHdg) * speedFactor;
        state.lng += Math.sin(radHdg) * speedFactor;
        state.fuelPercent = Math.max(0, state.fuelPercent - 0.05);
        setTelemetry({
          latitude: state.lat, longitude: state.lng, altitude: state.altitude,
          heading: state.heading, airspeed: state.airspeed, verticalSpeed: state.verticalSpeed,
          pitch: state.pitch, bank: state.bank, groundSpeed: state.airspeed + 2,
          isConnected: true, aircraftType: "Cessna 172 Skyhawk",
          timestamp: Date.now(), onGround: false, flaps: state.flaps, gear: state.gear,
          windSpeed: 8, windDir: (state.heading + 120) % 360, fuelPercent: state.fuelPercent,
        });
      }
    }, debugMode ? 200 : 1000);

    return () => clearInterval(interval);
  }, [mockActive, waypoints, activeWaypointIdx, telemetry, debugMode]);

  // Toggle between Debug Demo mode and Real Sim mode
  const handleToggleDebugMode = () => {
    if (debugMode) {
      // Switching OFF debug mode → go back to real sim / standby
      setDebugMode(false);
      setMockActive(false);
      setTelemetry(null);
      setWaypoints([]);
      setActiveWaypointIdx(0);
      // Reset mock state to defaults
      mockStateRef.current = {
        lat: 39.5, lng: -119.8, heading: 240, altitude: 3500,
        airspeed: 120, pitch: 1.5, bank: 0, verticalSpeed: 0,
        fuelPercent: 88, flaps: 0, gear: "Up",
      };
    } else {
      // Switching ON debug mode → start demo flight
      setDebugMode(true);
    }
  };

  // Handle Mock simulator trigger
  const handleToggleMockSimulator = () => {
    const isNowActive = !mockActive;
    setMockActive(isNowActive);
    
    if (isNowActive) {
      // Seed default position if telemetry was empty
      if (!telemetry) {
        setTelemetry({
          latitude: mockStateRef.current.lat,
          longitude: mockStateRef.current.lng,
          altitude: mockStateRef.current.altitude,
          heading: mockStateRef.current.heading,
          airspeed: mockStateRef.current.airspeed,
          verticalSpeed: mockStateRef.current.verticalSpeed,
          pitch: mockStateRef.current.pitch,
          bank: mockStateRef.current.bank,
          groundSpeed: mockStateRef.current.airspeed,
          isConnected: true,
          aircraftType: "Cessna 172 Skyhawk",
          timestamp: Date.now(),
          onGround: false,
          flaps: 0,
          gear: "Up",
          windSpeed: 0,
          windDir: 0,
          fuelPercent: 100,
        });
      }
    } else {
      setTelemetry(null);
    }
  };

  // 4. Initializing Leaflet map instance and handling visual style modifications
  useEffect(() => {
    if (typeof window === "undefined" || !(window as any).L || mapInstanceRef.current) return;
    const L = (window as any).L;

    // Initialize Leaflet
    const map = L.map(mapDivRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView([39.5, -119.8], 10);

    // Zoom buttons in the bottom right corner (large enough for Quest controllers)
    L.control.zoom({ position: "bottomright" }).addTo(map);

    mapInstanceRef.current = map;

    // Bind clean resize observer to avoid canvas crashes
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    if (mapDivRef.current) {
      resizeObserver.observe(mapDivRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      planeMarkerRef.current = null;
      routePolylineRef.current = null;
      activeLegPolylineRef.current = null;
      waypointMarkersRef.current = [];
    };
  }, []);

  // 5. Updating Map styles layers dynamically
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const L = (window as any).L;

    // Remove current layer if any
    if (tileLayerRef.current) {
      mapInstanceRef.current.removeLayer(tileLayerRef.current);
    }

    let url = "";
    let attribution = "";
    
    switch (mapStyle) {
      case "satellite":
        url = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
        attribution = "Tiles © Esri";
        break;
      case "topo":
        url = "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png";
        attribution = "Tiles © OpenTopoMap";
        break;
      case "dark":
        url = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
        attribution = "Tiles © CartoDB";
        break;
      case "aero":
        // Utilizing CARTO Dark matter as the underlying map, overlayed with Aeronautical charts
        url = "https://{s}.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}{r}.png";
        attribution = "OpenAIP / CartoDB";
        break;
      case "street":
      default:
        url = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
        attribution = "© OpenStreetMap contributors";
        break;
    }

    const newLayer = L.tileLayer(url, { maxZoom: 18, attribution });
    newLayer.addTo(mapInstanceRef.current);
    tileLayerRef.current = newLayer;

    // If "Aero" is selected, also overlay OpenAIP aeronautical charts
    if (mapStyle === "aero") {
      // OpenAIP offers a standard Tile set showing runways, navigation aids and airspaces
      const aeroOverlay = L.tileLayer("https://api.openaip.net/api/data/openaip/{z}/{x}/{y}.png", {
        maxZoom: 14,
        opacity: 0.8,
        attribution: "OpenAIP Aeronautical Data",
      });
      aeroOverlay.addTo(mapInstanceRef.current);
    }
  }, [mapStyle]);

  // 6. Draw Flight Plan Waypoint Markers (departure & destination only)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const L = (window as any).L;

    // Clear existing markers only
    waypointMarkersRef.current.forEach(m => map.removeLayer(m));
    waypointMarkersRef.current = [];

    if (waypoints.length === 0) return;

    // Show markers for ALL waypoints
    waypoints.forEach((wp, idx) => {
      const isFirst = idx === 0;
      const isLast = idx === waypoints.length - 1;
      const isPassed = idx < activeWaypointIdx;
      const isCurrent = idx === activeWaypointIdx;

      // Color: green=departure, amber=destination, cyan=current, dimmed=passed, gray=upcoming
      let markerColor = "#6b7280"; // upcoming (gray)
      let markerSize = 8;
      let opacity = 0.7;
      if (isFirst) { markerColor = "#10b981"; markerSize = 12; opacity = 1; }       // DEP (green)
      else if (isLast) { markerColor = "#f59e0b"; markerSize = 12; opacity = 1; }    // ARR (amber)
      else if (isCurrent) { markerColor = "#06b6d4"; markerSize = 10; opacity = 1; } // current (cyan)
      else if (isPassed) { opacity = 0.35; }                                         // passed (dimmed)

      const label = isFirst ? "DEP" : isLast ? "ARR" : `${idx}`;
      const markerHtml = `
        <div class="relative flex items-center justify-center">
          <span style="width:${markerSize}px;height:${markerSize}px;border-radius:50%;background:${markerColor};border:2px solid white;box-shadow:0 0 6px ${markerColor};opacity:${opacity};display:inline-block;"></span>
          <span class="absolute -bottom-4 bg-zinc-950/90 border border-zinc-800 text-[8px] font-mono font-bold leading-none px-1 py-0.5 rounded text-zinc-100 whitespace-nowrap shadow-md" style="opacity:${opacity};">
            ${label}
          </span>
        </div>
      `;

      const customIcon = L.divIcon({
        html: markerHtml,
        className: "custom-wp-marker",
        iconSize: [markerSize + 4, markerSize + 16],
        iconAnchor: [(markerSize + 4) / 2, (markerSize + 4) / 2],
      });

      const markerInstance = L.marker([wp.latitude, wp.longitude], { icon: customIcon })
        .addTo(map)
        .bindPopup(`
          <div class="text-xs space-y-1">
            <h4 class="font-bold border-b border-zinc-800 pb-1 text-zinc-200">${wp.name}</h4>
            <p class="text-zinc-400">Position: ${wp.latitude.toFixed(5)}, ${wp.longitude.toFixed(5)}</p>
            ${wp.elevationFeet ? `<p class="text-zinc-400">Alt: ${wp.elevationFeet} FT</p>` : ""}
            <p class="text-zinc-500 font-mono text-[10px]">${isFirst ? "Departure" : isLast ? "Destination" : isCurrent ? "◀ Active" : isPassed ? "Passed" : "Waypoint " + idx}</p>
          </div>
        `);

      waypointMarkersRef.current.push(markerInstance);
    });

    // Cleanup: remove markers when effect re-runs
    return () => {
      waypointMarkersRef.current.forEach(m => {
        try { map.removeLayer(m); } catch (e) {}
      });
      waypointMarkersRef.current = [];
    };
  }, [waypoints, activeWaypointIdx]);

  // 7. Render & Sync Aircraft position marker in real-time, draw full remaining route, and orient triangle based on a point 50 m behind the aircraft
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !telemetry) return;
    const L = (window as any).L;

    const { latitude, longitude, heading } = telemetry;
    console.log('DEBUG telemetry', { latitude, longitude, heading });

    // ------------------------------------------------------------
    // Compute rotation so the triangle points toward the destination airport
    // ------------------------------------------------------------
    // Determine ordered waypoints (may be reversed depending on aircraft position)
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 3440.065; // Earth radius in NM
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    const first = waypoints[0];
    const last = waypoints[waypoints.length - 1];
    const distToFirst = haversine(latitude, longitude, first.latitude, first.longitude);
    const distToLast = haversine(latitude, longitude, last.latitude, last.longitude);
    const orderedWaypoints = distToLast < distToFirst ? [...waypoints].reverse() : waypoints;

    // Destination is the last waypoint in the ordered list
    const destWp = orderedWaypoints[orderedWaypoints.length - 1];
    // Compute rotation based on the movement vector (previous → current).
    // If we don't have a previous position yet, fall back to the telemetry heading.
    // Compute rotation based on the movement vector (previous → current).
    // This follows the original requirement: compare the last known position
    // with the current telemetry position to derive the heading. If we don't
    // have a previous position yet (first update), fall back to the heading
    // reported by the telemetry.
    // Compute rotation based on the movement vector (previous → current).
    // This reflects the actual direction of travel. If we don't have a previous
    // position yet (first update), fall back to the telemetry heading.
    // Use telemetry heading directly, but keep the last displayed heading when the
    // simulation is paused (no change in heading). This avoids the arrow snapping
    // back to north when the aircraft is stationary.
    let rotationDeg = rotationRef.current;
    if (Math.abs(heading - rotationRef.current) > 0.1) {
      rotationDeg = heading;
      rotationRef.current = rotationDeg;
    }
    console.log('DEBUG rotationDeg', rotationDeg, 'telemetry heading', heading);
    // Store current position for the next update
    prevPosRef.current = [latitude, longitude];

    // ------------------------------------------------------------
    // ------------------------------------------------------------
    // Aircraft Marker – triangle rotated by computed angle
    // ------------------------------------------------------------
    // We remove and re-create the marker on every update so the CSS rotation
    // is always applied fresh. This avoids Leaflet caching the old icon HTML.
    // The icon div is intentionally larger than the SVG to prevent clipping
    // when the triangle is rotated.
    const markerSize = 40;
    const half = markerSize / 2;
    // IMPORTANT: The outer div must NOT have a CSS `transform` because Leaflet
    // applies its own `transform` (translate/translate3d) to position the icon
    // on the map. If we set `transform: rotate(...)` on this element, it
    // overwrites Leaflet's positioning and the marker jumps to a wrong location.
    // Instead we rotate an inner <div> that Leaflet doesn't touch.
    const planeHtml = `
      <div style="width:${markerSize}px;height:${markerSize}px;display:flex;align-items:center;justify-content:center;">
        <div style="transform-origin:center center;transform:rotate(${rotationDeg}deg);filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:28px;height:28px;">
            <polygon points="50,5 85,95 50,70 15,95" fill="#f59e0b" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>
    `;

    const planeIcon = L.divIcon({
      html: planeHtml,
      className: "aircraft-marker-container",
      iconSize: [markerSize, markerSize],
      iconAnchor: [half, half],
    });

    // Remove old marker and create a new one with the updated rotation.
    if (planeMarkerRef.current) {
      try { map.removeLayer(planeMarkerRef.current); } catch (e) {}
    }
    planeMarkerRef.current = L.marker([latitude, longitude], {
      icon: planeIcon,
      keyboard: false,
      zIndexOffset: 1000,
    }).addTo(map);

    // ------------------------------------------------------------
    // Auto‑center camera on plane if lock is enabled
    // ------------------------------------------------------------
    if (mapLock) {
      map.setView([latitude, longitude], map.getZoom(), { animate: true, duration: 0.6 });
    }

    // ------------------------------------------------------------
    // Draw the full flight plan route: start airport → ... → destination airport
    // This uses the waypoints received from MSFS telemetry, regardless of the
    // aircraft's current position. The aircraft marker (planeMarkerRef) already
    // shows the live position.
    // ------------------------------------------------------------
    let currentPolyline: any = null;
    if (waypoints.length > 1) {
      // Determine if the flight plan should be displayed in reverse order.
      // If the aircraft is closer to the last waypoint than to the first,
      // we assume the user is flying from the last airport back to the first.
      const toRad = (deg: number) => (deg * Math.PI) / 180;
      const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 3440.065; // Earth radius in NM
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
      };

      const first = waypoints[0];
      const last = waypoints[waypoints.length - 1];
      const distToFirst = haversine(latitude, longitude, first.latitude, first.longitude);
      const distToLast = haversine(latitude, longitude, last.latitude, last.longitude);

      // Draw the path in the original waypoint order (don't reverse)
      const drawWps = waypoints;
      const routeCoords: [number, number][] = [];
      for (let i = 0; i < drawWps.length - 1; i++) {
        const from = drawWps[i];
        const to = drawWps[i + 1];
        const numSegs = 10;
        for (let j = 0; j <= numSegs; j++) {
          const f = j / numSegs;
          const lat = from.latitude + (to.latitude - from.latitude) * f;
          const lng = from.longitude + (to.longitude - from.longitude) * f;
          if (j === 0 && i > 0) continue;
          routeCoords.push([lat, lng]);
        }
      }
      currentPolyline = L.polyline(routeCoords, { color: "#f59e0b", weight: 4, opacity: 0.9 }).addTo(map);
    }

    // Cleanup on re‑run / unmount (StrictMode safe)
    return () => {
      if (currentPolyline) {
        try { map.removeLayer(currentPolyline); } catch (e) {}
      }
    };
  }, [telemetry, mapLock, waypoints, activeWaypointIdx]);

  // Debug overlay state
  const [debugInfo, setDebugInfo] = useState({ heading: 0, rotationDeg: 0, lat: 0, lng: 0 });

  // Update debug info whenever telemetry changes
  useEffect(() => {
    if (telemetry) {
      setDebugInfo({
        heading: telemetry.heading,
        rotationDeg: rotationRef.current,
        lat: telemetry.latitude,
        lng: telemetry.longitude,
      });
    }
  }, [telemetry]);

  return (
    <div className="flex h-screen w-screen overflow-hidden font-sans" id="msfs_main_viewport">
      {/* Dynamic Left Sidebar Cockpit Panel */}
      <div 
        className={`relative z-30 flex h-full border-r border-zinc-800 transition-all duration-300 select-none bg-zinc-950 flex-col shrink-0 ${
          sidebarOpen ? "w-[360px]" : "w-0 overflow-hidden"
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Sub Navigation Panel Toggles */}
          <div className="grid grid-cols-4 bg-zinc-950 border-b border-zinc-800 text-xs text-center font-bold font-mono text-zinc-400">
            <button 
              onClick={() => setActiveTab("hud")}
              className={`py-3 flex flex-col items-center gap-1 border-b-2 hover:text-white transition-all ${
                activeTab === "hud" ? "border-cyan-400 text-cyan-400 bg-zinc-900/30" : "border-transparent"
              }`}
            >
              <Compass className="w-4 h-4" />
              FLIGHT HUD
            </button>
            <button 
              onClick={() => setActiveTab("plan")}
              className={`py-3 flex flex-col items-center gap-1 border-b-2 hover:text-white transition-all ${
                activeTab === "plan" ? "border-cyan-400 text-cyan-400 bg-zinc-900/30" : "border-transparent"
              }`}
            >
              <Map className="w-4 h-4" />
              FLIGHT PLAN
            </button>
            <button 
              onClick={() => setActiveTab("bridge")}
              className={`py-3 flex flex-col items-center gap-1 border-b-2 hover:text-white transition-all ${
                activeTab === "bridge" ? "border-cyan-400 text-cyan-400 bg-zinc-900/30" : "border-transparent"
              }`}
            >
              <Settings className="w-4 h-4" />
              DATA BRIDGE
            </button>
            <button 
              onClick={() => setActiveTab("launcher")}
              className={`py-3 flex flex-col items-center gap-1 border-b-2 hover:text-white transition-all ${
                activeTab === "launcher" ? "border-cyan-400 text-cyan-400 bg-zinc-900/30" : "border-transparent"
              }`}
            >
              <Rocket className="w-4 h-4" />
              LAUNCHER
            </button>
          </div>

          {/* Active Tab contents */}
          <div className="flex-1 min-h-0 bg-zinc-900">
            {activeTab === "hud" && (
              <FlightDeckHUD 
                telemetry={telemetry} 
                activeWaypoint={waypoints[activeWaypointIdx] || null}
                distanceToActiveWaypoint={distanceToActive}
                bearingToActiveWaypoint={bearingToActive}
                debugMode={debugMode}
                onToggleDebug={handleToggleDebugMode}
                waypoints={waypoints}
                activeWaypointIdx={activeWaypointIdx}
              />
            )}
            {activeTab === "plan" && (
              <FlightPlanPanel 
                waypoints={waypoints} 
                setWaypoints={setWaypoints} 
                activeWaypointIndex={activeWaypointIdx}
                setActiveWaypointIndex={setActiveWaypointIdx}
                onSimulatePath={handleToggleMockSimulator}
                isSimulating={mockActive}
              />
            )}
            {activeTab === "bridge" && (
              <MSFSBridgeGuide 
                telemetry={telemetry}
                onResetTelemetry={handleResetTelemetryOnServer}
                mockActive={mockActive}
                onToggleMock={handleToggleMockSimulator}
                localPcIp={localPcIp}
                onLocalPcIpChange={setLocalPcIp}
              />
            )}
            {activeTab === "launcher" && (
              <BridgeLauncher />
            )}
          </div>
        </div>
      </div>

      {/* Button to collapse/expand Left sidebar in VR */}
      <button 
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-40 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-r border-y border-zinc-800 rounded-r-lg w-6 h-14 flex items-center justify-center transition-all shadow-md cursor-pointer hover:text-cyan-400"
        title={sidebarOpen ? "Hide Left deck" : "Show Left deck"}
      >
        {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      {/* Right Map Canvas Panel Container */}
      <div className="flex-1 relative h-full bg-zinc-950 font-mono">
        {/* Leaflet map object */}
        <div ref={mapDivRef} className="w-full h-full relative z-10" id="map" />

        {/* Floating cockpit quick instrumentation bar (large targets optimal for VR glasses) */}
        <div className="absolute top-4 left-10 z-20 pointer-events-auto flex flex-col md:flex-row gap-3">
          {/* Plane positioning info glass banner */}
          <div className="flex items-center gap-4 bg-zinc-950/85 backdrop-blur-md border border-zinc-850 py-2.5 px-4 rounded-xl text-zinc-300 text-xs shadow-xl min-w-[280px]">
            <div className="flex items-center gap-2 border-r border-zinc-800 pr-3 mr-1">
              <div className={`w-2.5 h-2.5 rounded-full ${telemetry && telemetry.isConnected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`}></div>
              <span className="font-bold text-zinc-100 uppercase text-[10px]">MSFS LINK</span>
            </div>
            
            {telemetry ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[11px]">
                <div>ALT: <span className="text-amber-400 font-bold">{Math.round(telemetry.altitude)} ft</span></div>
                <div>HDG: <span className="text-cyan-400 font-bold">{Math.round(telemetry.heading).toString().padStart(3, "0")}°</span></div>
                <div>IAS: <span className="text-zinc-100 font-bold">{Math.round(telemetry.airspeed)} kt</span></div>
                <div>LAT: <span className="text-zinc-400">{telemetry.latitude.toFixed(4)}</span></div>
              </div>
            ) : (
              <span className="text-zinc-500 italic">No telemetry linked yet. Enter link coordinates or setup bridge.</span>
            )}
          </div>

          {/* Quick interactive parameters controls (Map tracking lock, layer selectors) */}
          <div className="flex items-center gap-1.5 bg-zinc-950/85 backdrop-blur-md border border-zinc-850 p-1.5 rounded-xl text-xs shadow-xl select-none">
            {/* Map lock camera follow toggles */}
            <button 
              onClick={() => setMapLock(!mapLock)}
              className={`p-2 rounded-lg flex items-center gap-1.5 font-bold transition-all ${
                mapLock 
                  ? "bg-cyan-950 border border-cyan-800/60 text-cyan-400" 
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
              }`}
              title={mapLock ? "Unlock Camera panning from Plane" : "Lock camera following to Plane"}
            >
              {mapLock ? <Lock className="w-4 h-4 text-cyan-400" /> : <Unlock className="w-4 h-4 text-zinc-500" />}
              <span className="text-[10px] tracking-wide uppercase font-mono">Camera Lock</span>
            </button>

            {/* divider */}
            <span className="h-5 w-px bg-zinc-800 mx-1"></span>

            {/* Quick Map styles drop down */}
            <div className="flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-zinc-500 ml-1 mr-1" />
              {(["dark", "satellite", "aero", "topo", "street"] as MapStyle[]).map(style => (
                <button
                  key={style}
                  onClick={() => setMapStyle(style)}
                  className={`px-2 py-1 uppercase rounded font-bold text-[9px] transition-all border ${
                    mapStyle === style
                      ? "bg-zinc-800 border-zinc-650 text-white"
                      : "bg-transparent border-transparent text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Active trip navigation leg float badge (bottom left of map) */}
        {waypoints.length > 0 && (
          <div className="absolute bottom-4 left-10 z-20 bg-zinc-950/85 backdrop-blur-md border border-zinc-850 py-2.5 px-4 rounded-xl text-xs font-mono shadow-xl hidden md:flex items-center gap-4 text-zinc-300">
            <div className="flex items-center gap-2">
              <Navigation className="w-4 h-4 text-cyan-400 animate-pulse" />
              <div className="flex flex-col">
                <span className="text-[9px] text-zinc-500 uppercase font-extrabold leading-tight">ACTIVE STATION</span>
                <span className="text-zinc-100 font-bold text-sm tracking-wide leading-tight">
                  {waypoints[activeWaypointIdx].name}
                </span>
              </div>
            </div>

            <div className="w-px h-8 bg-zinc-800"></div>

            <div className="grid grid-cols-2 gap-x-4">
              <div>NAV CRS: <span className="text-cyan-400 font-bold">{bearingToActive !== null ? `${Math.round(bearingToActive).toString().padStart(3, "0")}°` : "---°"}</span></div>
              <div>NAV DIST: <span className="text-amber-400 font-bold">{distanceToActive !== null ? `${distanceToActive.toFixed(1)} NM` : "--.- NM"}</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
