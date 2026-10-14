// 3SVerse asset vault — keeps linked campaign files INSIDE the extension
// (IndexedDB), so deleting the original folder from Downloads never breaks a
// running or scheduled campaign. Every app that links a campaign folder
// saves its files here and rebuilds its queue from this vault when the live
// folder is no longer available.
const AssetVault = (() => {
  const DB_NAME = "3sverseAssetVaultV1";
  const STORE = "assets";

  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function put(key, record) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function all() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const keys = tx.objectStore(STORE).getAllKeys();
      const values = tx.objectStore(STORE).getAll();
      tx.oncomplete = () => {
        const out = [];
        keys.result.forEach((key, index) => out.push({ key, ...values.result[index] }));
        resolve(out);
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  async function clearSlot(slot) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const keys = store.getAllKeys();
      tx.oncomplete = () => {
        const remove = db.transaction(STORE, "readwrite");
        const target = remove.objectStore(STORE);
        keys.result.filter(key => String(key).startsWith(`${slot}::`)).forEach(key => target.delete(key));
        remove.oncomplete = () => resolve(true);
        remove.onerror = () => reject(remove.error);
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  async function clearAll() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  return { put, all, clearSlot, clearAll };
})();

const VAULT_MEDIA_RE = /\.(md|png|jpe?g|webp|gif|mp4|mov|webm|m4v)$/i;

function vaultKey(slot, relativePath) {
  return `${slot}::${relativePath || ""}`;
}

// Save every usable campaign file (markdown + media) of one folder slot.
// Unchanged files (same relative path, size and timestamp) are skipped so a
// rebuild does not re-copy hundreds of megabytes.
async function vaultSaveFiles(slot, files) {
  const existing = new Map((await AssetVault.all()).map(record => [record.key, record]));
  let saved = 0;
  for (const file of files) {
    if (!VAULT_MEDIA_RE.test(file.name)) continue;
    const relPath = file.webkitRelativePath || file.name;
    const key = vaultKey(slot, relPath);
    const previous = existing.get(key);
    if (previous && previous.size === file.size && previous.lastModified === file.lastModified) continue;
    await AssetVault.put(key, {
      name: file.name,
      type: file.type || "application/octet-stream",
      relPath,
      size: file.size,
      lastModified: file.lastModified || 0,
      savedAt: new Date().toISOString(),
      blob: file
    });
    saved += 1;
  }
  return saved;
}

// Rebuild a File object from a vault record. webkitRelativePath is read-only
// on File instances, so it is re-defined from the saved relative path.
function vaultFile(record) {
  const file = new File([record.blob], record.name, { type: record.type });
  try { Object.defineProperty(file, "webkitRelativePath", { value: record.relPath }); } catch (_) {}
  file.__vaultSlot = String(record.key || "").split("::")[0];
  file.__vaultCopy = true;
  return file;
}
