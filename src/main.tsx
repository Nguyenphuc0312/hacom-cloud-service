import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./i18n";
import App from "./App.tsx";
import { installChatWebDiagnostics } from "./lib/runtimeDiagnostics";
import { ThemeProvider, bootstrapThemeAttributes } from "./theme";

bootstrapThemeAttributes();
console.info("[chat-web] runtime diagnostics", installChatWebDiagnostics());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
