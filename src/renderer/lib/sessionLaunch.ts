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
