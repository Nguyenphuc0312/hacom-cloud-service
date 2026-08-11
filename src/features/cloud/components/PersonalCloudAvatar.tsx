const sizeClass = { sm: 'h-9 w-9', md: 'h-10 w-10', lg: 'h-16 w-16' } as const;
const markSizeClass = { sm: 'h-6 w-6', md: 'h-7 w-7', lg: 'h-11 w-11' } as const;

/**
 * Cùng cấu trúc với `Avatar`: bọc ngoài giữ `className`, khối tròn nằm bên trong.
 * CSS responsive của header nhắm `.chat-header-avatar > img` và `> div`, nên khối
 * tròn phải là <div> con — để <span> đơn lẻ thì avatar Cloud không co lại 32px
 * lúc mở panel như hội thoại thường, gây lệch header.
 */
export const PersonalCloudAvatar = ({
  size = 'md',
  className = '',
}: {
  size?: keyof typeof sizeClass;
  className?: string;
}) => (
  <div
    role="img"
    aria-label="Hacom Cloud"
    className={['relative inline-block shrink-0', className].filter(Boolean).join(' ')}
  >
    <div
      className={[
        'grid place-items-center overflow-hidden rounded-full border border-[#c7ddff] bg-[#4b91f7]',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.48),0_1px_4px_rgba(21,101,192,0.28)] ring-2 ring-white',
        sizeClass[size],
      ].join(' ')}
    >
      <svg
        viewBox="0 0 64 64"
        aria-hidden="true"
        className={markSizeClass[size]}
      >
        <path
          d="M10.5 24.5c0-5.2 4.2-9.5 9.5-9.5h9.1c2.1 0 3.3.8 4.6 2.3l2.4 2.7h8.5c5.2 0 9.4 4.2 9.4 9.4v15.1c0 5.2-4.2 9.5-9.5 9.5h-24.5c-5.3 0-9.5-4.3-9.5-9.5v-20z"
          fill="#d8ebff"
        />
        <path
          d="M14 28.5c0-3.5 2.8-6.3 6.3-6.3h27.4c3.5 0 6.3 2.8 6.3 6.3v16.2c0 3.5-2.8 6.3-6.3 6.3h-27.4c-3.5 0-6.3-2.8-6.3-6.3v-16.2z"
          fill="#f8fbff"
        />
        <path
          d="M25.8 43.5h20.5c3.6 0 6.5-2.7 6.5-6.1 0-3.2-2.5-5.7-5.7-6.1-1.3-4.5-5.4-7.7-10.2-7.7-4.4 0-8.2 2.7-9.8 6.6a6.7 6.7 0 0 0-1.4-.1c-3.9 0-7 3-7 6.7 0 3.7 3 6.7 6.6 6.7z"
          fill="#4b91f7"
          opacity="0.18"
        />
        <path
          d="M25.8 41.2h20.5c2.2 0 4-1.7 4-3.8 0-2-1.7-3.7-3.8-3.8l-1.7-.1-.4-1.6c-.9-3.4-4-5.8-7.5-5.8-3.2 0-6 1.9-7.2 4.9l-.7 1.7-1.8-.3c-.3-.1-.7-.1-1-.1-2.5 0-4.5 2-4.5 4.4s1.9 4.5 4.1 4.5z"
          fill="#ffffff"
        />
      </svg>
    </div>
  </div>
);

export default PersonalCloudAvatar;
