import React, { useEffect, useRef, useState } from "react";
import { Telemetry, Waypoint } from "../types";
import { Navigation, Wind, Compass, ShieldAlert, CheckCircle, Activity, Gauge, Plane, MapPin } from "lucide-react";

interface HUDProps {
  telemetry: Telemetry | null;
  activeWaypoint: Waypoint | null;
  distanceToActiveWaypoint: number | null; // Nautical Miles (NM)
  bearingToActiveWaypoint: number | null; // Degrees
  debugMode?: boolean;
  onToggleDebug?: () => void;
  waypoints?: Waypoint[];
  activeWaypointIdx?: number;
}

export default function FlightDeckHUD({
  telemetry,
  activeWaypoint,
  distanceToActiveWaypoint,
  bearingToActiveWaypoint,
  debugMode = false,
  onToggleDebug,
  waypoints = [],
  activeWaypointIdx = 0,
}: HUDProps) {
  // If no live telemetry, show standby mode
  const isLive = telemetry && telemetry.isConnected;
  const heading = telemetry?.heading || 0;
  const airspeed = telemetry?.airspeed || 0;
  const groundSpeed = telemetry?.groundSpeed || 0;
  const altitude = telemetry?.altitude || 0;
  const verticalSpeed = telemetry?.verticalSpeed || 0;
  const pitch = telemetry?.pitch || 0;
  const bank = telemetry?.bank || 0;
  const fuel = telemetry?.fuelPercent || 100;
  const gear = telemetry?.gear || "Down";
  const flaps = telemetry?.flaps || 0;
  const onGround = telemetry?.onGround ?? true;
  const windDir = telemetry?.windDir || 0;
  const windSpd = telemetry?.windSpeed || 0;

  // Reverse geocode current position to get place name
  const [locationName, setLocationName] = useState<string | null>(null);
  const geoCacheRef = useRef<Record<string, string>>({});
  const fetchingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!telemetry?.latitude || !telemetry?.longitude) {
      setLocationName(null);
      return;
    }
    // Round to ~11km grid to avoid spamming API
    const lat = Math.round(telemetry.latitude * 10) / 10;
    const lng = Math.round(telemetry.longitude * 10) / 10;
    const cacheKey = `${lat},${lng}`;
    // Check in-memory cache
    if (geoCacheRef.current[cacheKey]) {
      setLocationName(geoCacheRef.current[cacheKey]);
      return;
    }
    // Don't fire duplicate in-flight requests
    if (fetchingRef.current.has(cacheKey)) return;
    fetchingRef.current.add(cacheKey);
    let cancelled = false;
    console.log(`[GEO] Fetching for ${cacheKey}`);
    fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
    )
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        const parts = [
          data.city || data.locality || data.principalSubdivision,
          data.principalSubdivision,
          data.countryName,
        ].filter(Boolean);
        const unique = [...new Set(parts)];
        const name = unique.length > 0 ? unique.join(", ") : "Over water / remote area";
        geoCacheRef.current[cacheKey] = name;
        setLocationName(name);
      })
      .catch(() => {
        if (!cancelled) setLocationName("Over water / remote area");
      })
      .finally(() => {
        fetchingRef.current.delete(cacheKey);
      });
    return () => { cancelled = true; };
  }, [telemetry?.latitude, telemetry?.longitude]);

  // Render a compass tape/strip based on current heading
  const getVisibleCompassTicks = () => {
    const ticks = [];
    const centerHdg = Math.round(heading);
    for (let i = -4; i <= 4; i++) {
      let tickHdg = (centerHdg + i * 10) % 360;
      if (tickHdg < 0) tickHdg += 360;
      ticks.push(tickHdg);
    }
    return ticks;
  };

  const getHeadingLetter = (hdg: number) => {
    if (hdg === 0 || hdg === 360) return "N";
    if (hdg === 90) return "E";
    if (hdg === 180) return "S";
    if (hdg === 270) return "W";
    return String(hdg).padStart(3, "0");
  };

  return (
    <div className="flex flex-col bg-zinc-900 border-zinc-800 border-b lg:border-b-0 lg:border-r h-full overflow-y-auto" id="flight_deck_hud">
      {/* Simulation Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-950/60 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Activity className={`w-4 h-4 ${isLive ? "text-emerald-500 animate-pulse" : "text-zinc-500"}`} />
          <span className="font-display font-bold text-sm tracking-wide">COCKPIT DATA LINK</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Debug / Sim Mode Toggle */}
          {onToggleDebug && (
            <button
              onClick={onToggleDebug}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                debugMode
                  ? "bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30"
                  : "bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${debugMode ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`}></span>
              {debugMode ? "Debug" : "Sim"}
            </button>
          )}
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-zinc-800 rounded text-[11px] font-semibold">
            {isLive && !debugMode ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                LIVE SIM
              </span>
            ) : (
              <span className={`${debugMode ? "text-amber-400" : "text-zinc-400"} flex items-center gap-1`}>
                <span className={`w-1.5 h-1.5 rounded-full inline-block animate-pulse ${debugMode ? "bg-amber-500" : "bg-zinc-500"}`}></span>
                {debugMode ? "DEBUG DEMO" : "STANDBY"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Parameters Grid */}
      <div className="flex-1 p-4 space-y-4">
        {/* heading indicator block */}
        <div className="bg-black/40 border border-zinc-800 rounded-xl p-3 flex flex-col items-center">
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Heading Compass</span>
          
          {/* Compass Ribbon slider */}
          <div className="relative w-full h-8 overflow-hidden bg-zinc-950 border-y border-zinc-800 rounded flex items-center mb-1">
            <div className="absolute inset-x-0 top-0 bottom-0 pointer-events-none bg-gradient-to-r from-zinc-950 via-transparent to-zinc-950 z-10"></div>
            {/* Center tick indicator */}
            <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-0.5 bg-cyan-400 z-20"></div>
            <div className="absolute left-1/2 -translate-x-1/2 -top-1 border-x-4 border-x-transparent border-t-4 border-t-cyan-400 z-20"></div>

            {/* Compass ticks container */}
            <div className="flex justify-around items-center w-full px-4 text-xs font-mono font-bold text-zinc-400">
              {getVisibleCompassTicks().map((tick, index) => (
                <div key={index} className="flex flex-col items-center min-w-[36px]">
                  <span className={index === 4 ? "text-cyan-400 font-extrabold scale-110" : ""}>
                    {getHeadingLetter(tick)}
                  </span>
                  <div className={`w-0.5 h-1.5 bg-zinc-700 ${index === 4 ? "bg-cyan-400" : ""}`}></div>
                </div>
              ))}
            </div>
          </div>

          <div className="font-mono text-3xl font-bold text-cyan-400 tracking-tight">
            {Math.round(heading).toString().padStart(3, "0")}°
          </div>
        </div>

        {/* HUD Primary Flight Display (Synthetic Attitude) */}
        <div className="relative h-44 bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden flex items-center justify-center">
          {/* Sky / Ground Background with pitch/bank */}
          <div 
            className="absolute inset-0 transition-transform duration-100 ease-out"
            style={{
              transform: `rotate(${-bank}deg) translateY(${pitch * 1.5}px)`,
            }}
          >
            {/* Sky - blueish slate */}
            <div className="h-[250px] bg-slate-800/80 border-b border-white flex flex-col justify-end items-center text-[10px] text-zinc-300 font-mono">
              <div className="mb-4 text-white/50">Pitch {Math.round(pitch)}°</div>
            </div>
            {/* Ground - brownish slate */}
            <div className="h-[250px] bg-zinc-800/60 flex flex-col justify-start items-center text-[10px] text-zinc-400 font-mono">
              <div className="mt-4 text-black/50">Pitch {Math.round(pitch)}°</div>
            </div>
          </div>

          {/* Aircraft symbology (Static in center of screen) */}
          <div className="absolute z-20 flex items-center justify-center w-24 h-24 pointer-events-none">
            {/* Center Yellow Dot */}
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400"></div>
            {/* Left Wing bar */}
            <div className="w-8 h-1 bg-amber-400 rounded-sm mr-2 absolute -translate-x-[20px]"></div>
            {/* Right Wing bar */}
            <div className="w-8 h-1 bg-amber-400 rounded-sm ml-2 absolute translate-x-[20px]"></div>
            {/* Tail peg */}
            <div className="w-1 h-3 bg-amber-400 rounded-sm mb-4 absolute -translate-y-[10px]"></div>
          </div>

          {/* Bank Pointer Header */}
          <div className="absolute top-2 inset-x-0 flex justify-center z-10 font-mono text-[10px] text-zinc-500">
            <span className="bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded text-zinc-300">
              BANK: {Math.round(bank)}°
            </span>
          </div>

          {/* Ground Speed & Aircraft Label Overlay */}
          <div className="absolute bottom-2 left-2 z-10 px-2 py-0.5 bg-black/60 rounded text-[9px] font-mono text-zinc-400">
            TYPE: {telemetry?.aircraftType ? telemetry.aircraftType.slice(0, 16) : "UNKNOWN"}
          </div>
          <div className="absolute bottom-2 right-2 z-10 px-2 py-0.5 bg-black/60 rounded text-[9px] font-mono text-zinc-400">
            {onGround ? "ON GROUND" : "AIRBORNE"}
          </div>
        </div>

        {/* Airspeed & Altitude twin gauges */}
        <div className="grid grid-cols-2 gap-3">
          {/* Airspeed Gauge */}
          <div className="bg-black/30 border border-zinc-800 rouded-xl p-3 rounded-xl flex flex-col">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Indicated IAS</span>
              <Gauge className="w-3.5 h-3.5 text-zinc-500" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-2xl font-bold text-white font-display">
                {Math.round(airspeed)}
              </span>
              <span className="text-xs text-zinc-400 font-semibold font-mono">KT</span>
            </div>
            <span className="text-[9px] text-zinc-500 mt-1 font-mono">
              GS: {Math.round(groundSpeed)} KT
            </span>
          </div>

          {/* Altitude Gauge */}
          <div className="bg-black/30 border border-zinc-800 rounded-xl p-3 flex flex-col">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Altitude</span>
              <Plane className="w-3.5 h-3.5 text-zinc-500" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-2xl font-bold text-white font-display">
                {Math.round(altitude).toLocaleString()}
              </span>
              <span className="text-xs text-zinc-400 font-semibold font-mono">FT</span>
            </div>
            <span className={`text-[9px] mt-1 font-mono ${verticalSpeed > 200 ? "text-emerald-400" : verticalSpeed < -200 ? "text-rose-400" : "text-zinc-500"}`}>
              VS: {verticalSpeed > 0 ? "+" : ""}{Math.round(verticalSpeed)} FPM
            </span>
          </div>
        </div>

        {/* Secondary Flight Systems Grid */}
        <div className="bg-black/20 border border-zinc-800/80 rounded-xl p-3 space-y-2.5">
          <div className="text-[10px] text-zinc-500 font-extrabold uppercase tracking-widest border-b border-zinc-800/60 pb-1">Cockpit Systems Status</div>
          
          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs font-mono">
            {/* Landing Gear */}
            <div className="flex justify-between items-center">
              <span className="text-zinc-500">Gear:</span>
              <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${gear === "Down" ? "bg-emerald-950/80 border border-emerald-500/30 text-emerald-400" : gear === "Up" ? "bg-zinc-800 text-zinc-400" : "bg-amber-950/80 text-amber-400 animate-pulse"}`}>
                {gear.toUpperCase()}
              </span>
            </div>

            {/* Flaps percentage */}
            <div className="flex justify-between items-center">
              <span className="text-zinc-500">Flaps:</span>
              <span className="font-bold text-zinc-300">
                {flaps === 0 ? "RETRACTED" : `${Math.round(flaps)}%`}
              </span>
            </div>

            {/* Fuel status */}
            <div className="flex justify-between items-center col-span-2">
              <span className="text-zinc-500">Fuel Qty:</span>
              <div className="flex items-center gap-2 w-2/3">
                <div className="flex-1 h-2 bg-zinc-900 border border-zinc-800 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-300 ${fuel > 40 ? "bg-emerald-500" : fuel > 15 ? "bg-amber-500 animate-pulse" : "bg-rose-500 animate-pulse"}`}
                    style={{ width: `${fuel}%` }}
                  ></div>
                </div>
                <span className="font-bold text-zinc-300 text-[11px] min-w-[34px] text-right">
                  {Math.round(fuel)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Active Waypoint Tracking HUD */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">
            <span>Active Navigation Leg</span>
            <Navigation className="w-3.5 h-3.5 text-cyan-400" />
          </div>

          {activeWaypoint ? (
            <div className="space-y-2">
              <div className="flex justify-between items-baseline">
                <span className="font-display font-bold text-base text-cyan-400 tracking-wide">
                  {activeWaypoint.name}
                </span>
                <span className="text-[10px] bg-cyan-950 border border-cyan-800/40 text-cyan-400 px-1.5 py-0.5 rounded font-bold font-mono">
                  {activeWaypoint.type?.toUpperCase() || "WAYPOINT"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-zinc-900 pt-2 font-mono text-xs">
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase">Distance</div>
                  <div className="text-sm font-bold text-zinc-200">
                    {distanceToActiveWaypoint !== null 
                      ? `${distanceToActiveWaypoint.toFixed(1)} NM` 
                      : "--.- NM"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase">Required CRS</div>
                  <div className="text-sm font-bold text-zinc-200">
                    {bearingToActiveWaypoint !== null 
                      ? `${Math.round(bearingToActiveWaypoint).toString().padStart(3, "0")}°` 
                      : "---°"}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-2 text-center text-xs text-zinc-500 font-mono italic">
              No active waypoint or flight plan loaded.
            </div>
          )}
        </div>

        {/* Flight Plan / Waypoint List */}
        {waypoints.length > 0 && (
          <div className="bg-black/20 border border-zinc-800 rounded-xl p-3 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">
              <span>Flight Plan</span>
              <span className="text-zinc-600">{waypoints.length} waypoints</span>
            </div>
            <div className="space-y-0.5 max-h-32 overflow-y-auto">
              {waypoints.map((wp, idx) => {
                const isPassed = idx < activeWaypointIdx;
                const isCurrent = idx === activeWaypointIdx;
                const isLast = idx === waypoints.length - 1;
                let rowClass = "text-zinc-500";
                let icon = "○";
                if (isPassed) { rowClass = "text-zinc-600 line-through"; icon = "✓"; }
                else if (isCurrent) { rowClass = "text-cyan-400 font-bold"; icon = "▶"; }
                else if (isLast) { rowClass = "text-amber-400"; icon = "◆"; }
                return (
                  <div key={wp.id || idx} className={`flex items-center gap-2 text-[11px] font-mono ${rowClass}`}>
                    <span className="w-3 text-center shrink-0">{icon}</span>
                    <span className="truncate flex-1">{wp.name}</span>
                    {wp.type === "Airport" && (
                      <span className="text-[8px] bg-zinc-800 px-1 rounded text-zinc-500 shrink-0">AIRPT</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Debug Heading Verification Panel */}
        {telemetry?.aircraftType?.startsWith("Debug") && (
          <div className="bg-cyan-950/30 border border-cyan-500/30 rounded-xl p-3 space-y-2">
            <div className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-widest border-b border-cyan-500/20 pb-1 flex items-center gap-1.5">
              <Compass className="w-3 h-3" />
              Heading Debug
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div>
                <span className="text-zinc-500">Heading: </span>
                <span className="text-cyan-300 font-bold">{telemetry.heading.toFixed(1)}°</span>
              </div>
              <div>
                <span className="text-zinc-500">Lat: </span>
                <span className="text-zinc-300">{telemetry.latitude.toFixed(4)}</span>
              </div>
              <div>
                <span className="text-zinc-500">Rotation: </span>
                <span className="text-cyan-300 font-bold">{telemetry.heading.toFixed(1)}°</span>
              </div>
              <div>
                <span className="text-zinc-500">Lng: </span>
                <span className="text-zinc-300">{telemetry.longitude.toFixed(4)}</span>
              </div>
            </div>
            {/* Mini compass */}
            <div className="flex items-center justify-center pt-1">
              <div className="relative w-14 h-14">
                <svg viewBox="0 0 100 100" className="w-full h-full">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="#333" strokeWidth="2"/>
                  <text x="50" y="12" textAnchor="middle" fill="#999" fontSize="10">N</text>
                  <text x="90" y="54" textAnchor="middle" fill="#666" fontSize="8">E</text>
                  <text x="50" y="96" textAnchor="middle" fill="#666" fontSize="8">S</text>
                  <text x="10" y="54" textAnchor="middle" fill="#666" fontSize="8">W</text>
                  <line
                    x1="50" y1="50"
                    x2={50 + 35 * Math.sin(telemetry.heading * Math.PI / 180)}
                    y2={50 - 35 * Math.cos(telemetry.heading * Math.PI / 180)}
                    stroke="#06b6d4" strokeWidth="2" strokeLinecap="round"
                  />
                  <circle cx="50" cy="50" r="3" fill="#06b6d4"/>
                </svg>
              </div>
            </div>
            <div className="text-[9px] text-zinc-500 text-center pt-1 border-t border-zinc-800">
              Arrow should point in direction of travel
            </div>
          </div>
        )}

        {/* Current Location / Place Name */}
        <div className="bg-black/20 border border-zinc-800 rounded-xl p-3 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
            <span>Current Position</span>
            <MapPin className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xs font-mono text-zinc-300">
            {telemetry?.latitude && telemetry?.longitude ? (
              <>
                <div className="text-[10px] text-zinc-500 mb-0.5">
                  {telemetry.latitude.toFixed(4)}°N, {Math.abs(telemetry.longitude).toFixed(4)}°{telemetry.longitude >= 0 ? "E" : "W"}
                </div>
                <div className="text-sm font-semibold text-amber-400 tracking-wide min-h-[18px]">
                  {locationName ? (
                    locationName
                  ) : (
                    <span className="text-zinc-500 animate-pulse">Locating…</span>
                  )}
                </div>
              </>
            ) : (
              <span className="text-zinc-500">No position data</span>
            )}
          </div>
        </div>

        {/* Wind Vector Panel */}
        <div className="bg-black/20 border border-zinc-800 p-3 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wind className="w-4 h-4 text-cyan-500" />
            <div className="flex flex-col">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Crosswind Vector</span>
              <span className="text-xs font-semibold text-zinc-300 font-mono">
                {windSpd > 0 ? `${Math.round(windDir).toString().padStart(3, "0")}° @ ${Math.round(windSpd)} KT` : "CALM WIND"}
              </span>
            </div>
          </div>
          {windSpd > 0 && (
            <div className="relative w-8 h-8 rounded-full border border-zinc-800 bg-zinc-950 flex items-center justify-center">
              <div 
                className="absolute w-1.5 h-6 bg-cyan-400/80 rounded-full"
                style={{
                  transform: `rotate(${windDir - heading}deg)`,
                }}
              >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-b-4 border-b-cyan-400"></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
