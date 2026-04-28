import { AppIcon } from '@/components/AppIcon/AppIcon';
import type { AppIconKey } from '@/components/AppIcon/AppIcon';
import type { NavItem as NavItemType } from '../navigationConfig/navigationConfig';
import { SidebarNavItem } from '../SidebarNavItem/SidebarNavItem';

interface SidebarNavSectionProps {
  label: string;
  items: NavItemType[];
  iconKey?: AppIconKey;
}

export const SidebarNavSection = ({ label, items, iconKey }: SidebarNavSectionProps) => (
  <div className="ds-sidebar-section">
    <div className="ds-sidebar-section-label">
      <span className="ds-sidebar-section-label-main">
        {iconKey ? (
          <span className="ds-sidebar-section-icon">
            <AppIcon name={iconKey} size={14} aria-hidden />
          </span>
        ) : null}
        <span>{label}</span>
      </span>
    </div>

    <div className="ds-sidebar-section-list">
      {items.map((item) => (
        <div key={item.key} className={item.children?.length ? 'ds-sidebar-item-group' : undefined}>
          <SidebarNavItem item={item} />
          {item.children && item.children.length > 0 ? (
            <div className="ds-sidebar-submenu">
              {item.children.map((child) => (
                <SidebarNavItem key={child.key} item={child} isSubmenu />
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  </div>
);
