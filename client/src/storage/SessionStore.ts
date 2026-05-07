import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { AnomalyScorePayload } from "../coordinator/types";

interface BezpClientDb extends DBSchema {
  anomalyEvents: {
    key: string;
    value: AnomalyScorePayload & { id: string };
    indexes: {
      "by-session": string;
    };
  };
}

export class SessionStore {
  private dbPromise: Promise<IDBPDatabase<BezpClientDb>>;

  constructor() {
    this.dbPromise = openDB<BezpClientDb>("bezp-client", 1, {
      upgrade(db) {
        const store = db.createObjectStore("anomalyEvents", { keyPath: "id" });
        store.createIndex("by-session", "session_id");
      }
    });
  }

  async addAnomalyEvent(payload: AnomalyScorePayload): Promise<void> {
    const db = await this.dbPromise;
    await db.put("anomalyEvents", {
      ...payload,
      id: `${payload.session_id}:${payload.occurred_at}`
    });
  }
}
