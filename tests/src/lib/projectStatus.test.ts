import { describe, expect, it } from "vitest";
import { describeProject } from "@/lib/projectStatus";
import type { Project } from "@/store";
import type { Job } from "@shared/types";

const base: Project = {
  id: "p",
  createdAt: "",
  phase: "url",
  sourceUrl: "",
  infoStatus: "idle",
  cutMode: "precise",
  format: "mp4",
  cuts: [],
};

const job = (over: Partial<Job>): Job => ({
  id: "p",
  createdAt: "",
  project: { id: "p", sourceUrl: "u", cutMode: "precise", format: "mp4", cuts: [] },
  phase: "downloading",
  downloadPercent: 0,
  cuts: [],
  ...over,
});

describe("describeProject", () => {
  it("labels from name, then title, then a placeholder", () => {
    expect(describeProject({ ...base, name: " My Vid " }).label).toBe("My Vid");
    expect(describeProject({ ...base, title: "The Title" }).label).toBe("The Title");
    expect(describeProject({ ...base, sourceUrl: "http://x" }).label).toBe("Sem título");
    expect(describeProject(base).label).toBe("Novo projeto");
  });

  it("is a draft with no job and no editor phase", () => {
    expect(describeProject(base)).toMatchObject({
      status: "Rascunho",
      tone: "idle",
      running: false,
    });
  });

  it("shows 'Editando' in the editor phase", () => {
    expect(describeProject({ ...base, phase: "editor" }).status).toBe("Editando");
  });

  it("reflects a downloading job", () => {
    const s = describeProject({
      ...base,
      job: job({ phase: "downloading", downloadPercent: 47.4 }),
    });
    expect(s).toMatchObject({ status: "Baixando 47%", tone: "running", running: true });
  });

  it("reflects a cutting job with a done/total count", () => {
    const s = describeProject({
      ...base,
      job: job({
        phase: "cutting",
        cuts: [
          { id: "a", position: 1, fileName: "", status: "done", percent: 100 },
          { id: "b", position: 2, fileName: "", status: "processing", percent: 10 },
        ],
      }),
    });
    expect(s.status).toBe("Cortando 1/2");
    expect(s.running).toBe(true);
  });

  it("reflects done and failed jobs", () => {
    expect(describeProject({ ...base, job: job({ phase: "done" }) })).toMatchObject({
      status: "Pronto",
      tone: "done",
      running: false,
    });
    expect(describeProject({ ...base, job: job({ phase: "failed" }) })).toMatchObject({
      status: "Erro",
      tone: "error",
    });
  });
});
