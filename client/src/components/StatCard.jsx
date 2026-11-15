export default function StatCard({ icon, label, value, note, tone = 'navy' }) {
  return (
    <div className="stat-card">
      <span className={`stat-icon ${tone}`}>
        <i className={`bi ${icon}`} />
      </span>
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value ?? '—'}</div>
        {note ? <div className="stat-note">{note}</div> : null}
      </div>
    </div>
  );
}
