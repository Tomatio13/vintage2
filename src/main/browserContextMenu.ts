import {
  clipboard,
  type ContextMenuParams,
  type MenuItemConstructorOptions,
  type WebContents,
} from "electron";
import { canNavigateBrowserGuest } from "../shared/browserUrl.js";

/** Target guest contents explicitly: the app renderer must never receive edit commands. */
export function browserContextMenuItems(
  contents: WebContents,
  params: ContextMenuParams,
  openTab: (url: string) => void,
): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [];
  const action = (run: () => void) => () => {
    if (contents.isDestroyed()) return;
    contents.focus();
    run();
  };
  const group = (entries: MenuItemConstructorOptions[]) => {
    if (!entries.length) return;
    if (items.length) items.push({ type: "separator" });
    items.push(...entries);
  };
  const open = (url: string) =>
    action(() => {
      if (canNavigateBrowserGuest(contents.getURL(), url)) openTab(url);
    });
  if (params.linkURL)
    group([
      {
        label: "Open link in new tab",
        enabled: canNavigateBrowserGuest(contents.getURL(), params.linkURL),
        click: open(params.linkURL),
      },
      { label: "Copy link address", click: action(() => clipboard.writeText(params.linkURL)) },
    ]);
  if (params.mediaType === "image")
    group([
      {
        label: "Open image in new tab",
        enabled: canNavigateBrowserGuest(contents.getURL(), params.srcURL),
        click: open(params.srcURL),
      },
      {
        label: "Copy image",
        enabled: params.hasImageContents,
        click: action(() => contents.copyImageAt(params.x, params.y)),
      },
      {
        label: "Copy image address",
        enabled: Boolean(params.srcURL),
        click: action(() => clipboard.writeText(params.srcURL)),
      },
    ]);
  const flags = params.editFlags;
  if (params.isEditable)
    group([
      { label: "Undo", enabled: flags.canUndo, click: action(() => contents.undo()) },
      { label: "Redo", enabled: flags.canRedo, click: action(() => contents.redo()) },
      { type: "separator" },
      { label: "Cut", enabled: flags.canCut, click: action(() => contents.cut()) },
      { label: "Copy", enabled: flags.canCopy, click: action(() => contents.copy()) },
      { label: "Paste", enabled: flags.canPaste, click: action(() => contents.paste()) },
      {
        label: "Paste as plain text",
        enabled: flags.canPaste,
        click: action(() => contents.pasteAndMatchStyle()),
      },
      {
        label: "Select all",
        enabled: flags.canSelectAll,
        click: action(() => contents.selectAll()),
      },
    ]);
  else if (params.selectionText)
    group([{ label: "Copy", enabled: flags.canCopy, click: action(() => contents.copy()) }]);
  if (!params.isEditable && !params.selectionText && !params.linkURL && params.mediaType === "none")
    group([
      {
        label: "Back",
        enabled: contents.navigationHistory.canGoBack(),
        click: action(() => {
          if (contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
        }),
      },
      {
        label: "Forward",
        enabled: contents.navigationHistory.canGoForward(),
        click: action(() => {
          if (contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
        }),
      },
      { label: "Reload", click: action(() => contents.reload()) },
    ]);
  group([
    { label: "Inspect element", click: action(() => contents.inspectElement(params.x, params.y)) },
  ]);
  return items;
}
