import { describe, expect, it, vi } from "vitest";
import type { ContextMenuParams, WebContents } from "electron";
vi.mock("electron", () => ({ clipboard: { writeText: vi.fn() } }));
import { clipboard } from "electron";
import { browserContextMenuItems } from "../src/main/browserContextMenu.js";

function setup(overrides: Partial<ContextMenuParams> = {}) {
  const contents = {
    isDestroyed: vi.fn(() => false),
    focus: vi.fn(),
    getURL: vi.fn(() => "https://example.com/"),
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    pasteAndMatchStyle: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    selectAll: vi.fn(),
    copyImageAt: vi.fn(),
    inspectElement: vi.fn(),
    reload: vi.fn(),
    navigationHistory: {
      canGoBack: vi.fn(() => true),
      canGoForward: vi.fn(() => false),
      goBack: vi.fn(),
      goForward: vi.fn(),
    },
  };
  const params = {
    x: 10,
    y: 20,
    linkURL: "",
    srcURL: "",
    selectionText: "",
    mediaType: "none",
    isEditable: false,
    editFlags: {
      canUndo: false,
      canRedo: false,
      canCut: false,
      canCopy: true,
      canPaste: true,
      canSelectAll: true,
    },
    ...overrides,
  } as ContextMenuParams;
  const openTab = vi.fn();
  const items = browserContextMenuItems(contents as unknown as WebContents, params, openTab);
  const item = (label: string) => items.find((entry) => entry.label === label)!;
  const click = (label: string) => (item(label).click as () => void)();
  return { contents, items, item, click, openTab };
}
describe("Browser context menu", () => {
  it("copies selected text in the guest and skips page navigation items", () => {
    const { contents, item, click } = setup({ selectionText: "selected" });
    click("Copy");
    expect(contents.focus).toHaveBeenCalled();
    expect(contents.copy).toHaveBeenCalled();
    expect(item("Back")).toBeUndefined();
    expect(item("Paste")).toBeUndefined();
  });
  it("offers editable actions and respects Chromium edit flags", () => {
    const { contents, item, click } = setup({ isEditable: true });
    expect(item("Cut").enabled).toBe(false);
    expect(item("Undo").enabled).toBe(false);
    click("Paste");
    click("Paste as plain text");
    click("Select all");
    expect(contents.paste).toHaveBeenCalled();
    expect(contents.pasteAndMatchStyle).toHaveBeenCalled();
    expect(contents.selectAll).toHaveBeenCalled();
  });
  it("opens safe links through the existing tab callback and copies their addresses", () => {
    const { openTab, click } = setup({ linkURL: "https://example.com/next" });
    click("Open link in new tab");
    click("Copy link address");
    expect(openTab).toHaveBeenCalledWith("https://example.com/next");
    expect(clipboard.writeText).toHaveBeenCalledWith("https://example.com/next");
  });
  it("blocks privileged URLs and rechecks local navigation at click time", () => {
    for (const url of ["javascript:alert(1)", "file:///tmp/private", "data:text/html,test"]) {
      const { item, click, openTab } = setup({ linkURL: url });
      expect(item("Open link in new tab").enabled).toBe(false);
      click("Open link in new tab");
      expect(openTab).not.toHaveBeenCalled();
    }
    const { contents, click, openTab } = setup({ linkURL: "file:///tmp/next" });
    contents.getURL.mockReturnValue("file:///tmp/source");
    click("Open link in new tab");
    expect(openTab).toHaveBeenCalledWith("file:///tmp/next");
  });
  it("copies image pixels and URL, even when opening a data image is unavailable", () => {
    const { contents, item, click } = setup({
      mediaType: "image",
      srcURL: "data:image/png,test",
      hasImageContents: true,
    });
    expect(item("Open image in new tab").enabled).toBe(false);
    click("Copy image");
    click("Copy image address");
    expect(contents.copyImageAt).toHaveBeenCalledWith(10, 20);
    expect(clipboard.writeText).toHaveBeenCalledWith("data:image/png,test");
  });
  it("supports page navigation and inspection, and ignores destroyed guests", () => {
    const { contents, item, click } = setup();
    expect(item("Forward").enabled).toBe(false);
    click("Back");
    click("Reload");
    click("Inspect element");
    expect(contents.navigationHistory.goBack).toHaveBeenCalled();
    expect(contents.reload).toHaveBeenCalledTimes(1);
    expect(contents.inspectElement).toHaveBeenCalledWith(10, 20);
    contents.isDestroyed.mockReturnValue(true);
    click("Reload");
    expect(contents.reload).toHaveBeenCalledTimes(1);
  });
});
