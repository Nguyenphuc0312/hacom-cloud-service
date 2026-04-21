import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';

import { PageContainer } from '@/components/PageContainer';
import { AdminSidebar } from './AdminSidebar';
import { AdminTopbar } from './AdminTopbar';

export const AdminShell: React.FC = () => {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 992 : false,
  );
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

  const toggleSidebar = () => {
    if (!isMobile) {
      return;
    }

    setIsMobileNavOpen((state) => !state);
  };

  return (
    <div className={`ds-admin-shell ${isMobileNavOpen ? 'is-mobile-nav-open' : ''}`}>
      <a className="ds-skip-link" href="#main-content">
        Bỏ qua đến nội dung chính
      </a>
      <AdminSidebar id="app-sidebar" mobile={isMobile} />
      {isMobile ? (
        <button
          type="button"
          className="ds-admin-sidebar-backdrop"
          aria-label="Close navigation"
          onClick={toggleSidebar}
        />
      ) : null}
      <div className="ds-admin-main">
        <AdminTopbar
          mobile={isMobile}
          mobileNavOpen={isMobileNavOpen}
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
