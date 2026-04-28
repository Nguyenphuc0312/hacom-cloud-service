import React from 'react';
import ReactDOM from 'react-dom/client';
import 'antd/dist/reset.css';

import App from '@/app/App/App';
import '@/theme/tokens/tokens.css';
import '@/theme/global/global-01.css';
import '@/theme/global/global-02.css';
import '@/theme/global/global-03.css';
import '@/theme/foundation/foundation-01.css';
import '@/theme/foundation/foundation-02.css';
import '@/theme/production/production-01.css';
import '@/theme/production/production-02.css';
import '@/theme/classic-admin/classic-admin.css';
import { bootstrapTheme } from '@/theme/bootstrap-theme/bootstrap-theme';

bootstrapTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
