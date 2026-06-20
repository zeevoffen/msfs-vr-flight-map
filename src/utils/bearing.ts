/**
 * Compute the initial bearing (forward azimuth) from a previous geographic
 * coordinate to a current one. The result is in degrees clockwise from true
 * north (0‑360). This uses the standard great‑circle bearing formula which is
 * accurate for any distance and works for the short‑range vectors used by the
 * flight‑map.
 *
 * @param prevLat latitude of the previous point in decimal degrees
 * @param prevLng longitude of the previous point in decimal degrees
 * @param curLat  latitude of the current point in decimal degrees
 * @param curLng  longitude of the current point in decimal degrees
 * @returns bearing in degrees (0‑360)
 */
export function computeBearing(
  prevLat: number,
  prevLng: number,
  curLat: number,
  curLng: number
): number {
  // Convert degrees to radians
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const φ1 = toRad(prevLat);
  const φ2 = toRad(curLat);
  const Δλ = toRad(curLng - prevLng);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  // Convert back to degrees and normalize to 0‑360
  return ((θ * 180) / Math.PI + 360) % 360;
}
