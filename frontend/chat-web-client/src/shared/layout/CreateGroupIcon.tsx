import * as React from "react";

/**
 * Custom Create Group icon matching the user's provided design.
 * Features two figures and a plus sign.
 */
const CreateGroupIcon = React.forwardRef<
  SVGSVGElement,
  React.SVGProps<SVGSVGElement>
>(function CreateGroupIcon(props, ref) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
      data-slot="icon"
      ref={ref}
      {...props}
    >
      {/* Plus sign at the top right */}
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14 6.5h5m-2.5-2.5v5"
      />
      
      {/* Main figure (larger) */}
      <circle cx="9" cy="8.5" r="3.5" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 19c0-3 3-5 6-5s6 2 6 5"
      />
      
      {/* Secondary figure (smaller) */}
      <circle cx="16.5" cy="14.5" r="2.5" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12.5 21.5c0-2 2-3 4-3s4 1 4 3"
      />
    </svg>
  );
});

export default CreateGroupIcon;
