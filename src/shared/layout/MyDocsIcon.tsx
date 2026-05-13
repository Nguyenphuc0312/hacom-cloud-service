import * as React from "react";

/**
 * Custom MyDocs icon (Folder with Cloud).
 * Matches Heroicons 24/outline conventions: viewBox 24×24, stroke currentColor, width 1.5.
 */
const MyDocsIcon = React.forwardRef<
  SVGSVGElement,
  React.SVGProps<SVGSVGElement>
>(function MyDocsIcon(props, ref) {
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
      {/* Folder body */}
      <path
        d="M4.5 7.5V16.5C4.5 17.6046 5.39543 18.5 6.5 18.5H10M4.5 7.5C4.5 6.39543 5.39543 5.5 6.5 5.5H9.58579C9.851 5.5 10.1054 5.60536 10.2929 5.79289L12.7071 8.20711C12.8946 8.39464 13.149 8.5 13.4142 8.5H17.5C18.6046 8.5 19.5 9.39543 19.5 10.5V11.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Cloud icon */}
      <path
        d="M12.5 16.5C12.5 15.1193 13.6193 14 15 14C15.1102 14 15.2188 14.0071 15.325 14.0208C15.6593 13.4167 16.3045 13 17.0417 13C17.915 13 18.6575 13.5532 18.9272 14.3188C19.106 14.1158 19.3676 14 19.6667 14C20.2189 14 20.6667 14.4477 20.6667 15C20.6667 15.1102 20.6488 15.2162 20.6158 15.3152C21.1444 15.5422 21.5 16.0292 21.5 16.6C21.5 17.3732 20.8732 18 20.1 18H13.9C13.1268 18 12.5 17.3732 12.5 16.6C12.5 16.5667 12.5 16.5333 12.5 16.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
});

export default MyDocsIcon;
