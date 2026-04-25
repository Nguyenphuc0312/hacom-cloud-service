import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import "./index.css";
import "./i18n";
import App from "./App.tsx";
import { installChatWebDiagnostics } from "./lib/runtimeDiagnostics";
import { store } from "./store";
import { ThemeProvider, bootstrapThemeAttributes } from "./theme";
import { logger } from "./utils/logger";

bootstrapThemeAttributes();
logger.info(
  "runtime",
  "diagnostics_installed",
  installChatWebDiagnostics(),
  { debugOnly: true },
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider store={store}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </Provider>
  </StrictMode>,
);
