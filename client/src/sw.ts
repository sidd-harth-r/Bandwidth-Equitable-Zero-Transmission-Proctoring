/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

const DB_NAME = "bezp_offline_queues";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("anomaly_scores")) {
        db.createObjectStore("anomaly_scores", { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("gradients")) {
        db.createObjectStore("gradients", { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function enqueueRequest(storeName: string, request: Request): Promise<void> {
  const db = await openDB();
  const serialized = {
    url: request.url,
    method: request.method,
    headers: Array.from(request.headers.entries()),
    body: await request.clone().text(),
    timestamp: Date.now()
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const req = store.add(serialized);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function flushQueue(storeName: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);

  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = async () => {
      const items = req.result as any[];
      for (const item of items) {
        try {
          await fetch(item.url, {
            method: item.method,
            headers: item.headers,
            body: item.body
          });
          // Delete after successful send
          const delTx = db.transaction(storeName, "readwrite");
          delTx.objectStore(storeName).delete(item.id);
        } catch (err) {
          // Stop flushing if we go offline again
          break;
        }
      }
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.includes("/api/v1/scores")) {
    event.respondWith(
      fetch(event.request.clone()).catch(async () => {
        await enqueueRequest("anomaly_scores", event.request);
        return new Response(JSON.stringify({ queued: true }), {
          status: 202,
          headers: { "Content-Type": "application/json" }
        });
      })
    );
    return;
  }

  if (url.pathname.includes("/api/v1/ml/gradients")) {
    event.respondWith(
      fetch(event.request.clone()).catch(async () => {
        await enqueueRequest("gradients", event.request);
        return new Response(JSON.stringify({ queued: true }), {
          status: 202,
          headers: { "Content-Type": "application/json" }
        });
      })
    );
    return;
  }

  if (url.pathname.includes("/api/v1/clips")) {
    event.respondWith(
      fetch(event.request.clone()).catch(() => {
        // Drop tier 2 clips offline
        return new Response(JSON.stringify({ dropped: true, reason: "CLIP_DROPPED_NETWORK" }), {
          status: 202,
          headers: { "Content-Type": "application/json" }
        });
      })
    );
    return;
  }
});

self.addEventListener("sync", (event: any) => {
  if (event.tag === "flush-queues") {
    event.waitUntil(
      Promise.all([
        flushQueue("anomaly_scores"),
        flushQueue("gradients")
      ])
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "FLUSH_QUEUES") {
    void Promise.all([
      flushQueue("anomaly_scores"),
      flushQueue("gradients")
    ]);
  }
});
