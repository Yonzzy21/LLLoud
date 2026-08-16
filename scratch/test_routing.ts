import { calculateWalkableCommuteRoutesAsync } from './src/utils/pedestrianRouter';
import { fetchNyc311AsCommunityReports } from './src/utils/nycOpenData';
import { Waypoint } from './src/types';

const origin: Waypoint = {
  name: 'W 51st St & 8th Ave',
  latitude: 40.7631,
  longitude: -73.9859
};

const destination: Waypoint = {
  name: 'W 39th St & 8th Ave',
  latitude: 40.7554,
  longitude: -73.9912
};

async function test() {
  console.log('Testing routing from W 51st to W 39th with live 311 reports...');
  try {
    const reports = await fetchNyc311AsCommunityReports(100);
    console.log(`Loaded ${reports.length} live 311 reports.`);
    const res = await calculateWalkableCommuteRoutesAsync(origin, destination, reports);
    console.log('--- FASTEST ---');
    console.log(`Coords count: ${res.fastestRoute.coordinates.length}`);
    console.log(`Avg dB: ${res.fastestRoute.averageDecibels}`);
    
    console.log('--- QUIETEST ---');
    console.log(`Coords count: ${res.quietestRoute.coordinates.length}`);
    console.log(`Avg dB: ${res.quietestRoute.averageDecibels}`);
    console.log(`Avoided: ${JSON.stringify(res.quietestRoute.avoidedHazards.map(h => h.zoneName))}`);

    console.log('--- AVOID NOISE ---');
    console.log(`Coords count: ${res.avoidNoiseRoute.coordinates.length}`);
    console.log(`Avg dB: ${res.avoidNoiseRoute.averageDecibels}`);
    console.log(`Avoided: ${JSON.stringify(res.avoidNoiseRoute.avoidedHazards.map(h => h.zoneName))}`);
  } catch (err) {
    console.error('Error during routing:', err);
  }
}

test();
