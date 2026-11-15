import { statusMeta } from '../utils/format.js';

export default function StatusBadge({ status }) {
  const meta = statusMeta(status);
  return (
    <span className={`badge ${meta.className}`}>
      <i className={`bi ${meta.icon} me-1`} />
      {meta.label}
    </span>
  );
}
