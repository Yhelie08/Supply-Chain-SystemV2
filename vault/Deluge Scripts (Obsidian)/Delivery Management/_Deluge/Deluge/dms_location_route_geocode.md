---
title: "dms_location_route_geocode"
source_file: "dms_location_route_geocode.txt"
category: "Delivery Management/_Deluge/Deluge"
associated_widget: "[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]"
lines: 267
tags:
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - pick
  - procurement
  - purchase-order
  - qc
  - zoho-creator
---

# dms_location_route_geocode

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]
> - **Category:** `Delivery Management/_Deluge/Deluge`
> - **Source File:** `dms_location_route_geocode.txt`
> - **Lines of Code:** 267
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pick`, `#procurement`, `#purchase-order`, `#qc`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== DMS — Location Route (map pin) geocoding ==
== New 2026-07-18, per user decision to build A.2's "Location Route" field as a real ==
== map pin (Leaflet, self-hosted in DeliveryQueue widget) rather than skip it. ==

====================================================
WHY THIS EXISTS / SCOPE NOTE
====================================================
Plan's A.2 calls Location Route a "Map" field type; D.2/D.5 separately describe it as a
"route number for the team's day" — two different concepts under one name. This build
covers ONLY the map-pin reading (A.2) — showing where the delivery address actually is
on a map inside the DeliveryQueue widget. The route/stop-sequence-number reading
(D.2/D.5) is NOT built here — flag separately if still wanted.

No coordinates exist anywhere in this app today (Customer_Address/City are plain text,
never geocoded). This adds a one-time geocode-on-save step that resolves the address to
lat/long ONCE and caches it permanently on the record — never re-geocodes unless the
address actually changes.

SWITCHED 2026-07-18 from Nominatim to Geoapify, per user request after Nominatim
genuinely failed to geocode a real granular PH street address (confirmed via a direct
side-by-side test: the exact failing query returned a real `[]` from Nominatim, while
a broader city-level query succeeded — proving the pipeline was correct, Nominatim's
pure-OSM data just didn't have that street indexed). Geoapify merges OSM + OpenAddresses
+ Who's on First + Geonames (not OSM-only), free tier 3,000 requests/day, needs a free
API key (no billing) — see STEP 0. If this app's delivery volume ever grows well past
3,000 geocodes/day (unlikely at ~96-record real scale), revisit with a paid geocoder
(Google Maps Geocoding API) instead — flagged, not needed now.

====================================================
STEP 1 — New fields on Service_Appointment_Form
(Application IDE, Delivery_Details_Section — confirmed live 2026-07-18 via a real
source dump, Temp.txt — additive only, same section Estimated_Duration/Fleet_Assignment/
Location_Route already live in. DONE — inserted directly into Temp.txt for paste.)
====================================================
	Delivery_Latitude
	(
    	type = text
		displayname = "Delivery Latitude"
	 	row = 9
	 	column = 1
		width = medium
	)
	Delivery_Longitude
	(
    	type = text
		displayname = "Delivery Longitude"
	 	row = 9
	 	column = 1
		width = medium
	)
	Geocode_Status
	(
    	type = text
		displayname = "Geocode Status"
		maxchar = 50
	 	row = 9
	 	column = 1
		width = medium
	)

Note: Location_Route ALREADY EXISTS live (plain type=text, Delivery_Details_Section) —
confirmed via Temp.txt, not previously known. Unused by this geocode feature; left as-is,
available later for the D.2/D.5 "route number" reading if that's ever built.

====================================================
STEP 0 — Get a free Geoapify API key (one-time, do this first)
====================================================
1. https://www.geoapify.com/ -> Sign Up (free, no billing/card required)
2. Create a project -> copy its API key
3. Paste that key into the GEOAPIFY_API_KEY placeholder in STEP 2 below before pasting
   the workflow into Creator.

====================================================
STEP 2 — New workflow: SA_Geocode_Address
Trigger: Service_Appointment_Form, Created or Edited > Successful form submission
====================================================
if(input.Customer_Address != null && input.Customer_Address != "" && (input.Delivery_Latitude == null || input.Delivery_Latitude == ""))
{
	rec = Service_Appointment_Form[ID == input.ID];
	addrRaw = input.Customer_Address;
	// Truncate at "Corner"/"Cor." — PH's common way of writing intersection addresses
	// (e.g. "Malaya St. Corner Banawe St. Barangay St Peter Quezon City"). Confirmed
	// live 2026-07-18 that just removing the WORD "Corner" (keeping the 2nd street name
	// in place) still wasn't enough — Geoapify's parser stayed confused enough that
	// candidates spanned totally different unrelated cities. Dropping the 2nd street +
	// everything after it ENTIRELY (keep only the housenumber + primary street) gives
	// Geoapify a clean, unambiguous single-street query instead — real tradeoff: loses
	// whatever barangay/city text happened to be positioned after the corner phrase in
	// the raw text, but City gets re-appended from the separate input.City field right
	// below regardless, and a true intersection point was never fully recoverable this
	// way anyway (this gets "the right street, right city," not the literal corner).
	// REVERTED 2026-07-18: a 2-street midpoint-average version was tried per user
	// request, tested live, and confirmed LESS accurate than this single-street version
	// — reverted back to this. Not re-attempting the midpoint approach without a
	// concrete new idea; the single-street truncation is the confirmed-best version.
	// getPrefix/contains used (not replaceAll) since we want everything BEFORE the
	// marker, not just the marker removed — only applied when the marker is actually
	// present, each casing checked explicitly (Deluge string matching is case-sensitive).
	if(addrRaw.contains(" Corner ")){ addrRaw = addrRaw.getPrefix(" Corner "); }
	else if(addrRaw.contains(" corner ")){ addrRaw = addrRaw.getPrefix(" corner "); }
	else if(addrRaw.contains(" CORNER ")){ addrRaw = addrRaw.getPrefix(" CORNER "); }
	else if(addrRaw.contains(" Cor. ")){ addrRaw = addrRaw.getPrefix(" Cor. "); }
	else if(addrRaw.contains(" cor. ")){ addrRaw = addrRaw.getPrefix(" cor. "); }
	else if(addrRaw.contains(" COR. ")){ addrRaw = addrRaw.getPrefix(" COR. "); }
	// Dedup guard: Customer_Address often already ends with the City text (confirmed
	// live, e.g. "216 Lumawig St. Bagong Barrio Caloocan City") — appending City again
	// produced a duplicated "caloocan city caloocan city" in Geoapify's own parsed
	// query, confirmed live via a direct API check to actively hurt matching. Only
	// append if not already present (case-insensitive).
	if(input.City != null && input.City != "" && addrRaw.toLowerCase().contains(input.City.toLowerCase()) == false)
	{
		addrRaw = addrRaw + ", " + input.City;
	}
	addrRaw = addrRaw + ", Philippines";
	// Basic query encoding — not a full URL-encode, sufficient for typical PH
	// street-address text (spaces/commas). NOTE if addresses ever contain other
	// special characters (&, ?, %) this needs a real encode function instead.
	addrQuery = addrRaw.replaceAll(" ","%20").replaceAll(",","%2C").replaceAll("#","%23");

	geoapifyKey = "6f9b26dbee0343928a891616ce088e91";
	info "[Geocode] querying: " + addrRaw;

	response = invokeurl
	[
		url :"https://api.geoapify.com/v1/geocode/search?text=" + addrQuery + "&format=json&apiKey=" + geoapifyKey
		type :GET
	];
	info "[Geocode] raw response: " + response;

	found = false;
	if(response != null)
	{
		results = response.get("results");
		if(results != null && results.size() > 0)
		{
			// Score each candidate instead of blindly taking index 0 — City match
			// weighted higher (+2) than barangay/neighbourhood text match (+1), highest
			// score wins (first-seen wins ties). CONFIRMED both matter independently,
			// live 2026-07-18: (a) Caloocan alone has 4 streets all named "Pag-asa
			// Street" in different barangays, all tied at identical confidence 0.9 —
			// needed the barangay-text tier to land on the right one; (b) "Malaya
			// Street" is common enough that a barangay-only match still isn't enough —
			// candidates spanned totally different CITIES (Marikina/Mandaluyong/QC)
			// with none matching on barangay text either, so City needed its own,
			// higher-weighted tier to at least rule out the wrong-city candidates
			// first.
			addrLower = addrRaw.toLowerCase();
			cityLower = "";
			if(input.City != null){ cityLower = input.City.toLowerCase(); }
			first = results.get(0);
			bestScore = -1;
			for each  cand in results
			{
				score = 0;
				candCity = cand.get("city");
				nb = cand.get("neighbourhood");
				sub = cand.get("suburb");
				if(candCity != null && candCity != "" && cityLower != "" && (candCity.toLowerCase().contains(cityLower) || cityLower.contains(candCity.toLowerCase())))
				{
					score = score + 2;
				}
				if(nb != null && nb != "" && addrLower.contains(nb.toLowerCase()))
				{
					score = score + 1;
				}
				else if(sub != null && sub != "" && addrLower.contains(sub.toLowerCase()))
				{
					score = score + 1;
				}
				if(score > bestScore)
				{
					bestScore = score;
					first = cand;
				}
			}
			info "[Geocode] " + results.size() + " candidates, best match score=" + bestScore;
			latVal = first.get("lat");
			lonVal = first.get("lon");
			resultType = first.get("result_type");
			rankInfo = first.get("rank");
			confidence = 0.0;
			if(rankInfo != null && rankInfo.get("confidence") != null)
			{
				confidence = rankInfo.get("confidence").toDecimal();
			}
			// Geoapify silently falls back to a city/district-centroid match when it
			// can't find the real street — confirmed live 2026-07-18 (TEST-SO-DMS-005,
			// "Lumawig St." isn't indexed in Geoapify's sources at all: 2 differently-
			// phrased queries both returned result_type="city", confidence~0.22, no
			// error). Still write the coordinates (a city-center pin beats no pin at
			// all on the map) but label it honestly instead of claiming street-level
			// "Success" it didn't actually achieve.
			info "[Geocode] lat=" + latVal + " lon=" + lonVal + " result_type=" + resultType + " confidence=" + confidence;
			if(latVal != null && lonVal != null)
			{
				rec.Delivery_Latitude = latVal + "";
				rec.Delivery_Longitude = lonVal + "";
				isCoarse = (resultType == "city" || resultType == "state" || resultType == "country" || confidence < 0.4);
				if(isCoarse)
				{
					rec.Geocode_Status = "Approximate (City Level)";
				}
				else
				{
					rec.Geocode_Status = "Success";
				}
				found = true;
			}
		}
	}
	if(found == false)
	{
		rec.Geocode_Status = "No Match";
	}
}

====================================================
NOTES:
- Cache-once guard (`Delivery_Latitude == null || == ""`) means editing the address text
  later does NOT auto-re-geocode — by design (avoids repeat calls against the same
  record on every unrelated save). If an address is corrected and needs a fresh pin,
  clear Delivery_Latitude to blank manually first, then resave.
- `Geocode_Status` surfaces failures visibly ("No Match") instead of silently leaving a
  blank pin with no explanation — matches this app's "no silent failures" convention.
- CONFIRMED 2026-07-18, 2nd real accuracy bug found + fixed on `TEST-SO-DMS-005`
  ("Pag Asa St. Barangay 146 Bagong Barrio Caloocan City"): Caloocan alone has 4
  different real streets named "Pag-asa Street" in 4 different barangays, all tied at
  identical confidence 0.9 from Geoapify — blindly taking `results.get(0)` picked the
  WRONG barangay (Barrio San Jose) even though the CORRECT one (Barangay 146, which the
  address text itself names) was in the same results list at index 3. Fixed by scanning
  all candidates and preferring the first one whose `neighbourhood`/`suburb` text
  actually appears in the original address string — falls back to index 0 unchanged if
  no candidate matches. This is a real, general risk for any address in a densely-
  duplicated-street-name area (common in Metro Manila) — the barangay-text-match fix
  meaningfully reduces it but doesn't eliminate it entirely (e.g. if the address text
  never actually names the barangay, there's no signal to disambiguate on).
- CONFIRMED 2026-07-18, 3rd real accuracy bug found + fixed on a corner-address stress
  test ("673 Malaya St. Corner Banawe St. Barangay St Peter Quezon City"): (a) the word
  "Corner" broke Geoapify's parser entirely — the whole query fell back to a bare
  city-centroid guess (`result_type:"city"`, confidence 0.25) instead of any real street
  match, confirmed via a direct side-by-side query with "Corner" stripped recovering real
  street-level candidates. Fixed by stripping the literal word "Corner"/"Cor." before
  querying. (b) Even after that fix, "Malaya Street" alone was common enough that
  candidates spanned totally different CITIES (Marikina/Mandaluyong/Quezon City) with
  none matching on barangay text — the old barangay-only scoring had no way to rule out
  the wrong-city ones. Fixed by upgrading candidate selection to a weighted score (City
  match +2, barangay/neighbourhood text match +1, highest score wins) instead of a single
  barangay-only check — guarantees a same-city candidate wins over a same-barangay-name-
  coincidence in a different city entirely. Genuine remaining ceiling, not fully solvable
  by query tricks alone: a true street-corner/intersection point isn't recoverable this
  way (the fix gets you "somewhere on the primary street," not the exact intersection),
  and an address with a genuinely uncommon/unindexed barangay name still has nothing to
  score on beyond City.
- `", Philippines"` appended to every query — Geoapify (like most geocoders) matches much
  better with a country hint; not needed for Nominatim's old query shape but cheap
  insurance either way, kept for both.
- Geoapify free tier: 3,000 requests/day, no billing required — plenty of headroom for
  this app's cache-once-per-record design at ~96 real records + sandbox scale.
- CONFIRMED 2026-07-18: the earlier Nominatim version genuinely failed on a real granular
  PH street address (`TEST-SO-DMS-005`, "216 Lumawig St. Bagong Barrio Caloocan City") —
  verified via a direct side-by-side curl test, not a script bug (a broader city-only
  query succeeded against Nominatim, proving the pipeline itself was correct, just the
  underlying OSM data was too sparse for that address). Switched to Geoapify same day.
- UNTESTED (Geoapify version) — needs the real API key swapped in, this workflow
  re-pasted, then a resave on a sandbox record with a real Customer_Address to confirm
  Delivery_Latitude/Longitude populate and Geocode_Status shows "Success".
====================================================

````
