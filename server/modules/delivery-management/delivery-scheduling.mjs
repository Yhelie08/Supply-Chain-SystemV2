// Delivery_Scheduling workflows, ported from zoho-export/parsed/workflows/form/Delivery_Scheduling/*.dg.
// Only the events that run on API writes are here (on validate = before, on success = after).
//
// Ported here: DS_Validate_Team_Capacity1.
// NOT ported yet: ISCHED_Instant_Forecast (forecast engine).
import { register } from '../../workflows/index.mjs';
import { blank } from '../../workflows/deluge.mjs';

// DS_Validate_Team_Capacity: for each installer picked for a date, look for a Daily_Team_Availability record that is not
// "Not Available". Zoho only shows an `alert` ("Paalala: ...") and never cancels the save, which means a write through
// the API is never refused or changed by this script. It is ported as a warning in the server log. To be confirmed on
// Zoho Development that API writes really ignore the alert.
export const teamsWithoutAvailability = async (rec, store) => {
  if (blank(rec.Date_field) || blank(rec.Installer)) return [];
  const missing = [];
  for (const installer of [].concat(rec.Installer)) {
    const free = await store.find('Daily_Team_Availability', (r) => r.Availability_Date === rec.Date_field && r.Installer === installer && r.Availability_Status !== 'Not Available');
    if (free.length === 0) missing.push(installer);
  }
  return missing;
};

async function warnAboutCapacity({ input, previous, store }) {
  const missing = await teamsWithoutAvailability({ ...(previous || {}), ...input }, store);
  if (missing.length) console.warn(`[Delivery_Scheduling] no Daily Team Availability record for ${missing.join(', ')} on ${input.Date_field ?? previous?.Date_field}; the save goes ahead, as in Zoho.`);
}

register('Delivery_Scheduling', { beforeAdd: warnAboutCapacity, beforeUpdate: warnAboutCapacity });
