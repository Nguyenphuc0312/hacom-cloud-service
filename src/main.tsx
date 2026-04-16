import React from 'react';
import ReactDOM from 'react-dom/client';
import 'antd/dist/reset.css';

import App from '@/App';
import '@/styles/global.css';
import '@/styles/foundation.css';
import { bootstrapTheme } from '@/theme/bootstrap-theme';

bootstrapTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
