import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntdApp, ConfigProvider } from 'antd';
import type { PropsWithChildren } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
  },
});

export const AppProviders = ({ children }: PropsWithChildren) => {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1d4ed8',
          colorInfo: '#2563eb',
          colorSuccess: '#15803d',
          colorWarning: '#b45309',
          colorError: '#b91c1c',
          colorBgLayout: '#edf2f8',
          colorBorderSecondary: '#d3dde8',
          colorTextSecondary: '#5d6878',
          borderRadius: 10,
          borderRadiusLG: 12,
          controlHeight: 36,
          controlHeightLG: 42,
          fontSize: 14,
          fontSizeHeading3: 22,
          lineHeight: 1.45,
          wireframe: false,
          fontFamily: 'IBM Plex Sans, Segoe UI, Tahoma, sans-serif',
        },
      }}
    >
      <AntdApp>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </AntdApp>
    </ConfigProvider>
  );
};
