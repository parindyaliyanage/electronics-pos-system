interface Props {
  page: number;
  limit: number;
  total: number;
  onPage: (page: number) => void;
}

export function Pagination({ page, limit, total, onPage }: Props) {
  const pages = Math.max(Math.ceil(total / limit), 1);
  if (total <= limit) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return (
    <nav className="pagination" aria-label="Pages">
      <span className="muted small">{from}–{to} of {total}</span>
      <div>
        <button type="button" className="button button-ghost button-small" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <button type="button" className="button button-ghost button-small" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </nav>
  );
}
