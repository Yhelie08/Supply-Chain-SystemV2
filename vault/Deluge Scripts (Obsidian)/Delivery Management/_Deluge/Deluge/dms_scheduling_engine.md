---
title: "dms_scheduling_engine"
source_file: "dms_scheduling_engine.txt"
category: "Delivery Management/_Deluge/Deluge"
associated_widget: "[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]"
lines: 1650
tags:
  - crate
  - custom-api
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - inquiry
  - order-aggregation
  - pack
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - qc
---

# dms_scheduling_engine

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]
> - **Category:** `Delivery Management/_Deluge/Deluge`
> - **Source File:** `dms_scheduling_engine.txt`
> - **Lines of Code:** 1,650
> - **Tags:** `#crate`, `#custom-api`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#inquiry`, `#order-aggregation`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#qc`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
====================================================
2026-09-15 CHANGE SUMMARY (plain language, para masundan) — READ THIS FIRST
====================================================
ANO ANG PROBLEMA: Ang pagpili ng team ay batay lang sa ORAS (Max_Capacity_Hours).
Real-world report: "~20 na-schedule sa isang team lang, hindi na nila kayang
tapusin", at "may ibang team pero laging iisang team lang ang ma-suggest ng
sistema." Root cause: ang "gaano na ka-busy" ang isang team ay binibilang lang
mula sa mga job na naka-CONFIRM NA (Confirmed_Schedule_Date). Ang mga bagong
job na "Suggested" pa lang (hindi pa manually kina-confirm ng officer) ay HINDI
binibilang — kaya kung maraming job ang papasok bago pa ma-confirm ang mga
naunang suggestion, LAHAT ng team ay makikitang "0 used" pa rin sa sistema, at
ang laging napipili ay ang unang team sa listahan, paulit-ulit, hanggang hindi
pa na-confirm ang mga naunang suggestion.

ANO ANG GINAWANG AYOS: Dalawang bagay, parehong nasa parehong slot-search loop
(Action 1, Re_Schedule, at dms_reschedule_custom_api.txt — 3 magkaparehong
lugar, existing convention na dito):
1. Bagong field, Max_SO_Capacity (Number) sa Daily_Team_Availability — per
   user request, "by SO" ang capacity, hindi "by package": max bilang ng
   SO/delivery na kaya ng isang team kada araw, hiwalay sa oras. Kapag umabot
   na ang isang team sa Max_SO_Capacity nito para sa isang araw, hindi na
   siya ma-eeligible sa araw na iyon kahit may natitira pang oras — lilipat
   sa susunod na team.
2. Ang bagong SO-count na ito ay binibilang mula sa Confirmed AT Suggested
   (hindi lang Confirmed, di tulad ng existing hours-based `used` na
   sinadyang hindi ginalaw) — ito mismo ang direktang naka-ayos sa root
   cause sa itaas: sa sandaling ma-suggest ang isang job sa isang team, agad
   itong "bumababa" ang SO slots niya sa susunod na paghahanap, kaya kusang
   kakalat sa ibang available team sa halip na palaging bumalik sa iisang
   team lang.

GAANO KALAWAK ANG PINALITAN: Idinagdag lang ang SO-count check bago ang
existing hours check sa loob ng parehong "for each t in teams" loop — walang
binagong ibang logic (parehong pareho pa rin ang hours-based capacity, Exception
flagging, overtime rule, Priority auto-confirm, atbp.). Hindi ginalaw ang
Action 2 (officer manual-override gate) — hiwalay na desisyon iyon, sa
"suggestion"/team-picking logic lang ang saklaw ng pagbabagong ito.

KAILANGAN PA BAGO ITURING NA TAPOS (live test): (1) idagdag ang Max_SO_Capacity
field sa Daily_Team_Availability form (Number, same section as Max_Capacity_
Hours); (2) i-paste ulit ang Action 1, Re_Schedule, at dms_reschedule_custom_
api.txt; (3) punuan ng officer ang Max_SO_Capacity ng isang team (hal. 3) sa
DailyTeamAvailability widget; (4) gumawa ng 4 magkakasunod na Site-Confirmed
appointment sa parehong araw, walang Confirm pa — kumpirmahin na ang ika-4
ay lumipat na sa ibang team (o "Calendar Full" kung wala nang ibang eligible)
sa halip na sumabay pa rin sa parehong team na lampas na sa 3.
====================================================

====================================================
2026-09-08 CHANGE SUMMARY (plain language, para masundan) — READ THIS FIRST
====================================================
ANO ANG PROBLEMA: Ang "Suggested Time" ay laging FIXED (hal. laging 8:00 AM) sa
BAWAT job, kahit ilan pang ibang job na meron na ang parehong team (Installer/
Driver) sa parehong araw. Resulta: kapag 2 o higit pang job ang parehong team
sa isang araw, may malaking "patay na oras" (pending time) sa pagitan nila
imbis na dumiretso agad sa susunod na site pagkatapos ng una.

ANO ANG GINAWANG AYOS: Ang Suggested Time ngayon ay awtomatikong nagda-dagdag
ng oras batay sa kung gaano na katagal ang NAUNANG naka-CONFIRM na job ng
parehong team sa parehong araw. Halimbawa: kung natapos (estimated) ang unang
job ng 10:18 AM, ang susunod na job ng parehong team ay awtomatikong magsu-
suggest ng 10:18 AM na rin — hindi na 12:20 PM o ibang malayong oras.

GAANO KALAWAK ANG PINALITAN — MAKITID LANG, HINDI MALAWAK:
- Isang bagay lang ang binago: KUNG PAANO KINU-COMPUTE ang oras ng Suggested
  Time Slot. WALANG binagong ibang logic — pareho pa rin ang capacity check,
  Exception flagging, overtime rule, pagpili ng team/vehicle, atbp.
- WALANG bagong field sa Zoho form, WALANG bagong Policy Setting, WALANG
  binagong widget (DeliveryQueue/OngoingService), WALANG bagong workflow —
  pareho pa ring 3 lugar na dati (SA_Scheduling_Engine Action 1 sa baba,
  Re_Schedule button, at dms_reschedule_custom_api.txt).
- 2 file lang ang na-edit sa buong project: itong file (dms_scheduling_engine.
  txt) at dms_reschedule_custom_api.txt — pareho silang may 3 magkaparehong
  kopya (existing convention na dito), kaya 6 file ang na-touch pero iisang
  klase lang ng pagbabago ang in-ulit sa lahat, hindi magkakaiba.

MAHALAGANG LIMITASYON (hindi bug, sinadya): ang "already used" na oras na
ginagamit sa bagong computation ay yun lang mga job na naka-CONFIRM na ng
officer (Confirmed_Schedule_Date meron na) — hindi kasama yung mga job na
"Suggested" pa lang, hindi pa na-confirm. Ganito rin talaga ang existing
capacity-check logic bago pa ang pagbabagong ito, kaya consistent lang.

HINDI PA GINAWA (Phase 1B, hiwalay na desisyon): pag-batay sa TUNAY na oras
ng pagkatapos ng job (hindi lang estimate) — kailangan pa nito ng bagong
paraan para i-sync ang Field Work papunta sa Service Appointment, wala pa
'yun ngayon. Flagged lang, hindi ginawa.

KAILANGAN PA BAGO ITURING NA TAPOS (live test): i-paste ulit ang buong 3
workflow/function na ito (Action 1 sa baba, Re_Schedule Report Action Item,
at dms_reschedule_custom_api.txt) sa Zoho, tapos gumawa ng 2 magkasunod na
Confirmed appointment sa parehong team/araw — tignan kung tama na ang
suggested time ng 2nd job.

Detalyadong technical na paliwanag: hanapin ang mga "NEW 2026-09-08" na
comment sa loob ng file na ito (Action 1, Re_Schedule) at sa
dms_reschedule_custom_api.txt.
====================================================

== DMS Section B — Scheduling Engine Logic ==
== New 2026-07-17, per DMS_Full_Build_Plan_v1.1.pdf Section B, adapted to this app's
   real fields + Section F (Policy Settings, seeded) + Section C (Site Confirmation,
   confirmed working) + a new form built for this section, Daily_Team_Availability. ==
== Section D (Calendar Auto-Write) folded into Action 2/3 of this same file, same day,
   per user decision: internal-only (no external calendar API — no Google/Zoho Calendar
   integration exists or was requested anywhere in this build). See the Section D block
   in SIMPLIFICATIONS below for how D.3's "No Overlap" rule was reinterpreted. ==

PREREQUISITE: new form Daily_Team_Availability (Availability_Date/Installer/Driver/
Vehicle/Availability_Status/Max_Capacity_Hours/Notes) — officer fills this in each
morning per the plan's own "Daily Team Setup (Officer Input Required Before Engine
Runs)" requirement. No existing form in this app tracked team capacity at all.

PREREQUISITE, 2026-09-11: new field Start_Time1 (Time), Daily_Team_Availability,
same section as the other daily-fill fields — per user, some field teams genuinely
start as early as 6:00 AM while others start later, so a single global Policy
Setting (workday_start_time) can't represent it. Officer fills this in per team
per day alongside Max_Capacity_Hours/Vehicle/etc; if left blank, the engine falls
back to a hardcoded 8:00 AM for that team's day — the Policy Setting is
deliberately NOT used as a fallback anymore (per user instruction).

PREREQUISITE (Section D): new field Calendar_Event_Summary (Multi Line Text) on
Service_Appointment_Form, Scheduling_Section (row 11) — see field-add snippet in NOTES.

PREREQUISITE, 2026-09-15: new field Max_SO_Capacity (Number), Daily_Team_Availability,
same section as Max_Capacity_Hours/Start_Time1 — per user, capacity should also be
capped by NUMBER OF SALES ORDERS/deliveries a team can take per day, not hours
alone (a team could still show "hours" remaining but shouldn't be piled with more
stops than is realistic). Officer fills this in per team per day; if left blank or
0, the engine treats it as NO LIMIT for that team/day — same deliberate
no-fallback-value convention as Start_Time1 above, so existing rows without it
don't suddenly become artificially capped at 0.

====================================================
WORKFLOW SETUP — Daily_Team_Availability
  Trigger: Created or Edited > Validations
  Workflow name: DTA_Validate_Required — 1 action block
  Added 2026-07-17, per user request ("handle the required fields first... we do not
  want saving empty datas") while building the DailyTeamAvailability widget — the
  widget already had client-side required-field checks (Availability_Date/Installer/
  Availability_Status), but nothing enforced this server-side/natively, same gap just
  found and fixed on DMS_Exception_Queue (see dms_exception_queue.txt's own
  EXC_Validate_Resolution). Same defense-in-depth pattern as every other form in this
  app now applies here too.
====================================================

--- Action 1 ---

if(input.Availability_Date == null || input.Installer == null || input.Installer == "" || input.Availability_Status == null || input.Availability_Status == "")
{
	alert "Availability Date, Installer, and Availability Status are all required.";
	cancel submit;
}

SIMPLIFICATIONS, flagged deliberately rather than silently:
- No literal clock-time slot-of-day math. Deluge doesn't handle time arithmetic
  cleanly, and the plan's own "start time / end time" sequencing across a team's day
  would be a lot of complexity for mock-tested v1. Eligibility/capacity/overtime are
  all based on CUMULATIVE HOURS per team per day (real, correctly computed).
  UPDATED 2026-09-08 — Suggested_Time_Slot is NO LONGER a flat workday_start_time
  placeholder for every job (that was leaving idle "pending" gaps between back-to-
  back stops for the same team/day, e.g. a 2-hr 8:00 AM job followed by a 2nd stop
  ALSO suggested at a flat time instead of right after the first one finishes — real
  user-reported issue). It's now workday_start_time + foundUsed (the team's own
  cumulative buffered hours already booked that day, reusing the existing 15%
  traffic buffer as the travel allowance between stops, not a separate gap) — see the
  "NEW 2026-09-08" comment block inline in Action 1 / Re_Schedule / dms_reschedule_
  custom_api.txt for the exact minute-math. Still not literal start/end-time interval
  tracking (no field stores an appointment's actual END time) — this is a fixed-point
  offset computed fresh each time from cumulative hours, not a real calendar/interval
  model. Officer still adjusts manually if reality diverges from the estimate.
- "Assigned Team" = Installer + Driver together (per user decision) — no separate
  Assigned_Team field exists (Section A deliberately skipped it), the engine writes
  directly to the existing Installer/Assigned_to_Driver fields instead.
- Batch Check (B.5, grouping same-city/date/fleet orders) is NOT implemented — City
  field is confirmed unreliable in real data (mostly blank, real address text lives in
  Logistic_Notes as unstructured free text, not the structured City field the plan
  assumes). Building real proximity batching on unreliable data would be worse than no
  batching at all. Flagged as a gap, not attempted.
- Multi-Day Install always escalates to a Flagged exception immediately (plan's own
  "requires officer confirmation" — no attempt to auto-plan multiple days).
- 3rd Party fleet selection logic (B.3's "Own Fleet OR 3rd Party" delivery types) is
  NOT auto-decided — engine always tries Own Fleet capacity first; a real 3rd-party
  decision would need Policy Settings' third_party_providers wired to an actual
  provider-availability check, which doesn't exist. Flagged as a gap.
- Exception Queue (Section E) doesn't exist yet — every "flag to Exception Queue"
  outcome just sets Exception_Status="Flagged" + Exception_Reason=<text> (both real
  Section A fields) with a TODO comment, same pattern as Section C.
- "Pending Confirmation" (the plan's suggested-but-not-yet-approved Delivery_Status)
  isn't one of the real Delivery_Status dropdown values — reusing "Queued" instead
  (closest existing semantic match), rather than adding yet another dropdown value.

SECTION D (Calendar Auto-Write) SIMPLIFICATIONS, same rationale as above:
- D.3 Rule 1 "No Overlap" reinterpreted as a CAPACITY check, not literal clock-time
  overlap — consistent with this whole build never tracking real distinct time slots
  (see the first bullet above). "Conflict" = this team's total confirmed hours for the
  date, including this order, would exceed Daily_Team_Availability.Max_Capacity_Hours.
  A literal start/end-time overlap check would be inconsistent with (and more precise
  than) every other capacity decision in this engine, which is why it wasn't built that
  way instead — flagged as a deliberate scope-consistency choice, not an oversight.
- D.2's "Calendar Event Structure" is written as ONE readable text field
  (Calendar_Event_Summary) on the record itself, not a separate Calendar
  form/module or external API — per explicit user decision 2026-07-17 (no external
  calendar service exists or was requested anywhere in this build; every other DMS
  module is native data + a future custom widget, same pattern applied here).
- D.2's "Location" field uses Customer_Address + City (both real, pre-existing fields)
  — the plan's own G.3 Step 3 called for a separate Area/Region field to be added
  during the Section G taxonomy cleanup, but that field was never actually built in
  this session (G only did the Delivery Type value remapping, not a new geography
  field) — flagged as a real, pre-existing gap from Section G, not introduced here.
- D.3 Rules 3 (Multi-Day Block) and 4 (3rd Party Events) are not separately implemented
  — both trace back to gaps already flagged above (Multi-Day always escalates instead
  of auto-planning; 3rd-party fleet is never auto-decided) — no calendar-specific work
  needed until those upstream gaps are closed.
- D.4's sync rules are only partially built: "Completed"/"Failed" append a status tag
  onto Calendar_Event_Summary (Action 3, new). "Order cancelled -> delete or archive
  event" has no real target to delete/archive (no external calendar) and no
  cancellation workflow exists anywhere in this app's DMS build yet — not built,
  flagged as a gap.
- D.7 Failure Handling: a real Deluge `alert` popup isn't available in this trigger
  context (Successful form submission — alert only works in Load of form/Validations/
  On Change, already a documented Deluge Gotcha) — same mechanism Section B already
  uses for its own failure cases (Calendar Full/Overtime): Exception_Status="Flagged"
  + Exception_Reason, which is a real, visible, non-silent surface even without a popup.

====================================================
WORKFLOW SETUP — Service_Appointment_Form
  Trigger: Created or Edited > Successful form submission
  Workflow name: SA_Scheduling_Engine (4 unnamed action blocks, in this order —
  same "one workflow name, multiple ordered blocks" convention as Section C.
  Action 3 added for Section D, 2026-07-17. Action 4 added 2026-09-14 for the
  With-Installation-to-Pick-Up conversion case.)
====================================================

--- Action 1 (script block 1 of 3) — Engine: gate check, classify, slot search, write suggestion ---

if(input.Site_Confirmation_Status == "Confirmed" && input.Suggested_Schedule_Date == null && input.Confirmed_Schedule_Date == null)
{
	rec = Service_Appointment_Form[ID == input.ID];

	// Gate: Exception Status must be None/Resolved before scheduling can proceed
	if(input.Exception_Status == "Flagged")
	{
		return;
	}

	// ADDED 2026-09-14, per user (Process Engineer + System Developer walkthrough,
	// "Wala namang limitasyon ang Pick Up kasi naka depende ito sa customer") — a
	// Pick Up delivery has no team/vehicle to dispatch at all (the client comes to
	// get the item themselves), so it has no real "capacity" to search for — the
	// whole slot-search/team-matching logic below simply does not apply. Confirmed
	// live: "Pick Up" already exists as a real choice on Type_of_Delivery (Service
	// Appointment Form field builder), just never had engine logic wired to it.
	// Deliberately just returns — no Suggested_Schedule_Date is written, leaving
	// Confirmed_Schedule_Date entirely open for the dispatcher (or the client
	// themselves, per the same conversation) to set directly via DeliveryQueue.
	// See Action 2's own matching Pick Up branch for what happens once that date is
	// actually set.
	if(input.Type_of_Delivery == "Pick Up")
	{
		return;
	}

	// Fleet_Decision gate ADDED 2026-09-16, briefly narrowed then reverted
	// 2026-09-17 (see this file's own history) — REMOVED entirely 2026-09-17
	// once confirmed against the user's own live-paste reference
	// (IPAPASTE_KO_2026-09-16.txt) that this gate was never actually deployed:
	// the live engine has always auto-suggested a team off Daily_Team_
	// Availability alone, with no Fleet_Decision precondition. Removed here so
	// the canonical file matches live behavior instead of a never-shipped
	// design. Re-adding a real "decide fleet before auto-scheduling" gate is a
	// separate, deliberate decision for later — not bundled into this cleanup.
	// (Original 3rd-party-confirms-outright branch in Action 2, and the
	// Override_Validate skip for Fleet_Decision=="3rd Party", are UNCHANGED —
	// those don't block auto-suggest, only skip override paperwork/confirm a
	// courier job outright, and stay useful regardless of this gate's status.)

	// Classify (B.3)
	deliveryType = input.Type_of_Delivery;
	if(deliveryType == "Multi-Day Install")
	{
		rec.Exception_Status = "Flagged";
		rec.Exception_Reason = "Requires Manual Planning";
		custNameExc1 = "";
		if(rec.Customer_Name != null)
		{
			custNameExc1 = rec.Customer_Name.first_name + " " + rec.Customer_Name.last_name;
		}
		insert into DMS_Exception_Queue
		[
			Sales_Order_Reference = rec.ID
			Customer_Name = custNameExc1
			Exception_Stage = "Scheduling"
			Exception_Reason = "Requires Manual Planning"
			Severity = "Medium"
			Raised_By = "System"
			Date_Raised = zoho.currenttime
			Status = "Open"
			Added_User = zoho.loginuser
		];
		return;
	}
	isFullDay = (deliveryType == "Full-Day Install");
	fleetAssignment = "Own Fleet"; // 3rd-party auto-decision not implemented, see NOTES — CONFIRMED 2026-09-14 per user this stays a MANUAL dispatcher override, not an automatic rule ("Oo gawin na itong manual desisyon ito kasi depende parin ito sa customer")

	estDuration = input.Estimated_Duration;
	if(estDuration == null || estDuration == 0)
	{
		// FIXED 2026-09-11, per user ("ayusin natin lahat ng dapat ifix") — a flat
		// 2hr guess was used for EVERY delivery type whenever this field was left
		// blank, which is the common case in practice per the user's own report
		// ("officers never fill it in even on completed orders"), not a rare edge
		// case — meaning the whole capacity/chaining engine was mostly scheduling
		// off a guess, not real job durations. Now defaults by Type_of_Delivery
		// (Delivery Only=2h, With Installation=4h, Full-Day Install=8h — same
		// numbers proposed earlier this project and never confirmed/built), AND
		// writes the default back onto the record itself so Estimated_Duration is
		// no longer silently blank for any OTHER feature/report that reads it
		// directly, not just this one calculation.
		estDuration = if(deliveryType == "With Installation", 4, if(deliveryType == "Full-Day Install", 8, 2));
		rec.Estimated_Duration = estDuration;
	}
	bufferPct = 15;
	pBuf = Policy_Settings[Policy_Key == "traffic_buffer_percent"];
	if(pBuf != null && pBuf.Value != null && pBuf.Value != "")
	{
		bufferPct = pBuf.Value.toLong();
	}
	bufferedDuration = estDuration * (1 + (bufferPct / 100.0));
	if(isFullDay)
	{
		bufferedDuration = 8; // Block Rule: full workday, matches B.3's own rule
	}

	maxWindow = 14;
	pWin = Policy_Settings[Policy_Key == "max_days_scheduling_window"];
	if(pWin != null && pWin.Value != null && pWin.Value != "")
	{
		maxWindow = pWin.Value.toLong();
	}
	workdayHours = 9; // fallback default, overridden below from Policy_Settings
	pStartWD = Policy_Settings[Policy_Key == "workday_start_time"];
	pEndWD = Policy_Settings[Policy_Key == "workday_end_time"];
	if(pStartWD != null && pStartWD.Value != null && pStartWD.Value != "" && pEndWD != null && pEndWD.Value != null && pEndWD.Value != "")
	{
		sParts = pStartWD.Value.toList(" ");
		eParts = pEndWD.Value.toList(" ");
		if(sParts.size() == 2 && eParts.size() == 2)
		{
			sHr = sParts.get(0).toList(":").get(0).toLong();
			eHr = eParts.get(0).toList(":").get(0).toLong();
			if(sParts.get(1).toUpperCase() == "PM" && sHr != 12){ sHr = sHr + 12; }
			if(eParts.get(1).toUpperCase() == "PM" && eHr != 12){ eHr = eHr + 12; }
			if(sParts.get(1).toUpperCase() == "AM" && sHr == 12){ sHr = 0; }
			if(eParts.get(1).toUpperCase() == "AM" && eHr == 12){ eHr = 0; }
			if(eHr > sHr)
			{
				workdayHours = eHr - sHr;
			}
		}
	}

	// Slot search (B.4) — evaluate every available team per candidate day, earliest
	// day with an eligible team wins. Runs day-by-day rather than one big query
	// because "remaining capacity" depends on that SPECIFIC day's existing bookings.
	// Deluge has NO while loop at all (confirmed) — searchDays is a fixed-length
	// placeholder list (maxWindow empty elements), for each-ed with our own manual
	// dayCounter; the "if(foundTeam == null)" guard inside means once a match is
	// found, remaining iterations do nothing instead of needing a break statement
	// (Deluge for-each has no reliable early-exit either — this dodges that too).
	// NOTE: deliberately never hold a Daily_Team_Availability RECORD across a loop
	// boundary/reassignment (e.g. "bestTeam = t;" then read later) — same exotic
	// object-lifetime class as this app's documented subform-row-mutability gotcha.
	// Only plain strings/numbers (Installer/Driver name, hours) survive past each
	// for-each iteration.
	foundInstaller = null;
	foundDriver = null;
	foundDate = null;
	foundUsed = 0;
	foundVehicle = null;
	dayCounter = 0;
	searchDays = "".leftpad(maxWindow).toList(""); // FIX 2026-09-11: now includes TODAY as a candidate (was tomorrow-only, maxWindow-1 length)
	for each  dayMarker in searchDays
	{
		dayCounter = dayCounter + 1;
		if(foundInstaller == null)
		{
			candidateDate = zoho.currentdate.addDay(dayCounter - 1); // offset 0 = today, not tomorrow
			teams = Daily_Team_Availability[Availability_Date == candidateDate && Availability_Status != "Not Available"];
			bestInstaller = null;
			bestDriver = null;
			bestRemaining = -1;
			bestUsed = 0;
			bestVehicle = null;
			bestSoCount = 999999;
			if(teams != null)
			{
				for each  t in teams
				{
					tInstaller = t.Installer;
					tDriver = t.Driver;
					tVehicle = t.Vehicle;
					cap = t.Max_Capacity_Hours;
					if(cap == null)
					{
						cap = 0;
					}
					usedRecs = Service_Appointment_Form[Installer == tInstaller && Confirmed_Schedule_Date == candidateDate && Appointment_Status != "Failed"];
					used = 0;
					if(usedRecs != null)
					{
						for each  u in usedRecs
						{
							ud = u.Estimated_Duration;
							if(ud == null)
							{
								ud = 0;
							}
							used = used + (ud * (1 + (bufferPct / 100.0)));
						}
					}
					remaining = cap - used;

					// NEW 2026-09-15, per user ("by SO ang capacity, hindi package") — a team
					// can also cap out by NUMBER OF SO/deliveries per day, independent of
					// hours left. Counts BOTH Confirmed AND Suggested-but-not-yet-confirmed
					// jobs for this team/day (unlike the hours-based `used` above, which stays
					// Confirmed-only per its own documented limitation) — this is what actually
					// fixes "system only ever suggests one team": Suggested jobs previously
					// didn't count against ANY capacity check, so every fresh search saw every
					// team at 0 used and kept re-picking the same first-listed team.
					soCountToday = 0;
					soRecsToday = Service_Appointment_Form[Installer == tInstaller && (Confirmed_Schedule_Date == candidateDate || Suggested_Schedule_Date == candidateDate) && Appointment_Status != "Failed"];
					if(soRecsToday != null)
					{
						for each  sr in soRecsToday
						{
							soCountToday = soCountToday + 1;
						}
					}
					maxSO = t.Max_SO_Capacity;
					soCapOk = true;
					if(maxSO != null && maxSO > 0 && soCountToday >= maxSO)
					{
						soCapOk = false;
					}

					// NEW 2026-09-15b -- tie-break: when 2+ teams have EQUAL remaining
					// hours (e.g. both fully idle), prefer whichever has FEWER already-
					// suggested/confirmed jobs today (soCountToday) instead of always
					// picking the first team in query order -- closes the residual
					// "same team keeps getting suggested" gap the same-day Max_SO_
					// Capacity fix didn't fully cover (that fix only blocks once a
					// team HITS its cap; ties before that point were still arbitrary).
					if(soCapOk && bufferedDuration <= remaining && (remaining > bestRemaining || (remaining == bestRemaining && soCountToday < bestSoCount)))
					{
						bestInstaller = tInstaller;
						bestDriver = tDriver;
						bestRemaining = remaining;
						bestUsed = used;
						bestVehicle = tVehicle;
						bestSoCount = soCountToday;
					}
				}
			}
			if(bestInstaller != null)
			{
				foundInstaller = bestInstaller;
				foundDriver = bestDriver;
				foundDate = candidateDate;
				foundUsed = bestUsed;
				foundVehicle = bestVehicle;
			}
		}
	}

	if(foundInstaller == null)
	{
		rec.Exception_Status = "Flagged";
		rec.Exception_Reason = "Calendar Full";
		// FIXED 2026-09-16, per user ("baka may masasuggest siya pero wala naman
		// team availability") — a Suggested_Schedule_Date/Time written by an
		// EARLIER run must not be left sitting on the record once a LATER run
		// genuinely finds zero team availability, or DeliveryQueue keeps showing
		// (and letting the officer "Approve") a suggestion that no longer has any
		// real team behind it. No-op the first time Action 1 ever runs on a fresh
		// record (nothing to clear yet), but matters once this same clearing is
		// mirrored into Re_Schedule/reScheduleDelivery below, which CAN re-run
		// after a real suggestion already exists.
		rec.Suggested_Schedule_Date = null;
		rec.Suggested_Time_Slot = null;
		rec.Installer = null;
		rec.Assigned_to_Driver = null;
		rec.Fleet_Assignment = null;
		custNameExc2 = "";
		if(rec.Customer_Name != null)
		{
			custNameExc2 = rec.Customer_Name.first_name + " " + rec.Customer_Name.last_name;
		}
		insert into DMS_Exception_Queue
		[
			Sales_Order_Reference = rec.ID
			Customer_Name = custNameExc2
			Exception_Stage = "Scheduling"
			Exception_Reason = "Calendar Full"
			Severity = "Medium"
			Raised_By = "System"
			Date_Raised = zoho.currenttime
			Status = "Open"
			Added_User = zoho.loginuser
		];
		return;
	}

	// Overtime check (B.6) — approximated via cumulative hours vs a fixed workday
	// span, since no literal clock-time slot tracking exists. 3rd Party skips this
	// entirely per the plan.
	projectedTotal = foundUsed + bufferedDuration;
	isOvertimeRisk = (projectedTotal > workdayHours) && (fleetAssignment == "Own Fleet");
	if(isOvertimeRisk)
	{
		rec.Exception_Status = "Flagged";
		rec.Exception_Reason = "Slot Pushed — Overtime Declined";
		// FIXED 2026-09-16 — same stale-suggestion clear as the Calendar Full
		// block just above, same reasoning.
		rec.Suggested_Schedule_Date = null;
		rec.Suggested_Time_Slot = null;
		rec.Installer = null;
		rec.Assigned_to_Driver = null;
		rec.Fleet_Assignment = null;
		custNameExc3 = "";
		if(rec.Customer_Name != null)
		{
			custNameExc3 = rec.Customer_Name.first_name + " " + rec.Customer_Name.last_name;
		}
		insert into DMS_Exception_Queue
		[
			Sales_Order_Reference = rec.ID
			Customer_Name = custNameExc3
			Exception_Stage = "Scheduling"
			Exception_Reason = "Slot Pushed — Overtime Declined"
			Severity = "Medium"
			Raised_By = "System"
			Date_Raised = zoho.currenttime
			Status = "Open"
			Added_User = zoho.loginuser
		];
		return;
	}

	// Write suggested schedule (B.7)
	// FIX 2026-09-11, per user (some field teams genuinely start as early as 6:00
	// AM, others later — a single global Policy Setting can't represent that, and
	// per user's own instruction the Policy Setting is deliberately NOT used as a
	// fallback here anymore): read the WINNING team's own Start_Time1 off its
	// Daily_Team_Availability row for foundDate/foundInstaller. Only a hardcoded
	// "8:00 AM" is used if that team left Start_Time1 blank for that day.
	workdayStartStr = "8:00 AM";
	teamStartRecs = Daily_Team_Availability[Availability_Date == foundDate && Installer == foundInstaller];
	if(teamStartRecs != null)
	{
		for each tsr in teamStartRecs
		{
			if(tsr.Start_Time1 != null)
			{
				tsrStr = tsr.Start_Time1.toString();
				if(tsrStr != null && tsrStr != "")
				{
					workdayStartStr = tsrStr;
				}
			}
		}
	}

	// ---- NEW 2026-09-08, per user (avoid idle "pending" time between back-to-
	// back stops for the same team/day — e.g. a 2-hr job suggested at 8:00 AM
	// was leaving a 2nd stop suggested at a flat workday_start_time again
	// instead of right after the first one finishes). Suggested_Time_Slot used
	// to be a flat nominal placeholder (always workday_start_time) for EVERY
	// job on a team's day, ignoring hours already committed earlier that day.
	// Now offsets the suggestion by foundUsed (this team's cumulative buffered
	// hours already booked on foundDate BEFORE this job — already computed
	// above in the slot-search loop) so a 2nd/3rd stop starts right when the
	// prior one is expected to finish. Reuses the SAME 15% traffic buffer
	// already folded into foundUsed/bufferedDuration as the travel allowance
	// between stops, rather than double-counting travel time with a separate
	// fixed gap.
	// SIMPLIFICATION, flagged deliberately: minutes are truncated (toLong()),
	// not rounded — off by at most 59 seconds of display time, never compounds
	// across jobs since each job's offset is always computed fresh from
	// foundUsed (real cumulative hours), not from a previous job's own
	// already-truncated display string. ----
	computedTimeSlot = workdayStartStr;
	ctsParts = workdayStartStr.toList(" ");
	if(ctsParts.size() == 2)
	{
		ctsHM = ctsParts.get(0).toList(":");
		if(ctsHM.size() >= 2) // >=2 not ==2: a native TIME field's toString() can include seconds (3 parts)
		{
			ctsHr = ctsHM.get(0).toLong();
			ctsMin = ctsHM.get(1).toLong();
			ctsAmPm = ctsParts.get(1).toUpperCase();
			if(ctsAmPm == "PM" && ctsHr != 12){ ctsHr = ctsHr + 12; }
			if(ctsAmPm == "AM" && ctsHr == 12){ ctsHr = 0; }
			ctsTotalMin = (ctsHr * 60) + ctsMin + (foundUsed * 60).toLong();
			ctsHr24 = ctsTotalMin / 60;
			ctsMinRem = ctsTotalMin - (ctsHr24 * 60);
			ctsDispHr = ctsHr24;
			if(ctsHr24 == 0){ ctsDispHr = 12; }
			if(ctsHr24 > 12){ ctsDispHr = ctsHr24 - 12; }
			ctsDispAmPm = "AM";
			if(ctsHr24 >= 12){ ctsDispAmPm = "PM"; }
			ctsMinStr = ctsMinRem + "";
			if(ctsMinRem < 10){ ctsMinStr = "0" + ctsMinRem; }
			computedTimeSlot = ctsDispHr + ":" + ctsMinStr + " " + ctsDispAmPm;
		}
	}

	rec.Suggested_Schedule_Date = foundDate;
	rec.Suggested_Time_Slot = computedTimeSlot; // real per-job offset, see NEW 2026-09-08 note above
	/* CHANGED 2026-07-23, per user ("fleet assignment should be the vehicle") —
	   Fleet_Assignment used to just always show the hardcoded fleetAssignment
	   string ("Own Fleet" — 3rd-party auto-decision was never implemented, so
	   this was a constant, not a real decision, on every single record). Now
	   shows the actual assigned team's own Vehicle (captured off the same
	   Daily_Team_Availability row Installer/Driver came from, foundVehicle) when
	   one is set — falls back to the old fleetAssignment string only if that
	   Daily_Team_Availability record's own Vehicle field is blank. */
	if(foundVehicle != null && foundVehicle != "")
	{
		rec.Fleet_Assignment = foundVehicle;
	}
	else
	{
		rec.Fleet_Assignment = fleetAssignment;
	}
	rec.Installation_Required = (deliveryType == "With Installation" || deliveryType == "Full-Day Install");
	rec.Calendar_Entry_Created = false;
	rec.Appointment_Status = "Queued"; // stand-in for "Pending Confirmation", see NOTES
	rec.Installer = foundInstaller;
	rec.Assigned_to_Driver = foundDriver;
	fleetDisplay = fleetAssignment;
	if(foundVehicle != null && foundVehicle != "")
	{
		fleetDisplay = foundVehicle;
	}
	rec.Original_System_Suggestion = "System suggested: " + foundInstaller + " / " + foundDriver + " on " + foundDate + " (" + fleetDisplay + ")";

	// ---- NEW 2026-08-07, per user ("if e sched -> auto priority dapat hindi na
	// mag manual") — a Priority record (stamped true by dms_field_work_reschedule.
	// txt on a freshly re-queued reschedule) auto-confirms its own system
	// suggestion immediately instead of waiting for the officer to manually copy
	// Suggested into Confirmed. Deliberately does NOT touch anything above this
	// point — the normal (non-priority) path runs 100% identically either way.
	// Inlines Action 2's calendar-write logic directly rather than relying on
	// Action 2 firing on its own: setting rec.Confirmed_Schedule_Date here does
	// NOT make Action 2 fire in this same execution (input stays the ORIGINAL
	// submitted snapshot for every action within one workflow run — a rec-write
	// from Action 1 is not visible as input.* to Action 2 until some LATER save
	// re-triggers the whole workflow), so without this block a Priority record's
	// Confirmed_Schedule_Date would sit populated forever with Calendar_Entry_
	// Created still false / Appointment_Status stuck on "Queued".
	if(input.Priority == true)
	{
		// Re-runs the SAME D.3 capacity conflict check Action 2 normally does right
		// before flipping Calendar_Entry_Created — Action 1's own slot-search above
		// already confirmed capacity against ALL non-Failed bookings for this team/
		// date, but this narrower Calendar_Entry_Created==true-only check is what
		// actually gates the calendar lock elsewhere in this file, so it's repeated
		// here for consistency rather than assumed to already be covered.
		teamCapP = 8;
		availRecsP = Daily_Team_Availability[Availability_Date == foundDate && Installer == foundInstaller];
		if(availRecsP != null)
		{
			for each ap in availRecsP
			{
				aCapP = ap.Max_Capacity_Hours;
				if(aCapP != null)
				{
					teamCapP = aCapP;
				}
			}
		}
		otherConfirmedP = Service_Appointment_Form[Installer == foundInstaller && Confirmed_Schedule_Date == foundDate && Calendar_Entry_Created == true && ID != input.ID];
		otherHoursP = 0;
		if(otherConfirmedP != null)
		{
			for each op in otherConfirmedP
			{
				odP = op.Estimated_Duration;
				if(odP == null)
				{
					odP = 0;
				}
				oBufferedP = odP * (1 + (bufferPct / 100.0));
				if(op.Type_of_Delivery == "Full-Day Install")
				{
					oBufferedP = 8;
				}
				otherHoursP = otherHoursP + oBufferedP;
			}
		}
		projectedTeamTotalP = otherHoursP + bufferedDuration;
		if(projectedTeamTotalP <= teamCapP)
		{
			rec.Confirmed_Schedule_Date = foundDate;
			rec.Confirmed_Time_Slot = computedTimeSlot; // real per-job offset, matches Suggested_Time_Slot above

			fNameEvP = "";
			lNameEvP = "";
			if(rec.Customer_Name != null)
			{
				fNameEvP = rec.Customer_Name.first_name;
				lNameEvP = rec.Customer_Name.last_name;
			}
			if(fNameEvP == null){ fNameEvP = ""; }
			if(lNameEvP == null){ lNameEvP = ""; }
			if(fNameEvP != "")
			{
				custNameEvP = fNameEvP + " " + lNameEvP;
			}
			else
			{
				custNameEvP = lNameEvP;
			}
			typeEvP = rec.Type_of_Delivery;
			if(typeEvP == null || typeEvP == ""){ typeEvP = "—"; }
			locationEvP = rec.Customer_Address;
			if(rec.City != null && rec.City != "")
			{
				locationEvP = locationEvP + ", " + rec.City;
			}
			rec.Calendar_Event_Summary = "Title: " + rec.Sales_Order + " - " + custNameEvP + " | Date: " + foundDate + " | Time: " + computedTimeSlot + " (" + bufferedDuration + " hrs) | Team: " + foundInstaller + " / " + foundDriver + " | Fleet: " + fleetDisplay + " | Type: " + typeEvP + " | Location: " + locationEvP + " | Notes: Auto-confirmed (Priority — Reschedule)";
			rec.Calendar_Entry_Created = true;
			rec.Appointment_Status = "Scheduled";
		}
		// else: real capacity conflict at the exact moment of auto-confirm (another
		// record grabbed this same team/date in between) — leave Suggested_* as
		// already written above and DON'T flag a 2nd Exception here; the record just
		// falls back to behaving like any other non-priority suggestion, still
		// showing the Priority badge, until the officer manually confirms it via
		// the normal DeliveryQueue flow (same UI path already proven working).
	}
}

--- Action 2 (script block 2 of 3) — Officer Approve/Override handling (B.8) + Section D (Calendar Auto-Write) ---

if(input.Confirmed_Schedule_Date != null && input.Calendar_Entry_Created != true)
{
	rec2 = Service_Appointment_Form[ID == input.ID];

	// ADDED 2026-09-14 — see Action 1's own matching Pick Up comment for the full
	// rationale. No team/vehicle involved, so none of D.3's capacity-conflict logic
	// below applies — whatever date/time the dispatcher (or the client themselves)
	// set is simply confirmed outright, no override paperwork needed either (there
	// was never a system Suggested_* value to override in the first place).
	if(input.Type_of_Delivery == "Pick Up")
	{
		fNameEvPU = "";
		lNameEvPU = "";
		if(rec2.Customer_Name != null)
		{
			fNameEvPU = rec2.Customer_Name.first_name;
			lNameEvPU = rec2.Customer_Name.last_name;
		}
		if(fNameEvPU == null){ fNameEvPU = ""; }
		if(lNameEvPU == null){ lNameEvPU = ""; }
		custNameEvPU = (fNameEvPU + " " + lNameEvPU).trim();
		timeSlotStrPU = "";
		if(rec2.Confirmed_Time_Slot != null){ timeSlotStrPU = rec2.Confirmed_Time_Slot.toString(); }
		rec2.Fleet_Assignment = "Customer Pickup";
		rec2.Calendar_Event_Summary = "Title: " + rec2.Sales_Order + " - " + custNameEvPU + " | Date: " + rec2.Confirmed_Schedule_Date + " | Time: " + timeSlotStrPU + " | Type: Pick Up | Notes: Customer/dispatcher-scheduled pickup, no delivery team assigned";
		rec2.Calendar_Entry_Created = true;
		rec2.Appointment_Status = "Scheduled";
		return;
	}

	// ADDED 2026-09-16 — mirrors the Pick Up branch just above: once the
	// dispatcher already decided Fleet_Decision="3rd Party" (Action 1 never ran
	// for this record, see its own matching comment), there is no internal team
	// to conflict-check against, so a dispatcher-set Confirmed_Schedule_Date is
	// simply confirmed outright — no capacity check, no override paperwork
	// (there was never a system suggestion to override in the first place).
	// Fleet_Assignment is whatever courier the dispatcher already picked via the
	// widget's own Override Fleet control, sent in this same save.
	if(input.Fleet_Decision == "3rd Party")
	{
		fNameEv3P = "";
		lNameEv3P = "";
		if(rec2.Customer_Name != null)
		{
			fNameEv3P = rec2.Customer_Name.first_name;
			lNameEv3P = rec2.Customer_Name.last_name;
		}
		if(fNameEv3P == null){ fNameEv3P = ""; }
		if(lNameEv3P == null){ lNameEv3P = ""; }
		custNameEv3P = (fNameEv3P + " " + lNameEv3P).trim();
		timeSlotStr3P = "";
		if(rec2.Confirmed_Time_Slot != null){ timeSlotStr3P = rec2.Confirmed_Time_Slot.toString(); }
		fleetLabel3P = rec2.Fleet_Assignment;
		if(fleetLabel3P == null || fleetLabel3P == ""){ fleetLabel3P = "3rd Party"; }
		rec2.Calendar_Event_Summary = "Title: " + rec2.Sales_Order + " - " + custNameEv3P + " | Date: " + rec2.Confirmed_Schedule_Date + " | Time: " + timeSlotStr3P + " | Fleet: " + fleetLabel3P + " | Notes: 3rd-party courier (approved before scheduling), no internal team assigned";
		rec2.Calendar_Entry_Created = true;
		rec2.Appointment_Status = "Scheduled";
		return;
	}

	isOverride = (input.Suggested_Schedule_Date == null) || (input.Confirmed_Schedule_Date != input.Suggested_Schedule_Date) || (input.Confirmed_Time_Slot != input.Suggested_Time_Slot);
	if(isOverride)
	{
		rec2.Override_Applied = true;
		rec2.Override_Timestamp = zoho.currenttime;
		// Override_By / Override_Reason are required by the Validations workflow
		// below whenever this same mismatch is detected — already filled by the
		// time this action runs, or the save would have been blocked.
	}

	// D.3 Rule 1 (No Overlap), reinterpreted per this build's cumulative-hours model —
	// see file NOTES. No literal clock-time slot tracking exists (Suggested/Confirmed_
	// Time_Slot are nominal placeholders, not real distinct times), so "overlap" here
	// means the team's TOTAL confirmed hours for Confirmed_Schedule_Date, including
	// this order, would exceed Daily_Team_Availability.Max_Capacity_Hours.
	teamCap = 8;
	availRecs = Daily_Team_Availability[Availability_Date == input.Confirmed_Schedule_Date && Installer == input.Installer];
	if(availRecs != null)
	{
		for each a in availRecs
		{
			aCap = a.Max_Capacity_Hours;
			if(aCap != null)
			{
				teamCap = aCap;
			}
		}
	}

	bufferPctD = 15;
	pBufD = Policy_Settings[Policy_Key == "traffic_buffer_percent"];
	if(pBufD != null && pBufD.Value != null && pBufD.Value != "")
	{
		bufferPctD = pBufD.Value.toLong();
	}
	myDuration = input.Estimated_Duration;
	if(myDuration == null || myDuration == 0)
	{
		myDuration = 2;
	}
	myBuffered = myDuration * (1 + (bufferPctD / 100.0));
	if(input.Type_of_Delivery == "Full-Day Install")
	{
		myBuffered = 8;
	}

	otherConfirmed = Service_Appointment_Form[Installer == input.Installer && Confirmed_Schedule_Date == input.Confirmed_Schedule_Date && Calendar_Entry_Created == true && ID != input.ID];
	otherHours = 0;
	if(otherConfirmed != null)
	{
		for each o in otherConfirmed
		{
			od = o.Estimated_Duration;
			if(od == null)
			{
				od = 0;
			}
			oBuffered = od * (1 + (bufferPctD / 100.0));
			if(o.Type_of_Delivery == "Full-Day Install")
			{
				oBuffered = 8;
			}
			otherHours = otherHours + oBuffered;
		}
	}

	projectedTeamTotal = otherHours + myBuffered;
	capacityExceeded = (projectedTeamTotal > teamCap);

	// ---- NEW 2026-09-10, per user ("pinapasingit na sched... hindi na magawa ng
	// staff kasi naka fixed na yung sched", ASAP client on-the-spot scenario) —
	// a capacity-exceeding save used to hard-block UNCONDITIONALLY here, even when
	// the officer had already supplied Override_By/Override_Reason (isOverride==
	// true, mandatory via SA_Scheduling_Override_Validate whenever Confirmed
	// differs from Suggested) — meaning there was NO way for an officer to force
	// an urgent job onto an already-full team/day, no matter how deliberate. Now
	// only hard-blocks when isOverride==false (a genuine unintentional conflict,
	// e.g. two officers racing for the same slot) — an authorized override is
	// allowed through to the normal confirm path below instead of being silently
	// rejected while the widget's own save call still reports success. ----
	if(capacityExceeded && !isOverride)
	{
		rec2.Exception_Status = "Flagged";
		rec2.Exception_Reason = "Calendar Conflict";
		custNameExc4 = "";
		if(rec2.Customer_Name != null)
		{
			custNameExc4 = rec2.Customer_Name.first_name + " " + rec2.Customer_Name.last_name;
		}
		insert into DMS_Exception_Queue
		[
			Sales_Order_Reference = rec2.ID
			Customer_Name = custNameExc4
			Exception_Stage = "Calendar"
			Exception_Reason = "Calendar Conflict"
			Severity = "High"
			Raised_By = "System"
			Date_Raised = zoho.currenttime
			Status = "Open"
			Added_User = zoho.loginuser
		];
		// D.7: no silent failure — Calendar_Entry_Created/Appointment_Status stay
		// untouched (never flip to Scheduled), Exception_Status surfaces the block.
		return;
	}
	// else: either within capacity, OR capacityExceeded but the officer explicitly
	// overrode it (Override_By/Override_Reason already on record) — fall through
	// and confirm below. See notesEv/capacityExceeded tag further down and the
	// stale-Exception cleanup right before Calendar_Entry_Created is set.

	// D.2 — Calendar Event Structure, internal snapshot only (no external calendar API
	// — see NOTES). A future widget renders this as the visual calendar board.
	// FIXED 2026-07-28, real bug found live ("Title: SO-16280 - null (TEST
	// ORDER)..." / "Type: null") — Deluge string-concatenates a blank/null
	// field as the literal text "null", not empty string. Hit because a
	// widget-dispatched record (UI/FF Widget/OrderAggregation's own new
	// Dispatch flow) legitimately leaves Customer_Name.first_name blank
	// (that widget has no split-name source) and Type_of_Delivery blank
	// (source DELIVERY_TYPE didn't match the DMS's own picklist). Both
	// fields are now built null-safe before use, same "check for null,
	// substitute empty string" idiom already used elsewhere in this file
	// (see locationEv's own City-append guard right below, already correct).
	fNameEv = "";
	lNameEv = "";
	if(rec2.Customer_Name != null)
	{
		fNameEv = rec2.Customer_Name.first_name;
		lNameEv = rec2.Customer_Name.last_name;
	}
	if(fNameEv == null){ fNameEv = ""; }
	if(lNameEv == null){ lNameEv = ""; }
	if(fNameEv != "")
	{
		custNameEv = fNameEv + " " + lNameEv;
	}
	else
	{
		custNameEv = lNameEv;
	}
	typeEv = rec2.Type_of_Delivery;
	if(typeEv == null || typeEv == ""){ typeEv = "—"; }
	locationEv = rec2.Customer_Address;
	if(rec2.City != null && rec2.City != "")
	{
		locationEv = locationEv + ", " + rec2.City;
	}
	notesEv = "";
	if(isOverride)
	{
		notesEv = "Override: " + rec2.Override_Reason;
	}
	// NEW 2026-09-10 — see capacityExceeded/isOverride note above: tag an
	// over-capacity ASAP override visibly in the calendar summary instead of
	// leaving no trace that this booking pushed the team past its normal cap.
	if(capacityExceeded)
	{
		if(notesEv != "")
		{
			notesEv = notesEv + " | ";
		}
		notesEv = notesEv + "⚠ ASAP — Exceeds Daily Capacity (" + projectedTeamTotal + " / " + teamCap + " hrs)";
	}
	timeSlotStr = rec2.Confirmed_Time_Slot.toString();
	rec2.Calendar_Event_Summary = "Title: " + rec2.Sales_Order + " - " + custNameEv + " | Date: " + rec2.Confirmed_Schedule_Date + " | Time: " + timeSlotStr + " (" + myBuffered + " hrs) | Team: " + rec2.Installer + " / " + rec2.Assigned_to_Driver + " | Fleet: " + rec2.Fleet_Assignment + " | Type: " + typeEv + " | Location: " + locationEv + " | Notes: " + notesEv;

	// NEW 2026-09-10 — clear a stale Flagged badge left over from an earlier
	// blocked attempt (e.g. this exact record was "Calendar Full"/"Calendar
	// Conflict" before) now that it has genuinely been confirmed/scheduled.
	// FIXED 2026-09-10, real live error found: "Variable Exception_Stage does
	// not exist in Service_Appointment_Form" — Exception_Stage is a field on
	// DMS_Exception_Queue (the separate exception-record form), NOT on
	// Service_Appointment_Form itself; this form only carries Exception_Status/
	// Exception_Reason. Rescoped to Exception_Reason instead, matching only the
	// specific reasons THIS engine itself can raise on this form (see the 3
	// Exception_Reason strings used elsewhere in this same file) — same intent
	// (never silently clear an unrelated Flagged exception from elsewhere in
	// the app) without referencing a field this form doesn't have.
	if(rec2.Exception_Status == "Flagged" && (rec2.Exception_Reason == "Calendar Conflict" || rec2.Exception_Reason == "Calendar Full" || rec2.Exception_Reason == "Slot Pushed — Overtime Declined"))
	{
		rec2.Exception_Status = "Resolved";
	}

	rec2.Calendar_Entry_Created = true;
	rec2.Appointment_Status = "Scheduled";
}

--- Action 3 (script block 3 of 3) — D.4 status sync marker on the event snapshot ---

if((input.Appointment_Status == "Completed" || input.Appointment_Status == "Failed") && input.Calendar_Entry_Created == true)
{
	statusTag = "[" + input.Appointment_Status + "]";
	if(input.Calendar_Event_Summary == null || !input.Calendar_Event_Summary.contains(statusTag))
	{
		rec3 = Service_Appointment_Form[ID == input.ID];
		baseSummary = rec3.Calendar_Event_Summary;
		if(baseSummary == null)
		{
			baseSummary = "";
		}
		rec3.Calendar_Event_Summary = baseSummary + " " + statusTag;
	}
}

--- Action 4 (script block 4 of 4) — Delivery Type converted to Pick Up AFTER a team was already assigned ---
// ADDED 2026-09-14, per user ("may mga delivery type na delivery and installation
// pero biglang ginagawang pick up ng client so paano ito?") — a client can change
// their mind AFTER a delivery/install order already has a team/vehicle assigned
// (Suggested or even already Confirmed). Neither Action 1 (guarded to only fire
// on a genuinely FRESH record, Suggested/Confirmed both still null) nor Action 2
// (only fires while NOT yet Confirmed) naturally reacts to a Type_of_Delivery edit
// on an already-scheduled record, so a converted order would otherwise sit
// indefinitely with a stale Installer/team still "holding" capacity for a delivery
// that no longer happens. This action runs unconditionally (own internal guard),
// catching the conversion regardless of what state the record was already in.
// Deliberately does NOT clear Confirmed_Schedule_Date/Confirmed_Time_Slot — if the
// client already agreed to a specific date, a Pick Up on that same date is usually
// still the intent; only the TEAM-specific fields (which no longer apply) are
// cleared. Clearing Installer is what actually releases the team's capacity — the
// D.3 capacity check elsewhere in this file re-sums on demand from live records
// each time, so a cleared Installer here simply stops counting against that team's
// day starting immediately, no separate bookkeeping needed.

if(input.Type_of_Delivery == "Pick Up" && input.Installer != null && input.Installer != "")
{
	rec4 = Service_Appointment_Form[ID == input.ID];
	rec4.Installer = "";
	rec4.Assigned_to_Driver = "";
	rec4.Suggested_Schedule_Date = null;
	rec4.Suggested_Time_Slot = "";
	rec4.Fleet_Assignment = "Customer Pickup";
	if(input.Confirmed_Schedule_Date != null)
	{
		fNameEvR = "";
		lNameEvR = "";
		if(rec4.Customer_Name != null)
		{
			fNameEvR = rec4.Customer_Name.first_name;
			lNameEvR = rec4.Customer_Name.last_name;
		}
		if(fNameEvR == null){ fNameEvR = ""; }
		if(lNameEvR == null){ lNameEvR = ""; }
		custNameEvR = (fNameEvR + " " + lNameEvR).trim();
		timeSlotStrR = "";
		if(input.Confirmed_Time_Slot != null)
		{
			timeSlotStrR = input.Confirmed_Time_Slot.toString();
		}
		rec4.Calendar_Event_Summary = "Title: " + rec4.Sales_Order + " - " + custNameEvR + " | Date: " + rec4.Confirmed_Schedule_Date + " | Time: " + timeSlotStrR + " | Type: Pick Up | Notes: Converted from delivery to Pick Up — original team released";
		rec4.Calendar_Entry_Created = true;
		rec4.Appointment_Status = "Scheduled";
	}
	else
	{
		rec4.Calendar_Entry_Created = false;
		rec4.Appointment_Status = "Queued";
	}
}

====================================================
WORKFLOW SETUP — Service_Appointment_Form
  Trigger: Created or Edited > Validations
  Workflow name: SA_Scheduling_Override_Validate — 1 action block:
====================================================

--- Action 1 ---

// ADDED 2026-09-14 — a Pick Up delivery never gets a Suggested_Schedule_Date at all
// (Action 1 returns early for this type, see its own comment), so the OLD
// mismatchDetected check below would ALWAYS read true the moment a dispatcher/client
// sets Confirmed_Schedule_Date directly — wrongly blocking every single Pick Up
// confirmation with "Override By is required," even though no system suggestion
// ever existed to override in the first place. Real, would-be-blocking bug, caught
// before this was pasted live.
if(input.Type_of_Delivery == "Pick Up")
{
	return;
}
// ADDED 2026-09-16 — same reasoning as the Pick Up guard just above: a
// Fleet_Decision="3rd Party" record also never gets a Suggested_Schedule_Date
// (Action 1 returns early for it too, see its own comment), so without this
// the mismatch check below would wrongly block every 3rd-party confirmation.
if(input.Fleet_Decision == "3rd Party")
{
	return;
}
mismatchDetected = (input.Confirmed_Schedule_Date != null) && ((input.Suggested_Schedule_Date == null) || (input.Confirmed_Schedule_Date != input.Suggested_Schedule_Date) || (input.Confirmed_Time_Slot != input.Suggested_Time_Slot));
if(mismatchDetected && input.Calendar_Entry_Created != true)
{
	if(input.Override_By == null || input.Override_By == "")
	{
		alert "Override By is required when confirming a schedule that differs from the system suggestion.";
		cancel submit;
	}
	if(input.Override_Reason == null || input.Override_Reason == "")
	{
		alert "Override Reason is required when confirming a schedule that differs from the system suggestion.";
		cancel submit;
	}
}

====================================================
REPORT ACTION ITEM — Re_Schedule
  On the Service Appointment report (whatever report this app already uses for
  Service_Appointment_Form's list view — the same one Report Action Items like
  Create_Estimates_Inq live on elsewhere in this app).
  Manual re-run — per the plan's B.1 2nd trigger ("Officer manually clicks
  Re-Schedule button"). Same core engine logic as Action 1 above, but WITHOUT the
  Suggested_Schedule_Date==null/Confirmed_Schedule_Date==null idempotency guard,
  since re-running on demand is the whole point. Duplicated rather than shared,
  since Deluge Action Items and workflow actions can't call each other directly —
  same convention as every other Action-Item-vs-workflow pair in this app.
====================================================

rec = Service_Appointment_Form[ID == input.ID];

// GUARD, added 2026-09-08, per user question ("magbabago ba ang na-approve na
// schedule?") — Re-Schedule on an already-Completed (or Failed) delivery makes
// no business sense (the job already happened) and would silently reset
// Appointment_Status back to "Queued" / Calendar_Entry_Created back to false
// further down in this same script, discarding real completion data. Refuse
// outright instead of letting the rest of this Action Item run.
// FIXED 2026-09-08, real live error found: "Error at line number: 9. 'ALERT'
// task can be used only in on load, on validate and on change actions" — a
// Report Action Item ("On click of action item") is NOT one of those contexts,
// confirming the risk this block's own earlier comment had flagged as
// UNTESTED. `alert` removed — `return;` alone is what actually provides the
// protection (Zoho gives no on-screen message here; the record's fields
// simply don't change, same silent-gate pattern already used elsewhere in
// this exact file, e.g. the Exception_Status=="Flagged" gate in Action 1).
if(input.Appointment_Status == "Completed" || input.Appointment_Status == "Failed")
{
	return;
}

// ADDED 2026-09-14 — same reasoning as Action 1's own Pick Up branch: no team/
// vehicle involved, so a team slot-search makes no sense here. Re-Schedule on a
// Pick Up record is a no-op — the dispatcher just edits Confirmed_Schedule_Date
// directly instead.
if(input.Type_of_Delivery == "Pick Up")
{
	return;
}

// REMOVED 2026-09-17 — same reasoning as dms_reschedule_custom_api.txt's
// matching removal (see that file's own comment): this Fleet_Decision gate
// doesn't match what's actually live (confirmed against the user's own
// live-paste reference — Action 1 currently has NO Fleet_Decision check at
// all). Removed so this Report Action Item copy stays consistent with the
// live automatic path.
if(input.Exception_Status == "Flagged")
{
	rec.Exception_Status = "Resolved";
	// Re-Schedule is an explicit officer action — treat it as clearing whatever
	// exception blocked scheduling before, consistent with E.5's "Revert to System"
	// concept from the plan (not yet a real Exception Queue record, see NOTES).
}

deliveryType = input.Type_of_Delivery;
if(deliveryType == "Multi-Day Install")
{
	rec.Exception_Status = "Flagged";
	rec.Exception_Reason = "Requires Manual Planning";
	return;
}
isFullDay = (deliveryType == "Full-Day Install");
fleetAssignment = "Own Fleet";

estDuration = input.Estimated_Duration;
if(estDuration == null || estDuration == 0)
{
	// FIXED 2026-09-11, same type-aware default as Action 1 above (Delivery
	// Only=2h/With Installation=4h/Full-Day Install=8h), instead of a flat 2h
	// guess — see Action 1's own comment for the full reasoning.
	estDuration = if(deliveryType == "With Installation", 4, if(deliveryType == "Full-Day Install", 8, 2));
	rec.Estimated_Duration = estDuration;
}
bufferPct = 15;
pBuf = Policy_Settings[Policy_Key == "traffic_buffer_percent"];
if(pBuf != null && pBuf.Value != null && pBuf.Value != "")
{
	bufferPct = pBuf.Value.toLong();
}
bufferedDuration = estDuration * (1 + (bufferPct / 100.0));
if(isFullDay)
{
	bufferedDuration = 8;
}

maxWindow = 14;
pWin = Policy_Settings[Policy_Key == "max_days_scheduling_window"];
if(pWin != null && pWin.Value != null && pWin.Value != "")
{
	maxWindow = pWin.Value.toLong();
}
workdayHours = 9;
pStartWD = Policy_Settings[Policy_Key == "workday_start_time"];
pEndWD = Policy_Settings[Policy_Key == "workday_end_time"];
if(pStartWD != null && pStartWD.Value != null && pStartWD.Value != "" && pEndWD != null && pEndWD.Value != null && pEndWD.Value != "")
{
	sParts = pStartWD.Value.toList(" ");
	eParts = pEndWD.Value.toList(" ");
	if(sParts.size() == 2 && eParts.size() == 2)
	{
		sHr = sParts.get(0).toList(":").get(0).toLong();
		eHr = eParts.get(0).toList(":").get(0).toLong();
		if(sParts.get(1).toUpperCase() == "PM" && sHr != 12){ sHr = sHr + 12; }
		if(eParts.get(1).toUpperCase() == "PM" && eHr != 12){ eHr = eHr + 12; }
		if(sParts.get(1).toUpperCase() == "AM" && sHr == 12){ sHr = 0; }
		if(eParts.get(1).toUpperCase() == "AM" && eHr == 12){ eHr = 0; }
		if(eHr > sHr)
		{
			workdayHours = eHr - sHr;
		}
	}
}

foundInstaller = null;
foundDriver = null;
foundDate = null;
foundUsed = 0;
foundVehicle = null;
dayCounter = 0;
searchDays = "".leftpad(maxWindow).toList(""); // FIX 2026-09-11: now includes TODAY as a candidate (was tomorrow-only, maxWindow-1 length)
for each  dayMarker in searchDays
{
	dayCounter = dayCounter + 1;
	if(foundInstaller == null)
	{
		candidateDate = zoho.currentdate.addDay(dayCounter - 1); // offset 0 = today, not tomorrow
		teams = Daily_Team_Availability[Availability_Date == candidateDate && Availability_Status != "Not Available"];
		bestInstaller = null;
		bestDriver = null;
		bestRemaining = -1;
		bestUsed = 0;
		bestVehicle = null;
		bestSoCount = 999999;
		if(teams != null)
		{
			for each  t in teams
			{
				tInstaller = t.Installer;
				tDriver = t.Driver;
				tVehicle = t.Vehicle;
				cap = t.Max_Capacity_Hours;
				if(cap == null)
				{
					cap = 0;
				}
				usedRecs = Service_Appointment_Form[Installer == tInstaller && Confirmed_Schedule_Date == candidateDate && Appointment_Status != "Failed"];
				used = 0;
				if(usedRecs != null)
				{
					for each  u in usedRecs
					{
						ud = u.Estimated_Duration;
						if(ud == null)
						{
							ud = 0;
						}
						used = used + (ud * (1 + (bufferPct / 100.0)));
					}
				}
				remaining = cap - used;

				// NEW 2026-09-15 — same SO-count capacity check as Action 1's own slot
				// search above (see that block's comment for the full rationale). Mirrored
				// here since Re_Schedule is a separate manually-maintained copy of the same
				// slot-search logic.
				soCountToday = 0;
				soRecsToday = Service_Appointment_Form[Installer == tInstaller && (Confirmed_Schedule_Date == candidateDate || Suggested_Schedule_Date == candidateDate) && Appointment_Status != "Failed"];
				if(soRecsToday != null)
				{
					for each  sr in soRecsToday
					{
						soCountToday = soCountToday + 1;
					}
				}
				maxSO = t.Max_SO_Capacity;
				soCapOk = true;
				if(maxSO != null && maxSO > 0 && soCountToday >= maxSO)
				{
					soCapOk = false;
				}

				// NEW 2026-09-15b -- tie-break: when 2+ teams have EQUAL remaining
				// hours (e.g. both fully idle), prefer whichever has FEWER already-
				// suggested/confirmed jobs today (soCountToday) instead of always
				// picking the first team in query order -- closes the residual
				// "same team keeps getting suggested" gap the same-day Max_SO_
				// Capacity fix didn't fully cover (that fix only blocks once a
				// team HITS its cap; ties before that point were still arbitrary).
				if(soCapOk && bufferedDuration <= remaining && (remaining > bestRemaining || (remaining == bestRemaining && soCountToday < bestSoCount)))
				{
					bestInstaller = tInstaller;
					bestDriver = tDriver;
					bestRemaining = remaining;
					bestUsed = used;
					bestVehicle = tVehicle;
					bestSoCount = soCountToday;
				}
			}
		}
		if(bestInstaller != null)
		{
			foundInstaller = bestInstaller;
			foundDriver = bestDriver;
			foundDate = candidateDate;
			foundUsed = bestUsed;
			foundVehicle = bestVehicle;
		}
	}
}

if(foundInstaller == null)
{
	rec.Exception_Status = "Flagged";
	rec.Exception_Reason = "Calendar Full";
	// FIXED 2026-09-16, per user ("baka may masasuggest siya pero wala naman
	// team availability") — Re_Schedule genuinely CAN re-run on a record that
	// already carries a suggestion from an earlier run, unlike Action 1 (guarded
	// to fire only once). Without this, a record that had a valid suggestion
	// before, then loses its team (Daily_Team_Availability row deleted, etc.) and
	// gets Re-Scheduled, still showed the OLD Suggested Date/Time/Installer in
	// DeliveryQueue as if it were current — clear them so "Calendar Full" means
	// what it says everywhere the record is displayed, not just in Exception_Reason.
	rec.Suggested_Schedule_Date = null;
	rec.Suggested_Time_Slot = null;
	rec.Installer = null;
	rec.Assigned_to_Driver = null;
	rec.Fleet_Assignment = null;
	return;
}

projectedTotal = foundUsed + bufferedDuration;
isOvertimeRisk = (projectedTotal > workdayHours) && (fleetAssignment == "Own Fleet");
if(isOvertimeRisk)
{
	rec.Exception_Status = "Flagged";
	rec.Exception_Reason = "Slot Pushed — Overtime Declined";
	// FIXED 2026-09-16 — same stale-suggestion clear as the Calendar Full block
	// just above, same reasoning.
	rec.Suggested_Schedule_Date = null;
	rec.Suggested_Time_Slot = null;
	rec.Installer = null;
	rec.Assigned_to_Driver = null;
	rec.Fleet_Assignment = null;
	return;
}

// FIX 2026-09-11, per user — same Daily_Team_Availability-based Start_Time1 read
// as the main SA_Scheduling_Engine block above (Policy Setting deliberately not
// used as a fallback anymore — see that block's own note for the full reason).
workdayStartStr = "8:00 AM";
teamStartRecs = Daily_Team_Availability[Availability_Date == foundDate && Installer == foundInstaller];
if(teamStartRecs != null)
{
	for each tsr in teamStartRecs
	{
		if(tsr.Start_Time1 != null)
		{
			tsrStr = tsr.Start_Time1.toString();
			if(tsrStr != null && tsrStr != "")
			{
				workdayStartStr = tsrStr;
			}
		}
	}
}

// ---- NEW 2026-09-08 — same sequential-chaining fix as the main SA_Scheduling_
// Engine block above (see its own "NEW 2026-09-08" note for the full rationale):
// offsets the suggestion by foundUsed instead of always using the flat
// workday_start_time, so a re-run on a team's day that already has other
// bookings starts right after those finish instead of a flat nominal time. ----
computedTimeSlot = workdayStartStr;
ctsParts = workdayStartStr.toList(" ");
if(ctsParts.size() == 2)
{
	ctsHM = ctsParts.get(0).toList(":");
	if(ctsHM.size() >= 2) // >=2 not ==2: a native TIME field's toString() can include seconds (3 parts)
	{
		ctsHr = ctsHM.get(0).toLong();
		ctsMin = ctsHM.get(1).toLong();
		ctsAmPm = ctsParts.get(1).toUpperCase();
		if(ctsAmPm == "PM" && ctsHr != 12){ ctsHr = ctsHr + 12; }
		if(ctsAmPm == "AM" && ctsHr == 12){ ctsHr = 0; }
		ctsTotalMin = (ctsHr * 60) + ctsMin + (foundUsed * 60).toLong();
		ctsHr24 = ctsTotalMin / 60;
		ctsMinRem = ctsTotalMin - (ctsHr24 * 60);
		ctsDispHr = ctsHr24;
		if(ctsHr24 == 0){ ctsDispHr = 12; }
		if(ctsHr24 > 12){ ctsDispHr = ctsHr24 - 12; }
		ctsDispAmPm = "AM";
		if(ctsHr24 >= 12){ ctsDispAmPm = "PM"; }
		ctsMinStr = ctsMinRem + "";
		if(ctsMinRem < 10){ ctsMinStr = "0" + ctsMinRem; }
		computedTimeSlot = ctsDispHr + ":" + ctsMinStr + " " + ctsDispAmPm;
	}
}

rec.Suggested_Schedule_Date = foundDate;
rec.Suggested_Time_Slot = computedTimeSlot;
/* CHANGED 2026-07-23 — same fix as the main scheduling block above, mirrored
   here since this is the Re_Schedule copy (fleetAssignment was always the
   hardcoded "Own Fleet" constant; now shows the actual assigned team's Vehicle
   from Daily_Team_Availability when set). */
if(foundVehicle != null && foundVehicle != "")
{
	rec.Fleet_Assignment = foundVehicle;
}
else
{
	rec.Fleet_Assignment = fleetAssignment;
}
rec.Installation_Required = (deliveryType == "With Installation" || deliveryType == "Full-Day Install");
rec.Calendar_Entry_Created = false;
rec.Appointment_Status = "Queued";
rec.Installer = foundInstaller;
rec.Assigned_to_Driver = foundDriver;
fleetDisplayRR = fleetAssignment;
if(foundVehicle != null && foundVehicle != "")
{
	fleetDisplayRR = foundVehicle;
}
rec.Original_System_Suggestion = "System suggested (re-run): " + foundInstaller + " / " + foundDriver + " on " + foundDate + " (" + fleetDisplayRR + ")";

// ADDED 2026-09-11, per user ("ayusin natin lahat ng dapat ifix") — mirrors Action
// 1's own "if(input.Priority == true)" auto-confirm block (see its comment above
// for the full reasoning), previously flagged in this file's own NOTES section as
// a known, un-mirrored gap: a Priority record re-scheduled via this manual
// Re-Schedule button still required a manual officer Confirm, unlike the normal
// Site-Confirmation-triggered path. Same capacity re-check + inline calendar write,
// same silent-fallback-to-Suggested-only on a genuine conflict.
if(input.Priority == true)
{
	teamCapP = 8;
	availRecsP = Daily_Team_Availability[Availability_Date == foundDate && Installer == foundInstaller];
	if(availRecsP != null)
	{
		for each ap in availRecsP
		{
			aCapP = ap.Max_Capacity_Hours;
			if(aCapP != null)
			{
				teamCapP = aCapP;
			}
		}
	}
	otherConfirmedP = Service_Appointment_Form[Installer == foundInstaller && Confirmed_Schedule_Date == foundDate && Calendar_Entry_Created == true && ID != input.ID];
	otherHoursP = 0;
	if(otherConfirmedP != null)
	{
		for each op in otherConfirmedP
		{
			odP = op.Estimated_Duration;
			if(odP == null)
			{
				odP = 0;
			}
			oBufferedP = odP * (1 + (bufferPct / 100.0));
			if(op.Type_of_Delivery == "Full-Day Install")
			{
				oBufferedP = 8;
			}
			otherHoursP = otherHoursP + oBufferedP;
		}
	}
	projectedTeamTotalP = otherHoursP + bufferedDuration;
	if(projectedTeamTotalP <= teamCapP)
	{
		rec.Confirmed_Schedule_Date = foundDate;
		rec.Confirmed_Time_Slot = computedTimeSlot;

		fNameEvP = "";
		lNameEvP = "";
		if(rec.Customer_Name != null)
		{
			fNameEvP = rec.Customer_Name.first_name;
			lNameEvP = rec.Customer_Name.last_name;
		}
		if(fNameEvP == null){ fNameEvP = ""; }
		if(lNameEvP == null){ lNameEvP = ""; }
		if(fNameEvP != "")
		{
			custNameEvP = fNameEvP + " " + lNameEvP;
		}
		else
		{
			custNameEvP = lNameEvP;
		}
		typeEvP = rec.Type_of_Delivery;
		if(typeEvP == null || typeEvP == ""){ typeEvP = "—"; }
		locationEvP = rec.Customer_Address;
		if(rec.City != null && rec.City != "")
		{
			locationEvP = locationEvP + ", " + rec.City;
		}
		rec.Calendar_Event_Summary = "Title: " + rec.Sales_Order + " - " + custNameEvP + " | Date: " + foundDate + " | Time: " + computedTimeSlot + " (" + bufferedDuration + " hrs) | Team: " + foundInstaller + " / " + foundDriver + " | Fleet: " + fleetDisplayRR + " | Type: " + typeEvP + " | Location: " + locationEvP + " | Notes: Auto-confirmed (Priority — Re-Schedule re-run)";
		rec.Calendar_Entry_Created = true;
		rec.Appointment_Status = "Scheduled";
	}
	// else: real capacity conflict at the exact moment of auto-confirm — leave
	// Suggested_* as already written above, same fallback behavior as Action 1.
}

====================================================
NOTES:
- Engine only ever fires automatically once (Suggested_Schedule_Date==null AND
  Confirmed_Schedule_Date==null guard on Action 1) — the Re_Schedule Action Item is
  the only way to make it run again on a record that already has a suggestion.
- Suggested_Time_Slot is a real Time-type field written via a plain string
  ("8:00 AM") — Deluge/Creator often accepts a formatted string for Date/Time field
  writes and auto-parses it, but this specific case is UNTESTED — if it errors,
  the fix is likely a proper Time-type construction instead of a raw string, needs a
  live test to confirm either way.
- **NEW 2026-09-08 — sequential time chaining (Phase 1 of a larger DMS scheduling
  flexibility push, per user).** computedTimeSlot (Suggested_Time_Slot/Confirmed_
  Time_Slot on the Priority auto-confirm path) is now workday_start_time offset by
  foundUsed hours instead of always the flat workday_start_time — closes a real gap
  where a team's 2nd/3rd stop on the same day showed a suggested time with an
  unaccounted-for idle gap before it, instead of starting right after the prior stop's
  estimated finish. Same string SHAPE preserved ("H:MM AM/PM", no leading zero on
  hour) so whatever Time-field-write behavior was already presumed working is
  unaffected — only the computed VALUES differ. Applied identically to Action 1's
  main slot-search, the Re_Schedule Report Action Item copy below, and
  dms_reschedule_custom_api.txt's reScheduleDelivery Custom Function — all 3 copies
  use byte-identical minute-math (ctsParts/ctsHM/ctsHr/ctsMin/ctsAmPm/ctsTotalMin/
  ctsHr24/ctsMinRem/ctsDispHr/ctsDispAmPm/ctsMinStr/computedTimeSlot variable names).
  UNTESTED — needs: (1) two Site-Confirmed records for the SAME Installer/candidate
  date, submitted so the 2nd one's engine run happens after the 1st's Suggested_
  Time_Slot is already written (so the 1st counts toward the 2nd's foundUsed) —
  confirm the 2nd record's Suggested_Time_Slot equals workday_start_time + the 1st
  record's own bufferedDuration (e.g. a 2-hr job at 15% buffer = 2.3 hrs ≈ 2 hrs 18
  min later), not the old flat workday_start_time; (2) confirm a single (first-of-
  the-day) record still gets exactly workday_start_time unchanged (foundUsed==0 for
  an empty day, zero regression risk case); (3) confirm the Priority auto-confirm
  path's Confirmed_Time_Slot and Calendar_Event_Summary's "Time:" both show the same
  computed value, not the old flat workday_start_time.
- **NEW 2026-09-08, real gap found while live-testing the fix above**: all 4
  `insert into DMS_Exception_Queue[...]` blocks in this file (3 in Action 1, 1 in
  Action 2) were missing `Added_User = zoho.loginuser` — confirmed via project-wide
  grep as a real, widely-used convention in this app (107 other files set this field
  on their own `insert into` statements, e.g. `checker_checklist_qc_sync.txt`'s
  `Exception_Control1`/`Crate_Checklist` inserts). Not something this round's
  sequential-chaining edit introduced — a pre-existing gap specific to this file's own
  4 DMS_Exception_Queue inserts, surfaced when the user pasted Action 1 live. Added to
  all 4 blocks. **Still flagged, not separately verified**: whether `Added_User` is
  actually MANDATORY on the `DMS_Exception_Queue` form (would explain a real save
  error) or just this app's own tracking convention (cosmetic, insert would have
  succeeded either way) — root cause of whatever prompted this discovery wasn't
  confirmed with an exact Zoho error message.
- **NEW 2026-09-10 — ASAP override now allowed past team capacity (Action 2).** Per
  user report ("pinapasingit na sched... hindi na magawa ng staff kasi naka fixed na
  yung sched", ASAP/on-the-spot client scenario): the D.3 capacity check in Action 2
  used to hard-block EVERY Confirmed_Schedule_Date save that would exceed a team's
  Daily_Team_Availability.Max_Capacity_Hours, even when the officer had already
  supplied Override_By/Override_Reason — there was no way to force an urgent job
  onto an already-full team/day. Now only hard-blocks when isOverride==false (a
  genuine unintentional conflict); an authorized override (isOverride==true) falls
  through to the normal confirm path, gets a visible "⚠ ASAP — Exceeds Daily
  Capacity (X / Y hrs)" tag appended to Calendar_Event_Summary's Notes, and clears
  a stale Exception_Status="Flagged" left from an earlier blocked attempt (scoped to
  Exception_Stage=="Scheduling"/"Calendar" only). No new fields — reuses existing
  Override_By/Override_Reason/Exception_Status/Exception_Stage. Companion fix in the
  SAME session: `DeliveryQueue` widget's `applyStepGating()` used to disable the
  Confirmed Date/Time inputs entirely whenever Suggested_Schedule_Date was null
  (the "Calendar Full" case — zero team/day found in the whole search window) —
  officer couldn't even type an override in that case. Now unlocks once
  Site_Confirmation_Status=="Confirmed", regardless of whether a suggestion exists.
  UNTESTED — needs: (1) re-paste this workflow (all 3 actions); (2) re-upload
  DeliveryQueue.zip; (3) a team/date already at full capacity — confirm Confirmed
  Date/Time are editable even with no Suggested_Schedule_Date, confirm a save WITH
  Override By/Reason now actually schedules (Calendar_Entry_Created=true,
  Exception_Status clears, capacity tag shows), confirm a plain non-override
  capacity conflict still hard-blocks as before (zero regression).
- Real, pre-existing gap NOT addressed by the above (flagged, not fixed this round):
  there is still no field capturing an appointment's ACTUAL completion time —
  `Widget\DMS\OngoingService`'s own Field_Work flow explicitly does NOT push a
  status/time back onto Service_Appointment_Form.Appointment_Status (documented in
  that widget's own file header as a deliberate scope-out, "a real future integration
  point, not built"). This means computedTimeSlot above is still ESTIMATE-chained
  (foundUsed from Estimated_Duration + buffer), not ACTUAL-completion-chained — if a
  job runs long or short in real life, later same-day jobs' suggested times don't
  auto-correct. Closing that requires: (a) a real Field_Work → Service_Appointment_
  Form completion sync (new scope, not yet decided/built), and (b) a same-day re-slot
  trigger on that sync event that recomputes remaining same-team/day jobs' Suggested/
  Confirmed times off the real finish time instead of the estimate. Not started.
- "Officer Approves" in the plan's B.8 means: officer manually copies
  Suggested_Schedule_Date/Suggested_Time_Slot into Confirmed_Schedule_Date/
  Confirmed_Time_Slot on the native form (no widget/UI built for this yet, matches
  the deferred-UI decision made earlier in this build) — Action 2 detects whether
  what was typed matches the suggestion (approve) or differs (override) and reacts
  accordingly, rather than the officer clicking a distinct "Approve" button.
- CONFIRMED WORKING live 2026-07-17 (Section B core, before Section D was added): all 4
  cases above tested on TEST-SO-DMS-001/004 — suggestion write, approve-matching-date,
  override-blocked (needed a real `alert; cancel submit;` fix, see reference-deluge-
  quirks memory), override-success. See CLAUDE.md's own Section B entry for the full
  writeup.
- **NEW 2026-08-07 — Priority auto-confirm.** Added ONLY to Action 1 (the automatic
  SA_Scheduling_Engine trigger) — a Priority==true record now skips the manual
  Suggested→Confirmed copy step entirely and self-schedules the moment Site
  Confirmation completes. Deliberately NOT yet mirrored into the Re_Schedule Report
  Action Item or dms_reschedule_custom_api.txt's reScheduleDelivery Custom Function
  (both are separate manually-maintained copies of this same slot-search — see the
  Fleet_Assignment fix in CLAUDE.md for the established "needs updating in 3 places"
  risk this file already carries). Practical effect: if an officer manually clicks
  Re-Schedule on a Priority record, it currently goes back to requiring manual
  Confirm like any other record — only the FIRST automatic run (right after Site
  Confirmation) auto-confirms. Flag this gap to the user if it turns out officers
  use Re-Schedule on Priority records often; porting the same `if(input.Priority==
  true){...}` block into those 2 copies would close it.
- UNTESTED — needs, in order: (1) Priority field live (see dms_field_work_reschedule.
  txt); (2) this file re-pasted; (3) full reschedule→priority→auto-schedule chain
  tested live — confirm a Priority record's Confirmed_Schedule_Date/Calendar_Entry_
  Created/Appointment_Status all populate in the SAME save that Site_Confirmation_
  Status flips to Confirmed, with zero manual Confirm step, AND confirm a normal
  (non-priority) record's behavior is completely unchanged (still requires manual
  Confirm as before).

SECTION D field-add snippet (Application IDE, paste inside Scheduling_Section, same
row=11 as the other Scheduling fields — pure additive, same safe pattern as every other
Section A/B field add this build):

Calendar_Event_Summary
(
	type = textarea
	displayname = "Calendar Event Summary"
	height = 100px
	row = 11
	column = 1
	width = medium
)

SECTION D — UNTESTED, needs: (1) the field above added live; (2) re-paste Action 2/3
of SA_Scheduling_Engine (both changed); (3) approve a sandbox record per the Section B
checklist above, confirm Calendar_Event_Summary populates with the full Title/Date/
Time/Team/Fleet/Type/Location/Notes string; (4) create a SECOND sandbox record for the
SAME Installer + SAME Confirmed_Schedule_Date whose combined hours would exceed that
team's Max_Capacity_Hours, confirm it gets Exception_Status="Flagged"/Exception_Reason=
"Calendar Conflict" instead of Calendar_Entry_Created flipping true; (5) manually set
Appointment_Status="Completed" on an already-Scheduled record, confirm
Calendar_Event_Summary gets a trailing " [Completed]" tag appended exactly once (re-
saving again shouldn't duplicate the tag).
====================================================

````
