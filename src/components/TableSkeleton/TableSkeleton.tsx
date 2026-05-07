interface TableSkeletonProps {
  rows?: number;
}

export const TableSkeleton = ({ rows = 6 }: TableSkeletonProps) => (
  <div className="ds-table-skeleton" aria-hidden>
    {Array.from({ length: rows }).map((_, index) => (
      <span key={index} />
    ))}
  </div>
);
