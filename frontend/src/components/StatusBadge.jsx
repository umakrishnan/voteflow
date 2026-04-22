const CLASS = {
  draft: 'badge-draft',
  open: 'badge-open',
  closed: 'badge-closed',
};

export default function StatusBadge({ status }) {
  return <span className={CLASS[status] || 'badge-draft'}>{status}</span>;
}
