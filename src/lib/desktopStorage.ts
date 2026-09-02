import type { StateStorage } from "zustand/middleware";
import type Database from "@tauri-apps/plugin-sql";

/**
 * Zustand persist backend for the desktop build: a single key/value table in
 * SQLite (via tauri-plugin-sql). Same contract as `localStorage` — the stored
 * value is the same JSON blob the web build keeps under `localStorage`. The
 * plugin module is imported lazily so it never lands in the web/Docker bundle.
 */
let dbPromise: Promise<Database> | null = null;

async function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const { default: Sql } = await import("@tauri-apps/plugin-sql");
      const db = await Sql.load("sqlite:fast-cut-video.db");
      await db.execute("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
      return db;
    })();
  }
  return dbPromise;
}

export const desktopStorage: StateStorage = {
  async getItem(name) {
    const db = await getDb();
    const rows = await db.select<{ value: string }[]>("SELECT value FROM kv WHERE key = $1", [
      name,
    ]);
    return rows.length > 0 ? rows[0].value : null;
  },
  async setItem(name, value) {
    const db = await getDb();
    await db.execute(
      "INSERT INTO kv (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [name, value],
    );
  },
  async removeItem(name) {
    const db = await getDb();
    await db.execute("DELETE FROM kv WHERE key = $1", [name]);
  },
};
