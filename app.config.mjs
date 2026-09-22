/**
 * Public product configuration. Keep this file free of secrets: it is bundled
 * into both the Electron main process and the renderer.
 */
export default Object.freeze({
  appId: "dev.tiebi.vintage",
  productName: "VINTAGE",
  executableName: "vintage",
  defaultTheme: "system",
  window: {
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 640,
  },
});
