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
          borderRadius: 12,
          borderRadiusLG: 18,
          controlHeight: 42,
          controlHeightLG: 48,
          fontSize: 14,
          fontSizeHeading3: 24,
          lineHeight: 1.55,
          wireframe: false,
          fontFamily:
            'Aptos, Segoe UI Variable Text, Segoe UI, SF Pro Text, Helvetica Neue, sans-serif',
        },
      }}
    >
      <AntdApp>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </AntdApp>
    </ConfigProvider>
  );
};
