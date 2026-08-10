import { CloudIcon } from '@heroicons/react/24/outline';

const sizeClass = { sm: 'h-9 w-9', md: 'h-10 w-10', lg: 'h-16 w-16' } as const;

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
        'grid place-items-center rounded-full bg-brand-soft text-brand-solid',
        sizeClass[size],
      ].join(' ')}
    >
      <CloudIcon className={size === 'lg' ? 'h-8 w-8' : 'h-5 w-5'} aria-hidden="true" />
    </div>
  </div>
);

export default PersonalCloudAvatar;
