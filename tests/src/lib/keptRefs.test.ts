import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "@/store";
import { currentKeptRefs } from "@/lib/keptRefs";
import type { MontageItem } from "@/store";

const reset = () =>
  useStore.setState({
    projects: [],
    montageProjects: [],
    activeId: null,
    activeMontageId: null,
    route: "home",
    history: {},
  });

const cut = (key: string, jobId: string): MontageItem => ({
  key,
  label: key,
  ref: { kind: "cut", jobId, position: 1 },
});
const upload = (key: string, uploadId: string): MontageItem => ({
  key,
  label: key,
  ref: { kind: "upload", uploadId },
});

beforeEach(reset);

describe("currentKeptRefs", () => {
  it("is empty with no projects or montages", () => {
    expect(currentKeptRefs()).toEqual({
      jobs: [],
      uploads: [],
      compilations: [],
      sourceUrls: [],
    });
  });

  it("collects job ids and trimmed source URLs from projects", () => {
    useStore.setState({
      projects: [
        {
          id: "p1",
          createdAt: "",
          phase: "results",
          sourceUrl: "  https://x.test/v  ",
          infoStatus: "ready",
          cutMode: "precise",
          format: "mp4",
          cuts: [],
          jobId: "job-1",
        },
      ],
    });
    const refs = currentKeptRefs();
    expect(refs.jobs).toEqual(["job-1"]);
    expect(refs.sourceUrls).toEqual(["https://x.test/v"]);
  });

  it("collects compilation ids, upload ids and cut job ids from montages (deduped)", () => {
    useStore.setState({
      montageProjects: [
        {
          id: "m1",
          createdAt: "",
          name: "M",
          items: [cut("a", "job-2"), upload("b", "up-1"), cut("c", "job-2")],
          compilation: { percent: 0, id: "comp-1" },
        },
      ],
    });
    const refs = currentKeptRefs();
    expect(refs.jobs).toEqual(["job-2"]);
    expect(refs.uploads).toEqual(["up-1"]);
    expect(refs.compilations).toEqual(["comp-1"]);
  });
});
