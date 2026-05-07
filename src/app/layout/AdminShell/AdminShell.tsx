import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';

import { PageContainer } from '@/components/PageContainer/PageContainer';
import { AdminSidebar } from '../AdminSidebar/AdminSidebar';
import { AdminTopbar } from '../AdminTopbar/AdminTopbar';

import './AdminShell.css';
const SIDEBAR_PREFERENCE_KEY = 'chat-admin-sidebar-collapsed';

export const AdminShell: React.FC = () => {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 992 : false,
  );
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return window.localStorage.getItem(SIDEBAR_PREFERENCE_KEY) === '1';
  });
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(max-width: 991px)');

    const syncViewport = (matches: boolean) => {
      setIsMobile(matches);

      if (!matches) {
        setIsMobileNavOpen(false);
      }
    };

    syncViewport(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      syncViewport(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || isMobile) {
      return;
    }

    window.localStorage.setItem(SIDEBAR_PREFERENCE_KEY, isSidebarCollapsed ? '1' : '0');
  }, [isMobile, isSidebarCollapsed]);

  const toggleSidebar = () => {
    if (isMobile) {
      setIsMobileNavOpen((state) => !state);
      return;
    }

    setIsSidebarCollapsed((state) => !state);
  };

  return (
    <div
      className={`ds-admin-shell ${isMobileNavOpen ? 'is-mobile-nav-open' : ''} ${
        !isMobile && isSidebarCollapsed ? 'is-collapsed' : ''
      }`}
    >
      <a className="ds-skip-link" href="#main-content">
        Bỏ qua đến nội dung chính
      </a>
      <AdminSidebar id="app-sidebar" mobile={isMobile} />
      {isMobile ? (
        <button
          type="button"
          className="ds-admin-sidebar-backdrop"
          aria-label="Đóng điều hướng"
          onClick={toggleSidebar}
        />
      ) : null}
      <div className="ds-admin-main">
        <AdminTopbar
          mobile={isMobile}
          mobileNavOpen={isMobileNavOpen}
          sidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={toggleSidebar}
        />
        <main id="main-content" className="ds-admin-main-content" role="main">
          <PageContainer>
            <Outlet />
          </PageContainer>
        </main>
      </div>
    </div>
  );
};
