import clsx from 'clsx';

interface AvatarCellProps {
  name?: string | null;
  description?: string | null;
  code?: string | null;
  className?: string;
}

const getInitials = (value?: string | null) => {
  const normalized = value?.trim();

  if (!normalized) {
    return 'AD';
  }

  return normalized
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
};

export const AvatarCell = ({ name, description, code, className }: AvatarCellProps) => (
  <div className={clsx('ds-avatar-cell', className)}>
    <span className="ds-avatar-cell-mark" aria-hidden>
      {getInitials(name ?? description ?? code)}
    </span>
    <span className="ds-avatar-cell-copy">
      <strong title={name ?? undefined}>{name || 'Unknown'}</strong>
      {description || code ? <small title={description ?? code ?? undefined}>{description || code}</small> : null}
    </span>
  </div>
);
