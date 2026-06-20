import assert from 'assert';
import { computeBearing } from './bearing.js';

// Simulate a simple northward movement: previous point south of current point.
const prevLat = 0;
const prevLng = 0;
const curLat = 1; // 1 degree north
const curLng = 0;

const bearing = computeBearing(prevLat, prevLng, curLat, curLng);
assert.strictEqual(Math.round(bearing), 0, 'Bearing should be 0° (north) for northward movement');

console.log('Rotation bearing test passed');