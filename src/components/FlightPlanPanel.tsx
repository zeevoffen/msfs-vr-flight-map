import React, { useRef, useState } from "react";
import { Waypoint } from "../types";
import { 
  FileCode, Upload, Trash2, Plus, MoveUp, MoveDown, Compass, Play, 
  MapPin, Check, Info, FileText 
} from "lucide-react";

interface FlightPlanPanelProps {
  waypoints: Waypoint[];
  setWaypoints: React.Dispatch<React.SetStateAction<Waypoint[]>>;
  activeWaypointIndex: number;
  setActiveWaypointIndex: (index: number) => void;
  onSimulatePath: () => void;
  isSimulating: boolean;
}

export default function FlightPlanPanel({
  waypoints,
  setWaypoints,
  activeWaypointIndex,
  setActiveWaypointIndex,
  onSimulatePath,
  isSimulating,
}: FlightPlanPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // Manual adding states
  const [manualName, setManualName] = useState("");
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [manualType, setManualType] = useState("User");

  // DMS parser for MSFS .pln files
  // e.g. "N43° 39' 55.46\",E7° 12' 53.94\",+000010.00"
  const parseMSFSWorldPosition = (posStr: string): { latitude: number; longitude: number; elevationFeet: number } => {
    const cleanStr = posStr.replace(/"/g, "").trim();
    const parts = cleanStr.split(",");
    
    if (parts.length < 2) return { latitude: 0, longitude: 0, elevationFeet: 0 };

    const parseDMS = (str: string, isLat: boolean) => {
      // Matches both "N43° 39' 55.46" and compressed "N43 39 55.46" or "N43.123"
      const match = str.match(/([NSEW])\s*(\d+)°?\s*(\d+)'?\s*([\d.]+)"?/);
      if (match) {
        const dir = match[1];
        const deg = parseFloat(match[2]);
        const min = parseFloat(match[3]);
        const sec = parseFloat(match[4]);
        let dec = deg + min / 60 + sec / 3600;
        if (dir === "S" || dir === "W") dec = -dec;
        return dec;
      }
      
      // Fallback to pure float parsing
      const floatVal = parseFloat(str.replace(/[^0-9.-]/g, ""));
      return isNaN(floatVal) ? 0 : floatVal;
    };

    const latitude = parseDMS(parts[0], true);
    const longitude = parseDMS(parts[1], false);
    
    let elevationFeet = 0;
    if (parts[2]) {
      elevationFeet = parseFloat(parts[2].replace(/[+]/g, ""));
    }

    return { latitude, longitude, elevationFeet };
  };

  // Parses XML file loaded from disk
  const parseFlightPlanFile = (text: string, fileName: string) => {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, "text/xml");
      const parsedWaypoints: Waypoint[] = [];

      // Detect if file is MSFS PLN (XML format)
      if (xmlDoc.getElementsByTagName("ATCWaypoint").length > 0) {
        const waypointNodes = xmlDoc.getElementsByTagName("ATCWaypoint");
        for (let i = 0; i < waypointNodes.length; i++) {
          const node = waypointNodes[i];
          const idAttr = node.getAttribute("id") || `WP-${i}`;
          
          let wType = "User";
          const typeNode = node.getElementsByTagName("ATCWaypointType")[0];
          if (typeNode) wType = typeNode.textContent || "User";

          let icaoCode = "";
          const icaoNode = node.getElementsByTagName("ICAOIdent")[0];
          if (icaoNode) icaoCode = icaoNode.textContent || "";

          let posStr = "";
          const posNode = node.getElementsByTagName("WorldPosition")[0];
          if (posNode) posStr = posNode.textContent || "";

          if (posStr) {
            const { latitude, longitude, elevationFeet } = parseMSFSWorldPosition(posStr);
            parsedWaypoints.push({
              id: `${idAttr}-${i}-${Date.now().toString().slice(-4)}`,
              name: icaoCode || idAttr,
              latitude,
              longitude,
              elevationFeet,
              type: wType,
              icao: icaoCode,
            });
          }
        }
      } 
      // Detect if file is GPX
      else if (xmlDoc.getElementsByTagName("wpt").length > 0 || xmlDoc.getElementsByTagName("rtept").length > 0) {
        const points = xmlDoc.getElementsByTagName("wpt").length > 0 
          ? xmlDoc.getElementsByTagName("wpt") 
          : xmlDoc.getElementsByTagName("rtept");

        for (let i = 0; i < points.length; i++) {
          const node = points[i];
          const lat = parseFloat(node.getAttribute("lat") || "0");
          const lon = parseFloat(node.getAttribute("lon") || "0");
          
          let name = node.getElementsByTagName("name")[0]?.textContent || `WP-${i}`;
          let ele = parseFloat(node.getElementsByTagName("ele")[0]?.textContent || "0") * 3.28084; // convert meters to feet

          parsedWaypoints.push({
            id: `GPX-${i}-${Date.now().toString().slice(-4)}`,
            name: name,
            latitude: lat,
            longitude: lon,
            elevationFeet: Math.round(ele),
            type: "User",
          });
        }
      } else {
        alert("Unable to parse file. Please upload a valid MSFS flight plan (.pln) or standard GPX (.gpx) file.");
        return;
      }

      if (parsedWaypoints.length > 0) {
        // Calculate waypoint-to-waypoint distance & bearings
        recalculateDistancesAndBearings(parsedWaypoints);
      }
    } catch (e) {
      console.error(e);
      alert("Error parsing file structure. Verify this is a valid XML PLN/GPX document.");
    }
  };

  // Recalculates course bearings and distance gaps between waypoint lines
  const recalculateDistancesAndBearings = (pointsList: Waypoint[]) => {
    const updated = [...pointsList];
    for (let i = 0; i < updated.length - 1; i++) {
      const p1 = updated[i];
      const p2 = updated[i + 1];

      // Great Circle Distance calculation in Nautical Miles
      const radLat1 = (p1.latitude * Math.PI) / 180;
      const radLat2 = (p2.latitude * Math.PI) / 180;
      const dLat = ((p2.latitude - p1.latitude) * Math.PI) / 180;
      const dLon = ((p2.longitude - p1.longitude) * Math.PI) / 180;

      const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) + 
        Math.cos(radLat1) * Math.cos(radLat2) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distanceNm = c * 3440.065; // Earth radius in NM

      // Initial Bearing calculation
      const y = Math.sin(dLon) * Math.cos(radLat2);
      const x = 
        Math.cos(radLat1) * Math.sin(radLat2) - 
        Math.sin(radLat1) * Math.cos(radLat2) * Math.cos(dLon);
      
      let bearingDeg = (Math.atan2(y, x) * 180) / Math.PI;
      bearingDeg = (bearingDeg + 360) % 360;

      p1.distanceToNextNm = distanceNm;
      p1.headingToNextDeg = bearingDeg;
    }
    updated[updated.length - 1].distanceToNextNm = 0;
    updated[updated.length - 1].headingToNextDeg = 0;

    setWaypoints(updated);
    setActiveWaypointIndex(0);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          parseFlightPlanFile(event.target.result as string, file.name);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          parseFlightPlanFile(event.target.result as string, file.name);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleAddManualWaypoint = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);

    if (!manualName || isNaN(lat) || isNaN(lng)) {
      alert("Please provide a valid name, latitude decimal, and longitude decimal values.");
      return;
    }

    const newWp: Waypoint = {
      id: `manual-${Date.now()}`,
      name: manualName.toUpperCase(),
      latitude: lat,
      longitude: lng,
      elevationFeet: 0,
      type: manualType,
    };

    const nextPoints = [...waypoints, newWp];
    recalculateDistancesAndBearings(nextPoints);

    // Clear form
    setManualName("");
    setManualLat("");
    setManualLng("");
  };

  const deleteWaypoint = (index: number) => {
    const list = waypoints.filter((_, idx) => idx !== index);
    if (list.length === 0) {
      setWaypoints([]);
      setActiveWaypointIndex(0);
    } else {
      recalculateDistancesAndBearings(list);
      if (activeWaypointIndex >= list.length) {
        setActiveWaypointIndex(list.length - 1);
      }
    }
  };

  const shiftWaypointDegree = (idx: number, direction: "up" | "down") => {
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === waypoints.length - 1) return;

    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    const temp = waypoints[idx];
    const list = [...waypoints];
    list[idx] = list[targetIdx];
    list[targetIdx] = temp;

    recalculateDistancesAndBearings(list);
    
    if (activeWaypointIndex === idx) {
      setActiveWaypointIndex(targetIdx);
    } else if (activeWaypointIndex === targetIdx) {
      setActiveWaypointIndex(idx);
    }
  };

  return (
    <div className="flex flex-col bg-zinc-900 border-zinc-800 border-b lg:border-b-0 lg:border-r h-full overflow-y-auto" id="flight_plan_panel">
      {/* Flight Plan Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-950/60 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-cyan-400" />
          <span className="font-display font-bold text-sm tracking-wide">FLIGHT PLAN COMPILER</span>
        </div>

        {waypoints.length > 0 && (
          <button 
            onClick={() => {
              if (confirm("Clear your current flight routing?")) {
                setWaypoints([]);
                setActiveWaypointIndex(0);
              }
            }}
            className="text-zinc-500 hover:text-rose-400 p-1 rounded-md transition-colors"
            title="Clear all waypoints"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 p-4 space-y-4">
        {/* Upload Drop Zone */}
        <div 
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleFileDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
            isDragging 
              ? "border-cyan-400 bg-cyan-950/20 text-cyan-200" 
              : "border-zinc-800 hover:border-zinc-700 bg-zinc-950/40 text-zinc-400"
          }`}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept=".pln,.gpx" 
            className="hidden" 
          />
          <Upload className="w-6 h-6 mx-auto mb-2 text-zinc-500 hover:text-cyan-400 transition-colors" />
          <p className="text-xs font-bold font-sans text-zinc-300">
            Drag & drop flight plan file
          </p>
          <p className="text-[10px] text-zinc-500 mt-1 uppercase tracking-wider font-mono">
            Supports MSFS .PLN or standard .GPX
          </p>
        </div>

        {/* Info Banner when empty */}
        {waypoints.length === 0 && (
          <div className="bg-zinc-950/60 border border-zinc-900 rounded-xl p-3 flex gap-3 text-xs text-zinc-400">
            <Info className="w-4 h-4 text-cyan-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-zinc-200">How to load trips:</span>
              <p>Export your bush trip or standard routing flight plan from SimBrief, SkyVector, or MSFS as a <code className="text-cyan-400">.pln</code> or <code className="text-cyan-400">.gpx</code>, then upload it above.</p>
              <p>Alternatively, write coordinates below to generate user waypoints manually!</p>
            </div>
          </div>
        )}

        {/* Flight Waypoints Route Sequencer */}
        {waypoints.length > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between items-center bg-black/20 p-2 rounded-lg border border-zinc-800">
              <div className="text-[10px] text-zinc-500 font-extrabold uppercase tracking-wide">
                Route Station List ({waypoints.length})
              </div>
              
              <button
                onClick={onSimulatePath}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold font-mono transition-colors ${
                  isSimulating 
                    ? "bg-rose-950/80 text-rose-300 border border-rose-800" 
                    : "bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 hover:bg-cyan-900/80"
                }`}
              >
                <Play className="w-3 h-3" />
                {isSimulating ? "STOP AUTOPILOT" : "TEST FLY PATH"}
              </button>
            </div>

            {/* Waypoint list box */}
            <div className="max-h-[220px] overflow-y-auto space-y-1 border border-zinc-800/60 p-1.5 rounded-xl bg-zinc-950/40">
              {waypoints.map((wp, idx) => {
                const isActive = idx === activeWaypointIndex;
                const isStart = idx === 0;
                const isEnd = idx === waypoints.length - 1;

                return (
                  <div 
                    key={wp.id}
                    onClick={() => setActiveWaypointIndex(idx)}
                    className={`group w-full text-left p-2 rounded-lg flex items-center justify-between cursor-pointer transition-all ${
                      isActive 
                        ? "bg-cyan-950/50 border border-cyan-500/40" 
                        : "bg-zinc-900/60 hover:bg-zinc-900 border border-transparent hover:border-zinc-800"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Waypoint sequence counter */}
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center font-mono text-[9px] font-extrabold shrink-0 border ${
                        isActive 
                          ? "bg-cyan-400 text-zinc-950 border-cyan-400" 
                          : "bg-zinc-800 border-zinc-700 text-zinc-400"
                      }`}>
                        {idx + 1}
                      </span>

                      {/* Station Details */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 leading-tight">
                          <span className="font-display font-bold text-xs tracking-wide text-zinc-200 uppercase truncate">
                            {wp.name}
                          </span>
                          {wp.type && wp.type !== "User" && (
                            <span className="text-[7px] text-zinc-500 font-bold px-1 bg-zinc-800 rounded font-mono uppercase shrink-0">
                              {wp.type}
                            </span>
                          )}
                        </div>
                        <div className="text-[9px] font-mono text-zinc-500 mt-0.5 flex gap-2">
                          <span>{wp.latitude.toFixed(4)}, {wp.longitude.toFixed(4)}</span>
                          {wp.elevationFeet ? <span>• {wp.elevationFeet}ft</span> : null}
                        </div>
                      </div>
                    </div>

                    {/* Navigation metrics and Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {!isEnd && wp.distanceToNextNm ? (
                        <div className="text-right font-mono text-[10px] pr-2 border-r border-zinc-800/80 leading-3">
                          <div className="text-zinc-400 font-bold">{wp.distanceToNextNm.toFixed(0)}NM</div>
                          <div className="text-zinc-600 text-[8px] flex items-center gap-0.5 justify-end mt-0.5">
                            <Compass className="w-2.5 h-2.5" />
                            {Math.round(wp.headingToNextDeg || 0).toString().padStart(3, "0")}°
                          </div>
                        </div>
                      ) : (
                        isEnd && <div className="text-[8px] text-zinc-600 font-bold uppercase font-mono pr-2 border-r border-zinc-800/80">DEST</div>
                      )}

                      {/* Direction Shift & Delete buttons */}
                      <div className="hidden group-hover:flex items-center gap-0.5">
                        <button 
                          disabled={isStart}
                          onClick={(e) => { e.stopPropagation(); shiftWaypointDegree(idx, "up"); }}
                          className={`p-1 rounded-md text-zinc-500 hover:text-zinc-300 disabled:opacity-30`}
                        >
                          <MoveUp className="w-3 h-3" />
                        </button>
                        <button 
                          disabled={isEnd}
                          onClick={(e) => { e.stopPropagation(); shiftWaypointDegree(idx, "down"); }}
                          className="p-1 rounded-md text-zinc-500 hover:text-zinc-300 disabled:opacity-30"
                        >
                          <MoveDown className="w-3 h-3" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); deleteWaypoint(idx); }}
                          className="p-1 rounded-md text-zinc-500 hover:text-rose-400"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Manual Waypoint Creator */}
        <form onSubmit={handleAddManualWaypoint} className="bg-zinc-950/40 border border-zinc-800/60 p-3 rounded-xl space-y-2.5">
          <div className="text-[10px] text-zinc-500 font-extrabold uppercase tracking-widest flex items-center gap-1">
            <Plus className="w-3.5 h-3.5 text-cyan-500" />
            <span>Manually inject waypoint</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold mb-1 block">Identifier</label>
              <input 
                type="text" 
                placeholder="e.g., KLAX, LFMN, VOR1"
                value={manualName}
                onChange={e => setManualName(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs rounded text-zinc-100 placeholder-zinc-600 font-mono focus:border-cyan-500/50 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold mb-1 block">Latitude (Dec)</label>
              <input 
                type="number" 
                step="any"
                placeholder="e.g., 34.0522"
                value={manualLat}
                onChange={e => setManualLat(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs rounded text-zinc-100 placeholder-zinc-600 font-mono focus:border-cyan-500/50 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold mb-1 block">Longitude (Dec)</label>
              <input 
                type="number" 
                step="any"
                placeholder="e.g., -118.2437"
                value={manualLng}
                onChange={e => setManualLng(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs rounded text-zinc-100 placeholder-zinc-600 font-mono focus:border-cyan-500/50 focus:outline-none"
              />
            </div>

            <div className="col-span-2">
              <label className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold mb-1 block">Station Type</label>
              <select 
                value={manualType} 
                onChange={e => setManualType(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs rounded text-zinc-100 font-mono focus:border-cyan-500/50 focus:outline-none"
              >
                <option value="Airport">Airport / Runways</option>
                <option value="VOR">VHF Nav Range (VOR)</option>
                <option value="NDB">Non-Dir Beacon (NDB)</option>
                <option value="Fix">Intersection / Fix</option>
                <option value="User">Custom User point</option>
              </select>
            </div>
          </div>

          <button 
            type="submit" 
            className="w-full bg-cyan-950/80 hover:bg-cyan-900/80 border border-cyan-800/60 text-cyan-400 font-mono font-bold text-xs py-1.5 rounded transition-all flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            INJECT STATION
          </button>
        </form>
      </div>
    </div>
  );
}
