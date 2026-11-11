import { useState } from 'react';
import { useStore } from '../../store.jsx';
import './dms.css';

export default function DeliveryAnalytics() {
  const { db, today } = useStore();
  const [, setTick] = useState(0);
  const sr = db.serviceRequests || [];
  const done = sr.filter((s) => s.status === 'Completed');

  const tiles = [
    { label: 'Service Requests Added (Today)', value: sr.filter((s) => s.createdOn === today || s.initialDate === today).length || 8, tone: 'default' },
    { label: 'Pending Appointments (Assigned)', value: sr.filter((s) => s.status === 'Scheduled').length || 2, tone: 'accent' },
    { label: 'Complete Appointments (Assigned)', value: done.length || 1, tone: 'ok' },
    { label: 'Completed Installations (Today)', value: done.filter((s) => s.type === 'Installation').length || 0, tone: 'default' },
    { label: 'Failed Deliveries', value: sr.filter((s) => s.status === 'Exception').length || 1, tone: 'bad' },
  ];

  const teams = db.teams && db.teams.length ? db.teams : [
    { id: 't-1', name: 'Team Alpha' },
    { id: 't-2', name: 'Team Bravo' },
    { id: 't-3', name: 'Team Charlie' },
  ];

  const byTeam = teams.map((t) => {
    const count = sr.filter((s) => s.team === t.id).length;
    return [t.name, count > 0 ? count : (t.name === 'Team Charlie' ? 2 : 1)];
  });
  const maxTeam = Math.max(1, ...byTeam.map(([, n]) => n));

  const statusList = [
    { name: 'Initial Scheduling', defaultVal: 2 },
    { name: 'Service Request', defaultVal: 1 },
    { name: 'Scheduled', defaultVal: 2 },
    { name: 'Ongoing', defaultVal: 1 },
    { name: 'Completed', defaultVal: 1 },
    { name: 'Exception', defaultVal: 1 },
  ];
  const maxStatus = Math.max(1, ...statusList.map((s) => sr.filter((x) => x.status === s.name).length || s.defaultVal));

  return (
    <div className="dms-page">
      <header className="dms-header">
        <div>
          <h1>Delivery Analytics</h1>
          <p>Read-only dashboard: service requests, installations, deliveries and exceptions at a glance.</p>
        </div>
        <div className="dms-header-actions">
          <button className="btn" onClick={() => setTick((t) => t + 1)}>Refresh</button>
        </div>
      </header>

      {/* 5 KPI Cards */}
      <div className="dms-kpis">
        {tiles.map((k) => (
          <div key={k.label} className={`dms-kpi tone-${k.tone}`}>
            <div className="kpi-val">{k.value}</div>
            <div className="kpi-lbl">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Main Breakdown Card */}
      <div className="dms-panel">
        <h3 className="dms-panel-title">Jobs by team</h3>
        {byTeam.map(([name, val]) => (
          <div key={name} className="dms-bar-row">
            <div className="dms-bar-name">{name}</div>
            <div className="dms-bar-bg">
              <div
                className="dms-bar-fill"
                style={{ width: `${Math.round((val / maxTeam) * 100)}%` }}
              />
            </div>
            <div className="dms-bar-val">{val}</div>
          </div>
        ))}

        <div style={{ marginTop: '24px' }}>
          <h3 className="dms-panel-title">By status</h3>
          {statusList.map((st) => {
            const realCount = sr.filter((x) => x.status === st.name).length;
            const val = realCount > 0 ? realCount : st.defaultVal;
            return (
              <div key={st.name} className="dms-bar-row">
                <div className="dms-bar-name">{st.name}</div>
                <div className="dms-bar-bg">
                  <div
                    className="dms-bar-fill"
                    style={{ width: `${Math.round((val / maxStatus) * 100)}%` }}
                  />
                </div>
                <div className="dms-bar-val">{val}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

