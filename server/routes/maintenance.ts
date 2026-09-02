import { Router } from "express";
import type { KeptRefs } from "../../shared/types";
import { purgeOrphans } from "../core/maintenance";
import { invalidateStatsCache } from "./stats";

export const maintenanceRouter = Router();

/**
 * "Empty the trash" — delete every job / compilation / source / upload on disk
 * that the posted `KeptRefs` doesn't reference. No-op-safe: an empty body would
 * wipe everything, so a `jobs` array is required.
 */
maintenanceRouter.post("/purge", (req, res) => {
  const kept = (req.body ?? {}) as KeptRefs;
  if (!Array.isArray(kept.jobs)) {
    return res.status(422).json({ error: "Envie a lista de referências em uso." });
  }
  const { removed, freed } = purgeOrphans(kept);
  invalidateStatsCache(); // so the Home dashboard reloads fresh numbers, not the 8s cache
  res.json({ removed, freed });
});
