import type { KeptRefs } from "../../shared/types";
import { useStore } from "../store";

/**
 * Everything the client still references on the server: project jobs + sources,
 * plus the jobs / uploads / compilations behind every saved montage timeline.
 * The dashboard and disk cleanup use this to tell orphans from live data.
 */
export function currentKeptRefs(): KeptRefs {
  const s = useStore.getState();
  const jobs = new Set<string>();
  const uploads = new Set<string>();
  const compilations = new Set<string>();
  const sourceUrls = new Set<string>();

  for (const p of s.projects) {
    if (p.jobId) jobs.add(p.jobId);
    if (p.sourceUrl.trim()) sourceUrls.add(p.sourceUrl.trim());
  }
  for (const m of s.montageProjects) {
    if (m.compilation.id) compilations.add(m.compilation.id);
    for (const it of m.items) {
      if (it.ref.kind === "upload") uploads.add(it.ref.uploadId);
      else jobs.add(it.ref.jobId);
    }
  }

  return {
    jobs: [...jobs],
    uploads: [...uploads],
    compilations: [...compilations],
    sourceUrls: [...sourceUrls],
  };
}
