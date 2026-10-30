const { randomUUID } = require("node:crypto");

const { app, safeStorage } = require("electron");

app.whenReady().then(async () => {
  try {
    const available = await safeStorage.isAsyncEncryptionAvailable();
    const backend = process.platform === "linux" ? safeStorage.getSelectedStorageBackend() : null;
    const secure = available && !["basic_text", "unknown"].includes(backend ?? "");
    let roundTrip = false;
    if (available) {
      const marker = randomUUID();
      const decrypted = await safeStorage.decryptStringAsync(
        await safeStorage.encryptStringAsync(marker),
      );
      roundTrip = decrypted.result === marker;
    }
    console.log(
      JSON.stringify({ platform: process.platform, available, backend, secure, roundTrip }),
    );
  } finally {
    app.quit();
  }
});
