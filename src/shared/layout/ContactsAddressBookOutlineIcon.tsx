import * as React from "react";

/**
 * Outline address-book style icon (binder rings + person silhouette) for the side rail.
 * Matches Heroicons 24/outline conventions: viewBox 24×24, stroke currentColor, width 1.5.
 */
const ContactsAddressBookOutlineIcon = React.forwardRef<
  SVGSVGElement,
  React.SVGProps<SVGSVGElement>
>(function ContactsAddressBookOutlineIcon(props, ref) {
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
      <g transform="matrix(1.25, 0, 0, 1.25, -4.25, -3)">
        <rect
          x="9.5"
          y="4.75"
          width="10.25"
          height="14.5"
          rx="2"
          ry="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          strokeLinecap="round"
          d="M9.5 8.35H6.25M9.5 12H6.25M9.5 15.65H6.25"
        />
        <circle cx="14.625" cy="10" r="2.125" strokeLinecap="round" strokeLinejoin="round" />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M11.375 17.75c0-2.35 1.4-3.65 3.25-3.65s3.25 1.3 3.25 3.65"
        />
      </g>
    </svg>
  );
});

export default ContactsAddressBookOutlineIcon;
