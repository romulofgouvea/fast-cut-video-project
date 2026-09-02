import fs from "node:fs";
import path from "node:path";
import type { Compilation } from "../../shared/types";
import { compilationDir, compilationFile, findUpload, outputDir } from "./paths";
import { getJob } from "./jobStore";
import { probeDuration, probeHasAudio } from "./probe";
import { runConcat, type ConcatInput } from "./compile";
import { emit, patchCompilation } from "./compilationStore";

/** Resolve a compilation item to an absolute file path on disk. */
function resolveItemPath(item: Compilation["items"][number]): string | undefined {
  if (item.kind === "upload") return findUpload(item.uploadId);
  const job = getJob(item.jobId);
  const cut = job?.cuts.find((c) => c.position === item.position && c.fileName);
  if (!cut) return undefined;
  const p = path.join(outputDir(item.jobId), cut.fileName);
  return fs.existsSync(p) ? p : undefined;
}

export async function runCompilation(compilation: Compilation): Promise<void> {
  const id = compilation.id;
  const dir = compilationDir(id);
  const out = compilationFile(id);
  fs.mkdirSync(dir, { recursive: true });

  try {
    const inputs: ConcatInput[] = [];
    for (const item of compilation.items) {
      const filePath = resolveItemPath(item);
      if (!filePath) {
        throw new Error(
          item.kind === "upload"
            ? "Um dos arquivos enviados não está mais disponível."
            : "Um dos cortes selecionados não está mais disponível.",
        );
      }
      const [durationSec, hasAudio] = await Promise.all([
        probeDuration(filePath),
        probeHasAudio(filePath),
      ]);
      inputs.push({ path: filePath, durationSec, hasAudio });
    }

    let last = -1;
    await runConcat(inputs, out, (percent) => {
      const rounded = Math.round(percent);
      if (rounded === last) return;
      last = rounded;
      patchCompilation(id, (c) => (c.percent = rounded), {
        type: "progress",
        percent: rounded,
      });
    });

    const done = patchCompilation(id, (c) => {
      c.phase = "done";
      c.percent = 100;
      c.outputPath = out;
    });
    if (done) emit(id, { type: "done", compilation: done });
  } catch (err) {
    const failed = patchCompilation(id, (c) => {
      c.phase = "failed";
      c.error = (err as Error).message;
    });
    if (failed) emit(id, { type: "failed", compilation: failed });
  }
}
