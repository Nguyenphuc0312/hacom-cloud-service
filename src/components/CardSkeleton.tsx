interface CardSkeletonProps {
  lines?: number;
}

export const CardSkeleton = ({ lines = 3 }: CardSkeletonProps) => (
  <div className="ds-card-skeleton" aria-hidden>
    {Array.from({ length: lines }).map((_, index) => (
      <span key={index} />
    ))}
  </div>
);
