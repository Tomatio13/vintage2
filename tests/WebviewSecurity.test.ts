import { beforeEach, describe, expect, it, vi } from "vitest";

const fromPartition = vi.hoisted(() => vi.fn());

vi.mock("electron", () => ({
  Menu: { buildFromTemplate: vi.fn() },
  session: { fromPartition },
}));

import { configureBrowserSession, hardenGuest } from "../src/main/webviewSecurity.js";

describe("Browser session security", () => {
  beforeEach(() => fromPartition.mockReset());

  it("denies permissions and cancels web page downloads", () => {
    const listeners = new Map<string, (...args: never[]) => void>();
    let permissionCheck: (() => boolean) | undefined;
    let permissionRequest:
      | ((_contents: unknown, _permission: unknown, callback: (allowed: boolean) => void) => void)
      | undefined;
    const browserSession = {
      setPermissionCheckHandler: vi.fn((handler) => {
        permissionCheck = handler;
      }),
      setPermissionRequestHandler: vi.fn((handler) => {
        permissionRequest = handler;
      }),
      on: vi.fn((event, listener) => listeners.set(event, listener)),
    };

    configureBrowserSession(browserSession as never);
    expect(permissionCheck?.()).toBe(false);
    const permissionResult = vi.fn();
    permissionRequest?.(null, "camera", permissionResult);
    expect(permissionResult).toHaveBeenCalledWith(false);
    const downloadEvent = { preventDefault: vi.fn() };
    listeners.get("will-download")?.(downloadEvent as never);
    expect(downloadEvent.preventDefault).toHaveBeenCalledOnce();
  });

  it("rejects invalid certificates and HTTP authentication challenges", () => {
    const listeners = new Map<string, (...args: never[]) => void>();
    const contents = {
      on: vi.fn((event, listener) => {
        listeners.set(event, listener);
        return contents;
      }),
      setWindowOpenHandler: vi.fn(),
      getURL: vi.fn(() => "https://example.com/"),
    };
    hardenGuest(contents as never, vi.fn());

    const certificateEvent = { preventDefault: vi.fn() };
    const certificateCallback = vi.fn();
    listeners.get("certificate-error")?.(
      certificateEvent as never,
      "https://invalid.example/" as never,
      "ERR_CERT_AUTHORITY_INVALID" as never,
      {} as never,
      certificateCallback as never,
      true as never,
    );
    expect(certificateEvent.preventDefault).toHaveBeenCalledOnce();
    expect(certificateCallback).toHaveBeenCalledWith(false);

    const loginEvent = { preventDefault: vi.fn() };
    const loginCallback = vi.fn();
    listeners.get("login")?.(loginEvent as never, {} as never, {} as never, loginCallback as never);
    expect(loginEvent.preventDefault).toHaveBeenCalledOnce();
    expect(loginCallback).toHaveBeenCalledWith();
  });
});
