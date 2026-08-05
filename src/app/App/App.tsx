import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';

import { authClient } from '@/api/clients/authClient/authClient';
import { router } from '@/app/router/router';
import { AppProviders } from '@/app/providers/AppProviders/AppProviders';
import { useAuthStore } from '@/store/authStore/authStore';

const App = () => {
  const setAuth = useAuthStore((state) => state.setAuth);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const setInitialized = useAuthStore((state) => state.setInitialized);

  useEffect(() => {
    let active = true;

    void authClient
      .refresh()
      .then((session) => {
        if (active) setAuth({ accessToken: session.accessToken, user: session.user ?? null });
      })
      .catch(() => {
        if (active) clearAuth();
      })
      .finally(() => {
        if (active) setInitialized(true);
      });

    return () => {
      active = false;
    };
  }, [clearAuth, setAuth, setInitialized]);

  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
};

export default App;
