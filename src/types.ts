export interface Telemetry {
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
  waypoints?: Waypoint[];
}

export interface Waypoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  elevationFeet?: number;
  type?: string;     // e.g., "Airport", "VOR", "NDB", "User", "Fix"
  icao?: string;
  distanceToNextNm?: number;
  headingToNextDeg?: number;
}

export type MapStyle = "satellite" | "topo" | "dark" | "aero" | "street";
