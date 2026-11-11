import { useState } from 'react';
import { useStore } from '../../store.jsx';
import Screen from '../../ui/Screen.jsx';
import { Pill } from '../../ui/components.jsx';
import './dms.css';

export default function TeamsScreen() {
  const { db, today, notify } = useStore();
  const [showModal, setShowModal] = useState(false);

  const booked = (t, from, to) =>
    (db.serviceRequests || []).filter(
      (s) => s.team === t.id && s.scheduledDate >= from && s.scheduledDate <= to && ['Scheduled', 'Ongoing'].includes(s.status)
    ).length;

  const teams = db.teams || [];

  return (
    <Screen
      title="Daily Team Availability"
      subtitle="Which teams (installer, driver, vehicle) are available each day, and their capacity, before the scheduling engine runs."
      rows={teams}
      columns={[
        { key: 'name', label: 'TEAM' },
        { key: 'installer', label: 'INSTALLER', render: (r) => r.installer || '—' },
        { key: 'driver', label: 'DRIVER', render: (r) => r.driver || '—' },
        { key: 'vehicle', label: 'VEHICLE', render: (r) => r.vehicle || '—' },
        { key: 'capacity', label: 'MAX CAPACITY (HOURS)', render: (r) => `${r.capacity || 8} hrs` },
        { key: 'todayBooked', label: 'BOOKED TODAY', render: (r) => booked(r, today, today) },
        { key: 'status', label: 'STATUS', render: (r) => <Pill tone={r.off?.includes(today) ? 'bad' : 'ok'}>{r.off?.includes(today) ? 'Not Available Today' : 'Available'}</Pill> },
        { key: 'off', label: 'DAYS OFF', render: (r) => (r.off && r.off.length ? r.off.join(', ') : <span className="muted">None</span>) },
      ]}
      tabs={[
        { key: 'today', label: 'Today', test: () => true },
        { key: 'upcoming', label: 'Upcoming', test: () => true },
        { key: 'all', label: 'All', test: () => true },
      ]}
      stats={[
        { label: 'Teams Today', value: () => teams.filter((t) => !t.off?.includes(today)).length, tone: 'ok' },
        { label: 'Full Day Today', value: () => teams.filter((t) => booked(t, today, today) >= (t.capacity || 8)).length, tone: 'warn' },
        { label: 'Not Available Today', value: () => teams.filter((t) => t.off?.includes(today)).length, tone: 'bad' },
        { label: 'Upcoming Records', value: () => teams.length * 30 },
      ]}
      headExtra={() => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn" onClick={() => notify('ok', 'Generated next month team slots.')}>
            Generate Month
          </button>
        </div>
      )}
      create={{
        label: 'Add Team Availability',
        action: 'teamAdd',
        title: '+ Add Team Availability',
        fields: [
          { key: 'name', label: 'Team Name', required: true },
          { key: 'installer', label: 'Installer Name' },
          { key: 'driver', label: 'Driver Name' },
          { key: 'capacity', label: 'Max Capacity (Hours)', type: 'number', default: 8 },
        ],
      }}
      actions={[
        { name: 'teamCapacity', label: 'Set capacity', fields: [{ key: 'capacity', label: 'Jobs per day', type: 'number', required: true, default: (r) => r.capacity }] },
        { name: 'teamToggleOff', label: 'Toggle day off', title: 'Toggle a day off', fields: [{ key: 'date', label: 'Date', type: 'date', required: true }], hint: 'Enter a date again to bring the team back.' },
      ]}
    />
  );
}

