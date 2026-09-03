import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MontageItem } from "@/store";

const fetchVideoInfo = vi.fn();
vi.mock("@/lib/api", () => ({ fetchVideoInfo: (...a: unknown[]) => fetchVideoInfo(...a) }));

const { useStore, toStored, fromStored, toStoredMontage, fromStoredMontage } =
  await import("@/store");

const s = () => useStore.getState();
const active = () => s().projects.find((p) => p.id === s().activeId)!;
const activeMontage = () => s().montageProjects.find((m) => m.id === s().activeMontageId)!;

beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({
    projects: [],
    activeId: null,
    montageProjects: [],
    activeMontageId: null,
    route: "home",
    history: {},
    pendingStart: null,
    seekTo: undefined,
    getPlayerTime: undefined,
    playerReady: false,
  });
  s().createProject();
});

describe("navigation + lifecycle", () => {
  it("setRoute switches the route", () => {
    s().setRoute("home");
    expect(s().route).toBe("home");
  });

  it("selectProject routes to projects; closeProject clears the active id but keeps route", () => {
    s().setRoute("home");
    s().selectProject(active().id);
    expect(s().route).toBe("projects");
    s().closeProject();
    expect(s().activeId).toBeNull();
    expect(s().route).toBe("projects");
  });

  it("closeMontage clears the active montage id", () => {
    s().createMontageProject("M");
    s().closeMontage();
    expect(s().activeMontageId).toBeNull();
  });

  it("toggleSidebar flips + persists", () => {
    const before = s().sidebarCollapsed;
    s().toggleSidebar();
    expect(s().sidebarCollapsed).toBe(!before);
  });
});

describe("active-project edits", () => {
  it("setUrl unwraps a pasted embed snippet but leaves plain text alone", () => {
    s().setUrl("https://youtu.be/abc123DEF45");
    expect(active().sourceUrl).toBe("https://youtu.be/abc123DEF45");
    s().setUrl('<iframe src="https://www.youtube.com/embed/abc123DEF45"></iframe>');
    expect(active().sourceUrl).toContain("abc123DEF45");
  });

  it("setProjectName / setCutMode / setFormat / setWatermark / goTo mutate the active project", () => {
    s().setProjectName("Nome");
    s().setCutMode("fast");
    s().setFormat("webm");
    s().setWatermark({ text: "x", position: "top-left", opacity: 0.5 });
    s().goTo("results");
    expect(active()).toMatchObject({
      name: "Nome",
      cutMode: "fast",
      format: "webm",
      phase: "results",
      watermark: { text: "x" },
    });
  });

  it("openEditor moves to the editor and lifts a provider id from the URL", () => {
    s().setUrl("https://youtu.be/abc123DEF45");
    s().openEditor();
    expect(active().phase).toBe("editor");
    expect(active().videoId).toBe("abc123DEF45");
  });

  it("duplicateCut on an unknown id is a no-op", () => {
    s().addCut();
    const n = active().cuts.length;
    s().duplicateCut("ghost");
    expect(active().cuts).toHaveLength(n);
  });
});

describe("loadVideoInfo", () => {
  it("stores the fetched metadata and marks the project ready", async () => {
    s().setUrl("https://vimeo.com/12345");
    fetchVideoInfo.mockResolvedValue({ title: "Vid", duration: 120, thumbnail: "t.jpg" });
    await s().loadVideoInfo(active().id);
    expect(active()).toMatchObject({ title: "Vid", duration: 120, infoStatus: "ready" });
  });

  it("records an error and does not throw", async () => {
    s().setUrl("https://vimeo.com/12345");
    fetchVideoInfo.mockRejectedValue(new Error("no metadata"));
    await s().loadVideoInfo(active().id);
    expect(active()).toMatchObject({ infoStatus: "error", infoError: "no metadata" });
  });

  it("bails when the project has no URL or is already loading", async () => {
    await s().loadVideoInfo(active().id); // empty URL
    expect(fetchVideoInfo).not.toHaveBeenCalled();
  });
});

describe("jobs", () => {
  it("attachJob moves the project to 'progress'; updateJob flips to 'results' when finished", () => {
    const id = active().id;
    const job = {
      id: "j",
      createdAt: "",
      project: {
        id,
        sourceUrl: "u",
        cutMode: "precise" as const,
        format: "mp4" as const,
        cuts: [],
      },
      phase: "cutting" as const,
      downloadPercent: 100,
      cuts: [],
    };
    s().attachJob(id, "j", job);
    expect(active()).toMatchObject({ jobId: "j", phase: "progress" });
    s().updateJob(id, { ...job, phase: "done" });
    expect(active().phase).toBe("results");
  });
});

describe("player bridge + mark start/end", () => {
  it("markStart stashes the player time; markEndAndCreate appends a cut", () => {
    let t = 10;
    s().setPlayerBridge(() => t, true);
    s().markStart();
    expect(s().pendingStart).toBe(10);
    t = 25;
    expect(s().markEndAndCreate()).toBeUndefined();
    expect(active().cuts.at(-1)).toMatchObject({ start: "00:00:10", end: "00:00:25" });
    expect(s().pendingStart).toBeNull();
  });

  it("markEndAndCreate rejects an end too close to the start", () => {
    let t = 10;
    s().setPlayerBridge(() => t, true);
    s().markStart();
    t = 10.2;
    expect(s().markEndAndCreate()).toMatch(/1s/);
  });

  it("clearPendingStart resets the pending mark", () => {
    s().setPlayerBridge(() => 5, true);
    s().markStart();
    s().clearPendingStart();
    expect(s().pendingStart).toBeNull();
  });

  it("setSeekTo stores the seek bridge", () => {
    const fn = vi.fn();
    s().setSeekTo(fn);
    expect(s().seekTo).toBe(fn);
  });
});

describe("montage timeline ops", () => {
  const item = (key: string): MontageItem => ({
    key,
    label: key,
    ref: { kind: "cut", jobId: "J", position: 1 },
  });

  beforeEach(() => s().createMontageProject("M"));

  it("addMontageItem ignores a duplicate key", () => {
    s().addMontageItem(item("a"));
    s().addMontageItem(item("a"));
    expect(activeMontage().items).toHaveLength(1);
  });

  it("removeMontageItem drops by key", () => {
    s().addMontageItem(item("a"));
    s().addMontageItem(item("b"));
    s().removeMontageItem("a");
    expect(activeMontage().items.map((i) => i.key)).toEqual(["b"]);
  });

  it("moveMontageItem shifts within bounds only", () => {
    ["a", "b", "c"].forEach((k) => s().addMontageItem(item(k)));
    s().moveMontageItem("a", 1);
    expect(activeMontage().items.map((i) => i.key)).toEqual(["b", "a", "c"]);
    s().moveMontageItem("b", -1); // already first -> no-op
    expect(activeMontage().items.map((i) => i.key)).toEqual(["b", "a", "c"]);
  });

  it("reorderMontage drops the dragged clip onto the target slot", () => {
    ["a", "b", "c"].forEach((k) => s().addMontageItem(item(k)));
    s().reorderMontage("c", "a");
    expect(activeMontage().items.map((i) => i.key)).toEqual(["c", "a", "b"]);
    s().reorderMontage("x", "a"); // unknown -> no-op
    expect(activeMontage().items.map((i) => i.key)).toEqual(["c", "a", "b"]);
  });

  it("setCompilation + patchMontageCompilation merge into compilation state", () => {
    s().setCompilation({ id: "c1", phase: "processing", percent: 10 });
    expect(activeMontage().compilation).toMatchObject({ id: "c1", percent: 10 });
    s().patchMontageCompilation(activeMontage().id, { percent: 80 });
    expect(activeMontage().compilation.percent).toBe(80);
  });

  it("clearMontage empties items and resets the compilation", () => {
    s().addMontageItem(item("a"));
    s().setCompilation({ id: "c1", percent: 50 });
    s().clearMontage();
    expect(activeMontage().items).toHaveLength(0);
    expect(activeMontage().compilation).toEqual({ percent: 0 });
  });
});

describe("history coalescing", () => {
  it("merges rapid edits to the same field into one undo frame", () => {
    s().addCut();
    const id = active().cuts[0].id;
    s().updateCut(id, { start: "00:00:01" });
    s().updateCut(id, { start: "00:00:02" });
    s().updateCut(id, { start: "00:00:03" });
    s().undo(); // one frame back -> before any start edit
    expect(active().cuts[0].start).toBe("00:00:00");
  });
});

describe("persist round-trip", () => {
  it("toStored/fromStored + montage survive a serialize cycle", () => {
    s().setUrl("https://youtu.be/abc123DEF45");
    s().setCutMode("fast");
    s().addCutFromSeconds(0, 30);
    s().createMontageProject("M");
    s().addMontageItem({ key: "k", label: "k", ref: { kind: "cut", jobId: "J", position: 1 } });
    s().setCompilation({ id: "comp-1", phase: "done", percent: 100 });

    const proj = fromStored(toStored(active()));
    expect(proj).toMatchObject({ sourceUrl: "https://youtu.be/abc123DEF45", cutMode: "fast" });

    const m = fromStoredMontage(toStoredMontage(activeMontage()));
    expect(m.items).toHaveLength(1);
    expect(m.compilation.id).toBe("comp-1");
  });
});
