import React from "react";
import { Telemetry, Waypoint } from "../types";
import { Navigation, Wind, Compass, ShieldAlert, CheckCircle, Activity, Gauge, Plane } from "lucide-react";

interface HUDProps {
  telemetry: Telemetry | null;
  activeWaypoint: Waypoint | null;
  distanceToActiveWaypoint: number | null; // Nautical Miles (NM)
  bearingToActiveWaypoint: number | null; // Degrees
}

export default function FlightDeckHUD({
  telemetry,
  activeWaypoint,
  distanceToActiveWaypoint,
  bearingToActiveWaypoint,
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
        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-zinc-800 rounded text-[11px] font-semibold">
          {isLive ? (
            <span className="text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
              LIVE SIM
            </span>
          ) : (
            <span className="text-zinc-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block animate-pulse"></span>
              STANDBY / DEMO
            </span>
          )}
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
