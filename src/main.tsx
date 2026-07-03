import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import "./index.css";
import "./responsive/responsive.css";
import "./i18n";
import App from "./App.tsx";
import { installChatWebDiagnostics } from "./lib/runtimeDiagnostics";
import { store } from "./store";
import { ThemeProvider, bootstrapThemeAttributes } from "./theme";
import { ResponsiveProvider } from "./responsive/responsive";
import { logger } from "./utils/logger";
import { installChunkReloadGuard } from "./utils/chunkReload";
import { installMemoryRuntimeProbe } from "./utils/memoryRuntimeProbe";

// Catch stale-deploy chunk failures that surface as uncaught errors / rejected
// dynamic imports (outside any React error boundary) and reload once.
installChunkReloadGuard();

bootstrapThemeAttributes();
installMemoryRuntimeProbe();
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
        <ResponsiveProvider>
          <App />
        </ResponsiveProvider>
      </ThemeProvider>
    </Provider>
  </StrictMode>,
);
