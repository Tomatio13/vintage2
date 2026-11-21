import type { AcpForkSource } from "../../shared/acp.js";

const requests = new Map<string, string>();
export const sessionLaunch = {
  set(paneId: string, key: string) {
    requests.set(paneId, key);
  },
  get(paneId: string) {
    return requests.get(paneId);
  },
  consume(paneId: string) {
    requests.delete(paneId);
  },
};

export const acpForkRequests = new Map<string, AcpForkSource>();
