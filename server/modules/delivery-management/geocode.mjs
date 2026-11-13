// SA_Geocode_Address, ported from zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Geocode_Address.dg
// ("on add or edit, on success" of Service_Appointment_Form): finds the latitude and longitude of the delivery address
// with Geoapify and writes Delivery_Latitude, Delivery_Longitude and Geocode_Status (Success, Approximate (City Level),
// No Match).
//
// THE KEY: the Deluge script has a Geoapify key typed into it, and that file is public in git. It is not copied here.
// The key is GEOAPIFY_API_KEY in .env. Without it nothing is called and nothing is written (the status is not set to
// "No Match" for a call that was never made), and a line is logged once.
//
// Quirks kept ("mirrors Zoho"): the address is cut at the first " Corner " / " Cor. " (any of the three spellings, the
// first that is found), the city is added when the address does not already say it, and ", Philippines" is always added;
// the query is only escaped for space, comma and #; the best of the results is the one with the highest score (+2 city,
// +1 neighbourhood or suburb in the address), the first one wins a tie; a result is "approximate" when it is only a
// city, state or country, or its confidence is under 0.4 (a result with no confidence counts as 0).
// Deliberate differences: (1) the condition `address set && latitude empty || latitude == ""` is read as "address set and
// latitude empty": in Zoho a blank is null so the second part never fires, but here a blank is "" and it would geocode
// every appointment without an address; (2) a result with no city never counts as a city match (in Deluge
// `cityLower.contains(candCity.toLowerCase())` on a missing city is an error); (3) when the call itself fails (no network)
// nothing is written, so the next save tries again.
import { register } from '../../workflows/index.mjs';
import { blank } from '../../workflows/deluge.mjs';
import { SA } from './scheduling.mjs';

const CORNERS = [' Corner ', ' corner ', ' CORNER ', ' Cor. ', ' cor. ', ' COR. '];
let warned = false;

// The text sent to Geoapify, and the lower-case address used for scoring.
export function addressQuery(address, city) {
  let text = String(address);
  const corner = CORNERS.find((c) => text.includes(c));
  if (corner) text = text.slice(0, text.indexOf(corner));
  if (!blank(city) && !text.toLowerCase().includes(String(city).toLowerCase())) text = `${text}, ${city}`;
  return `${text}, Philippines`;
}

export function bestResult(results, address, city) {
  const addressLower = address.toLowerCase();
  const cityLower = blank(city) ? '' : String(city).toLowerCase();
  let best = results[0];
  let bestScore = -1;
  for (const cand of results) {
    let score = 0;
    const candCity = cand.city;
    const hasCity = !blank(candCity);
    if ((hasCity && cityLower !== '' && String(candCity).toLowerCase().includes(cityLower)) || (hasCity && cityLower.includes(String(candCity).toLowerCase()))) score += 2;
    if (!blank(cand.neighbourhood) && addressLower.includes(String(cand.neighbourhood).toLowerCase())) score += 1;
    else if (!blank(cand.suburb) && addressLower.includes(String(cand.suburb).toLowerCase())) score += 1;
    if (score > bestScore) { bestScore = score; best = cand; }
  }
  return best;
}

async function geocode({ id, record, store }) {
  if (blank(record.Customer_Address) || !blank(record.Delivery_Latitude)) return;
  const key = process.env.GEOAPIFY_API_KEY;
  if (blank(key)) {
    if (!warned) { warned = true; console.warn('[Service_Appointment_Form] GEOAPIFY_API_KEY is not set: addresses are not geocoded.'); }
    return;
  }
  const query = addressQuery(record.Customer_Address, record.City);
  const text = query.replaceAll(' ', '%20').replaceAll(',', '%2C').replaceAll('#', '%23');
  let response;
  try {
    const res = await fetch(`https://api.geoapify.com/v1/geocode/search?text=${text}&format=json&apiKey=${key}`);
    response = await res.json();
  } catch (e) {
    console.error('[Service_Appointment_Form] geocoding failed, will retry on the next save:', e.message);
    return;
  }
  const results = response?.results;
  let changes = { Geocode_Status: 'No Match' };
  if (Array.isArray(results) && results.length > 0) {
    const best = bestResult(results, query, record.City);
    if (best.lat != null && best.lon != null) {
      const confidence = Number(best.rank?.confidence ?? 0) || 0;
      const coarse = ['city', 'state', 'country'].includes(best.result_type) || confidence < 0.4;
      changes = { Delivery_Latitude: `${best.lat}`, Delivery_Longitude: `${best.lon}`, Geocode_Status: coarse ? 'Approximate (City Level)' : 'Success' };
    }
  }
  await store.updateRecord(SA, id, changes, { byForm: true });
}

register(SA, { afterAdd: geocode, afterUpdate: geocode });
