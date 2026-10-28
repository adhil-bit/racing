import { buildRoadWorld } from './RoadWorld.js';
import { buildWaterWorld } from './WaterWorld.js';
import { buildAirWorld } from './AirWorld.js';

const BUILDERS = { road: buildRoadWorld, water: buildWaterWorld, air: buildAirWorld };

export function buildWorld(mode, scene, track) {
  return BUILDERS[mode](scene, track);
}
