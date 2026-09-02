import fs from "node:fs";
import path from "node:path";
import type { KeptRefs } from "../../shared/types";
import { parseLocalSource } from "../../shared/localSource";
import { COMPILATIONS_DIR, OUTPUT_DIR, SOURCES_DIR, UPLOADS_DIR } from "./paths";
import { dirSize } from "./diskUsage";
import { isJobRunning } from "./jobControl";
import { isSourceInFlight, sourceKey } from "./sourceCache";
import { forgetJob, listJobs } from "./jobStore";
import { forgetCompilation, getCompilation, listCompilations } from "./compilationStore";

type Kind = "source" | "output" | "upload" | "compilation";

type Sets = {
  jobs: Set<string>;
  compilations: Set<string>;
  uploads: Set<string>;
  sourceKeys: Set<string>;
};

function toSets(k: KeptRefs): Sets {
  const uploads = new Set(k.uploads ?? []);
  const sourceKeys = new Set<string>();
  for (const url of k.sourceUrls ?? []) {
    const uploadId = parseLocalSource(url);
    if (uploadId) uploads.add(uploadId);
    else if (url.trim()) sourceKeys.add(sourceKey(url));
  }
  return {
    jobs: new Set((k.jobs ?? []).filter(Boolean)),
    compilations: new Set((k.compilations ?? []).filter(Boolean)),
    uploads,
    sourceKeys,
  };
}

/** True when the disk entry is still referenced (or actively in use). */
function isKept(kind: Kind, id: string, s: Sets): boolean {
  switch (kind) {
    case "source":
      if (isSourceInFlight(id)) return true;
      return id.startsWith("upload-") ? s.uploads.has(id.slice(7)) : s.sourceKeys.has(id);
    case "output":
      return s.jobs.has(id) || isJobRunning(id);
    case "upload":
      return s.uploads.has(id);
    case "compilation":
      return s.compilations.has(id) || getCompilation(id)?.phase === "processing";
  }
}

type Orphan = { kind: Kind; id: string; path: string; bytes: number };

function listEntries(dir: string): { id: string; path: string }[] {
  let ents: fs.Dirent[];
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: { id: string; path: string }[] = [];
  for (const e of ents) {
    if (e.name.startsWith(".")) continue;
    if (!e.isDirectory() && e.name.endsWith(".json")) continue; // sibling manifest
    const id = e.isDirectory() ? e.name : e.name.replace(/\.[^.]+$/, "");
    out.push({ id, path: path.join(dir, e.name) });
  }
  return out;
}

/** Everything on disk the kept-set doesn't reference, with per-entry sizes. */
export function findOrphans(kept: KeptRefs): {
  orphans: Orphan[];
  bytes: number;
  jobs: number;
  compilations: number;
} {
  const s = toSets(kept);
  const groups: [string, Kind][] = [
    [SOURCES_DIR, "source"],
    [OUTPUT_DIR, "output"],
    [UPLOADS_DIR, "upload"],
    [COMPILATIONS_DIR, "compilation"],
  ];
  const orphans: Orphan[] = [];
  for (const [dir, kind] of groups) {
    for (const { id, path: p } of listEntries(dir)) {
      if (isKept(kind, id, s)) continue;
      let bytes = 0;
      try {
        const st = fs.statSync(p);
        bytes = st.isDirectory() ? dirSize(p) : st.size;
      } catch {
        /* ignore */
      }
      orphans.push({ kind, id, path: p, bytes });
    }
  }
  return {
    orphans,
    bytes: orphans.reduce((n, o) => n + o.bytes, 0),
    jobs: orphans.filter((o) => o.kind === "output").length,
    compilations: orphans.filter((o) => o.kind === "compilation").length,
  };
}

/** Which in-memory jobs / compilations the client still references. */
export function keptFilter(kept: KeptRefs) {
  const jobs = new Set((kept.jobs ?? []).filter(Boolean));
  const compilations = new Set((kept.compilations ?? []).filter(Boolean));
  return {
    /** Only meaningful when the client actually sent a `jobs` list. */
    active: Array.isArray(kept.jobs),
    keepsJob: (id: string) => jobs.has(id),
    keepsCompilation: (id: string) => compilations.has(id),
  };
}

/** Delete every orphan (disk + in-memory). Returns count removed + bytes freed. */
export function purgeOrphans(kept: KeptRefs): { removed: number; freed: number } {
  const { orphans } = findOrphans(kept);
  let removed = 0;
  let freed = 0;
  for (const o of orphans) {
    try {
      fs.rmSync(o.path, { recursive: true, force: true });
    } catch {
      continue;
    }
    if (o.kind === "output") forgetJob(o.id);
    if (o.kind === "compilation") forgetCompilation(o.id);
    removed += 1;
    freed += o.bytes;
  }

  // In-memory records whose output/dir was already gone still show up in stats —
  // drop them too when the client no longer references them.
  const f = keptFilter(kept);
  if (f.active) {
    for (const j of listJobs()) if (!f.keepsJob(j.id) && !isJobRunning(j.id)) forgetJob(j.id);
    for (const c of listCompilations()) {
      if (!f.keepsCompilation(c.id) && c.phase !== "processing") forgetCompilation(c.id);
    }
  }
  return { removed, freed };
}
