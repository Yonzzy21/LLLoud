import fetch from 'node-fetch';

async function testAvoid() {
  const url = 'https://valhalla1.openstreetmap.de/route';
  const reqBody = {
    locations: [
      { lat: 40.7589, lon: -73.9897 }, // W 51st & 8th Ave
      { lat: 40.7478, lon: -73.9971 }  // W 26st & 8th Ave
    ],
    costing: 'pedestrian',
    avoid_locations: [
      { lat: 40.7505, lon: -73.9934, radius: 200 } // Penn Station / MSG noise zone
    ],
    units: 'km'
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(reqBody),
      headers: { 'Content-Type': 'application/json' }
    });
    const json = await res.json();
    if (json.trip) {
      console.log('✅ Valhalla avoid_locations success!');
      console.log('Distance:', json.trip.summary.length, 'km');
      console.log('Has legs:', json.trip.legs.length);
    } else {
      console.log('❌ Valhalla avoid_locations failed:', json);
    }
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

testAvoid();
