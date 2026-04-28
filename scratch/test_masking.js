const { maskCoordinates } = require('../lib/location-utils');

const lat = 26.2389;
const lng = 73.0243;
const seed = "host_123";

const masked1 = maskCoordinates(lat, lng, seed);
const masked2 = maskCoordinates(lat, lng, seed);
const masked3 = maskCoordinates(lat, lng, "host_456");

console.log("Original:", { lat, lng });
console.log("Masked (seed 1):", masked1);
console.log("Masked (seed 1 again):", masked2);
console.log("Masked (seed 2):", masked3);

if (masked1.lat === masked2.lat && masked1.lng === masked2.lng) {
  console.log("SUCCESS: Consistency check passed.");
} else {
  console.log("FAILURE: Consistency check failed.");
}

if (masked1.lat !== masked3.lat || masked1.lng !== masked3.lng) {
  console.log("SUCCESS: Uniqueness check passed.");
} else {
  console.log("FAILURE: Uniqueness check failed.");
}

// Check distance
const R = 6371;
const dLat = (masked1.lat - lat) * Math.PI / 180;
const dLon = (masked1.lng - lng) * Math.PI / 180;
const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat * Math.PI / 180) * Math.cos(masked1.lat * Math.PI / 180) * 
          Math.sin(dLon/2) * Math.sin(dLon/2);
const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
const d = R * c;
console.log("Distance from original (km):", d.toFixed(3));

if (d >= 0.5 && d <= 1.5) { // ~500m to 1km range (plus some buffer for diagonal)
    console.log("SUCCESS: Distance is in expected privacy range.");
} else {
    console.log("WARNING: Distance might be outside 500m-1km range:", d.toFixed(3));
}
