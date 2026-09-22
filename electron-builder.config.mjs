import appConfig from "./app.config.mjs";

/** @type {import('electron-builder').Configuration} */
export default {
  appId: appConfig.appId,
  productName: appConfig.productName,
  executableName: appConfig.executableName,
  directories: {
    output: "release",
    buildResources: "build",
  },
  files: ["dist/**/*", "build/icon.png", "package.json"],
  asar: true,
  npmRebuild: true,
  asarUnpack: ["node_modules/node-pty/**"],
  mac: {
    target: ["dmg", "zip"],
    category: "public.app-category.developer-tools",
    icon: "build/icon.png",
    artifactName: "${productName}-${version}-${arch}.${ext}",
  },
  win: {
    target: ["nsis"],
    icon: "build/icon.png",
    artifactName: "${productName}-${version}-${arch}.${ext}",
  },
  linux: {
    target: ["AppImage", "deb"],
    category: "Development",
    icon: "build/icon.png",
    maintainer: "Your Name <you.com>",
    syncDesktopName: true,
    artifactName: "${productName}-${version}-${arch}.${ext}",
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },
};
