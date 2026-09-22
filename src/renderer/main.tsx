import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import { createMockWorkspaceAdapter } from "./adapters/mockWorkspaceAdapter.js";
import { WorkspaceProvider } from "./runtime/WorkspaceProvider.js";
import "./styles.css";

const adapter = createMockWorkspaceAdapter();
const userAgent = navigator.userAgent;
const isMacDesktop = userAgent.includes("Mac");
const isWindowsDesktop = userAgent.includes("Windows");
document.documentElement.classList.toggle("platform-mac-desktop", isMacDesktop);
document.documentElement.classList.toggle("platform-windows-desktop", isWindowsDesktop);
document.documentElement.classList.toggle(
  "platform-linux-desktop",
  !isMacDesktop && !isWindowsDesktop,
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WorkspaceProvider adapter={adapter}>
      <App />
    </WorkspaceProvider>
  </StrictMode>,
);
