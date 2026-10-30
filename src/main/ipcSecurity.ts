import type { IpcMainInvokeEvent } from "electron";

type SenderFrameEvent = Pick<IpcMainInvokeEvent, "sender" | "senderFrame">;

export function assertTrustedRendererSender(
  event: SenderFrameEvent,
  isAllowedUrl: (url: string) => boolean,
): void {
  if (event.senderFrame !== event.sender.mainFrame) {
    throw new Error("IPC requests from subframes are not allowed");
  }
  if (!isAllowedUrl(event.senderFrame.url)) {
    throw new Error("IPC requests from untrusted renderer URLs are not allowed");
  }
}
