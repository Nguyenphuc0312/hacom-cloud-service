import React, { useState } from "react";
import { ChevronDownIcon as ChevronDown } from "@heroicons/react/24/outline";

interface CloudResourceSectionProps {
  label: string;
  count: number;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

export const CloudResourceSection: React.FC<CloudResourceSectionProps> = ({
  label,
  count,
  children,
  defaultExpanded = count > 0,
}) => {
  // Populated sections open by default. Media can opt in explicitly so it
  // stays open while the initial resource request is still loading.
  const [expanded, setExpanded] = useState(defaultExpanded);
  const contentId = `cloud-resource-section-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <section className="bg-surface px-5 py-3">
      <button
        type="button"
        className="mb-2.5 flex w-full items-center justify-between text-left text-[16px] font-semibold text-text-primary transition-colors"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((open) => !open)}
      >
        <span>{label}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${expanded ? "" : "-rotate-90"}`}
          aria-hidden="true"
        />
      </button>
      {expanded ? <div id={contentId}>{children}</div> : null}
    </section>
  );
};

export const ViewAllResourcesButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="mt-3 h-9 w-full rounded bg-[#e4e7ec] text-[14px] font-semibold text-text-primary transition-colors hover:bg-[#dde1e7]"
  >
    Xem tất cả
  </button>
);

export const CloudResourceEmptyText: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="py-4 text-center text-sm text-text-muted">{children}</p>
);
