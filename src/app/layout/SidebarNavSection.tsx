import React from 'react';
import { SidebarNavItem } from './SidebarNavItem';

export const SidebarNavSection = ({ label, items }) => (
  <div className="ds-sidebar-section">
    <div className="ds-sidebar-section-label">{label}</div>
    <div className="ds-sidebar-section-list">
      {items.map((item) => (
        <SidebarNavItem key={item.key} item={item} />
      ))}
    </div>
  </div>
);
