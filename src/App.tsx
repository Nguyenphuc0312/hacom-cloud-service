/**
 * @fileoverview Main App component
 * Centralized router provider for route-object architecture.
 */

import { RouterProvider } from "react-router-dom";
import { appRouter } from "./router";

function App() {
  return <RouterProvider router={appRouter} />;
}

export default App;
