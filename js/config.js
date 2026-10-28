// config.js
// Ported from config.py

export const G = 6.67430e-2;  // Scaled gravitational constant for simulation
export const GRID_EXTENT = 50;
export const TRAIL_LENGTH = 200;
export const MAX_GRID_RESOLUTION = 500;
export let GRID_RESOLUTION = 250;

// Mutator if we want to change resolution dynamically
export function setGridResolution(val) {
    GRID_RESOLUTION = val;
}
