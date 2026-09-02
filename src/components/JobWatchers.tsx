import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store";
import { getJob, subscribeJob } from "../lib/api";
import type { VideoProject } from "../../shared/types";

/**
 * Keeps a live subscription for every project whose job is still running, no
 * matter which project is on screen — so processing continues in the background
 * while you edit or start another cut.
 */
export function JobWatchers() {
  const watched = useStore(
    useShallow((s) =>
      s.projects
        // A project with a jobId but no in-memory job snapshot has just been
        // reloaded — fetch it once so finished results are restored too.
        .filter((p) => p.jobId && (!p.job || (p.job.phase !== "done" && p.job.phase !== "failed")))
        .map((p) => `${p.id}:${p.jobId}`),
    ),
  );

  return (
    <>
      {watched.map((key) => {
        const [projectId, jobId] = key.split(":");
        return <JobWatcher key={key} projectId={projectId} jobId={jobId} />;
      })}
    </>
  );
}

function JobWatcher({ projectId, jobId }: { projectId: string; jobId: string }) {
  const updateJob = useStore((s) => s.updateJob);

  useEffect(() => {
    let alive = true;
    let unsub = () => {};

    getJob(jobId)
      .then((job) => {
        if (!alive) return;
        updateJob(projectId, job);
        if (job.phase === "done" || job.phase === "failed") return;

        unsub = subscribeJob(jobId, (ev) => {
          const cur = useStore.getState().projects.find((p) => p.id === projectId)?.job;
          if (ev.type === "snapshot" || ev.type === "job-done" || ev.type === "job-failed") {
            updateJob(projectId, ev.job);
          } else if (ev.type === "download-progress" && cur) {
            updateJob(projectId, { ...cur, phase: "downloading", downloadPercent: ev.percent });
          } else if (ev.type === "cut-progress" && cur) {
            updateJob(projectId, {
              ...cur,
              phase: "cutting",
              downloadPercent: 100,
              cuts: cur.cuts.map((c) =>
                c.position === ev.position
                  ? { ...c, status: ev.status, percent: ev.percent, error: ev.error }
                  : c,
              ),
            });
          }
        });
      })
      .catch(() => {
        if (!alive) return;
        const p = useStore.getState().projects.find((x) => x.id === projectId);
        if (!p || p.job) return;
        const project: VideoProject = {
          id: jobId,
          sourceUrl: p.sourceUrl,
          title: p.title,
          duration: p.duration,
          thumbnail: p.thumbnail,
          cutMode: p.cutMode,
          cuts: p.cuts,
        };
        updateJob(projectId, {
          id: jobId,
          createdAt: p.createdAt,
          project,
          phase: "failed",
          downloadPercent: 0,
          cuts: [],
          error: "Job não encontrado no servidor (foi reiniciado?). Reprocesse o projeto.",
        });
      });

    return () => {
      alive = false;
      unsub();
    };
  }, [projectId, jobId, updateJob]);

  return null;
}
