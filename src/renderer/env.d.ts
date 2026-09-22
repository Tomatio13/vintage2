/// <reference types="vite/client" />

import type { DesktopBridge } from "../shared/desktop.js";

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}

export {};
