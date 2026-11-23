import { useEffect, useSyncExternalStore } from "react";

let image: Blob | undefined;
let loading: Promise<void> | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getImage() {
  return image;
}

async function accessImage<T>(
  mode: IDBTransactionMode,
  access: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("vintage-workspace-wallpaper", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("images");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction("images", mode);
      const request = access(transaction.objectStore("images"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export function useWorkspaceWallpaper() {
  useEffect(() => {
    loading ??= accessImage("readonly", (store) => store.get("workspace"))
      .then((saved: unknown) => {
        image = saved instanceof Blob ? saved : undefined;
        listeners.forEach((listener) => listener());
      })
      .catch(() => {});
  }, []);
  return useSyncExternalStore(subscribe, getImage);
}

export async function saveWorkspaceWallpaper(file?: File) {
  if (file) {
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 16 * 1024 ** 2
    ) {
      throw new Error("Choose a PNG, JPEG or WebP image up to 16 MiB.");
    }
    const bitmap = await createImageBitmap(file).catch(() => {
      throw new Error("This image could not be opened.");
    });
    bitmap.close();
  }
  await loading;
  if (file) {
    await accessImage("readwrite", (store) => store.put(file, "workspace"));
  } else {
    await accessImage("readwrite", (store) => store.delete("workspace"));
  }
  image = file;
  listeners.forEach((listener) => listener());
}
