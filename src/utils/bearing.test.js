import assert from 'assert';

// Inline copy of computeBearing to avoid module resolution issues in plain Node.
function computeBearing(prevLat, prevLng, curLat, curLng) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const φ1 = toRad(prevLat);
  const φ2 = toRad(curLat);
  const Δλ = toRad(curLng - prevLng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return ((θ * 180) / Math.PI + 360) % 360;
}

function approxEqual(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) < epsilon, `Expected ${expected}, got ${actual}`);
}

// Due north
approxEqual(computeBearing(0, 0, 1, 0), 0);
// Due east
approxEqual(computeBearing(0, 0, 0, 1), 90);
// Due south
approxEqual(computeBearing(1, 0, 0, 0), 180);
// Due west
approxEqual(computeBearing(0, 1, 0, 0), 270);
// Northeast ~45° (allow small tolerance due to floating‑point rounding)
approxEqual(computeBearing(0, 0, 1, 1), 45, 0.01);

console.log('All bearing tests passed');
