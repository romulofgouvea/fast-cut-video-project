import { beforeEach, describe, expect, it } from "vitest";
import {
  useStore,
  toStored,
  fromStored,
  toStoredMontage,
  fromStoredMontage,
  montageBaseName,
} from "@/store";
import type { MontageItem } from "@/store";

const s = () => useStore.getState();

beforeEach(() => {
  useStore.setState({
    projects: [],
    activeId: null,
    montageProjects: [],
    activeMontageId: null,
    route: "home",
    history: {},
  });
  s().createProject();
});

const cutItem = (key: string, jobId = "J"): MontageItem => ({
  key,
  label: key,
  ref: { kind: "cut", jobId, position: 1 },
});

const activeCuts = () => s().projects.find((p) => p.id === s().activeId)!.cuts;

describe("cut ID rules (RF-01..RF-05) on the active project", () => {
  it("RF-01: every new cut gets a unique auto-generated id", () => {
    s().addCut();
    s().addCut();
    const cuts = activeCuts();
    expect(cuts).toHaveLength(2);
    expect(cuts[0].id).toBeTruthy();
    expect(cuts[0].id).not.toBe(cuts[1].id);
  });

  it("RF-03: editing a cut's times keeps its id", () => {
    s().addCut();
    const id = activeCuts()[0].id;
    s().updateCut(id, { start: "00:05:00", end: "00:06:00" });
    const cut = activeCuts()[0];
    expect(cut.id).toBe(id);
    expect(cut.start).toBe("00:05:00");
  });

  it("RF-04: removing a cut does not change the others' ids", () => {
    s().addCut();
    s().addCut();
    s().addCut();
    const [a, b, c] = activeCuts().map((x) => x.id);
    s().removeCut(b);
    expect(activeCuts().map((x) => x.id)).toEqual([a, c]);
  });

  it("RF-05: duplicating a cut assigns a new id but copies the times", () => {
    s().addCut();
    const orig = activeCuts()[0];
    s().updateCut(orig.id, { start: "00:01:00", end: "00:02:30" });
    s().duplicateCut(orig.id);
    const cuts = activeCuts();
    expect(cuts).toHaveLength(2);
    expect(cuts[1].id).not.toBe(cuts[0].id);
    expect(cuts[1].start).toBe("00:01:00");
    expect(cuts[1].end).toBe("00:02:30");
  });
});

describe("addCut default span", () => {
  it("spans the whole video when the duration is known", () => {
    useStore.setState({
      projects: s().projects.map((p) => (p.id === s().activeId ? { ...p, duration: 754 } : p)),
    });
    s().addCut();
    expect(activeCuts()[0]).toMatchObject({ start: "00:00:00", end: "00:12:34" });
  });

  it("falls back to 1 min when the duration is unknown", () => {
    s().addCut();
    expect(activeCuts()[0]).toMatchObject({ start: "00:00:00", end: "00:01:00" });
  });
});

describe("addCutFromSeconds (mark start / mark end)", () => {
  it("appends a cut with zero-padded HH:MM:SS, ordered start→end", () => {
    s().addCutFromSeconds(83, 12);
    const cut = activeCuts().at(-1)!;
    expect(cut.start).toBe("00:00:12");
    expect(cut.end).toBe("00:01:23");
  });
});

describe("undo / redo of the cut list", () => {
  it("steps structural changes back and forward", () => {
    s().addCut();
    s().addCut();
    s().addCut();
    expect(activeCuts()).toHaveLength(3);

    s().undo();
    expect(activeCuts()).toHaveLength(2);
    s().undo();
    expect(activeCuts()).toHaveLength(1);

    s().redo();
    expect(activeCuts()).toHaveLength(2);

    // a fresh edit clears the redo stack
    s().addCut();
    expect(activeCuts()).toHaveLength(3);
    s().redo();
    expect(activeCuts()).toHaveLength(3);
  });

  it("is a no-op with nothing to undo", () => {
    expect(() => s().undo()).not.toThrow();
    expect(activeCuts()).toHaveLength(0);
  });

  it("keeps history per project", () => {
    const first = s().activeId!;
    s().addCut();
    s().createProject();
    s().addCut();
    s().addCut();
    s().undo();
    expect(activeCuts()).toHaveLength(1);
    s().selectProject(first);
    s().undo();
    expect(activeCuts()).toHaveLength(0);
  });
});

describe("persisted project model ({id,url,isLow,cuts:[{init,end}]})", () => {
  it("toStored maps to the minimal model", () => {
    s().setUrl("https://youtu.be/abc123DEF45");
    s().setCutMode("fast");
    s().addCutFromSeconds(0, 90);
    const project = s().projects.find((p) => p.id === s().activeId)!;

    expect(toStored(project)).toMatchObject({
      id: project.id,
      url: "https://youtu.be/abc123DEF45",
      isLow: true,
      cuts: [{ init: "00:00:00", end: "00:01:30" }],
    });
  });

  it("fromStored round-trips url, mode and cut times", () => {
    const restored = fromStored({
      id: "p1",
      url: "https://youtu.be/x",
      isLow: false,
      cuts: [{ init: "00:00:05", end: "00:00:10" }],
    });
    expect(restored.sourceUrl).toBe("https://youtu.be/x");
    expect(restored.cutMode).toBe("precise");
    expect(restored.phase).toBe("editor");
    expect(restored.cuts[0]).toMatchObject({ start: "00:00:05", end: "00:00:10" });
    expect(restored.cuts[0].id).toBeTruthy();
  });
});

describe("sidebar collapse", () => {
  it("toggleSidebar flips the flag", () => {
    const start = s().sidebarCollapsed;
    s().toggleSidebar();
    expect(s().sidebarCollapsed).toBe(!start);
    s().toggleSidebar();
    expect(s().sidebarCollapsed).toBe(start);
  });
});

describe("multiple projects", () => {
  it("keeps projects isolated and switches the active one", () => {
    const first = s().activeId!;
    s().addCut();
    s().createProject();
    const second = s().activeId!;
    expect(second).not.toBe(first);
    expect(activeCuts()).toHaveLength(0);

    s().selectProject(first);
    expect(activeCuts()).toHaveLength(1);
  });

  it("removeProject clears the active project (back to the gallery)", () => {
    const first = s().activeId!;
    s().createProject();
    const second = s().activeId!;
    s().removeProject(second);
    expect(s().activeId).toBeNull();
    expect(s().projects).toHaveLength(1);
    s().selectProject(first);
    expect(s().activeId).toBe(first);
  });
});

describe("routing", () => {
  it("createProject routes to the projects flow", () => {
    useStore.setState({ route: "home" });
    s().createProject();
    expect(s().route).toBe("projects");
  });

  it("createMontageProject routes to the montage flow", () => {
    s().createMontageProject();
    expect(s().route).toBe("montage");
  });
});

describe("montage projects", () => {
  it("create / select / rename / remove lifecycle", () => {
    s().createMontageProject("A");
    expect(s().montageProjects).toHaveLength(1);
    const a = s().activeMontageId!;
    expect(s().montageProjects[0].name).toBe("A");

    s().createMontageProject("B");
    const b = s().activeMontageId!;
    expect(b).not.toBe(a);

    s().selectMontageProject(a);
    expect(s().activeMontageId).toBe(a);

    s().renameMontageProject(a, "Renamed");
    expect(s().montageProjects.find((m) => m.id === a)!.name).toBe("Renamed");

    s().removeMontageProject(a);
    expect(s().activeMontageId).toBeNull();
    expect(s().montageProjects).toHaveLength(1);
  });

  it("keeps each montage's timeline isolated", () => {
    s().createMontageProject("A");
    const a = s().activeMontageId!;
    s().addMontageItem(cutItem("cut:J:1"));
    s().createMontageProject("B");
    s().addMontageItem(cutItem("cut:K:1", "K"));

    const items = (id: string) => s().montageProjects.find((m) => m.id === id)!.items;
    expect(items(a).map((i) => i.key)).toEqual(["cut:J:1"]);
    expect(
      s()
        .montageProjects.find((m) => m.name === "B")!
        .items.map((i) => i.key),
    ).toEqual(["cut:K:1"]);

    // clear only touches the active montage
    s().clearMontage();
    expect(s().montageProjects.find((m) => m.name === "B")!.items).toHaveLength(0);
    expect(items(a)).toHaveLength(1);
  });

  it("pruneMontageJob sweeps every montage; uploads survive", () => {
    s().createMontageProject("A");
    s().addMontageItem(cutItem("cut:J:1"));
    s().addMontageItem({ key: "upload:U", label: "file", ref: { kind: "upload", uploadId: "U" } });
    s().createMontageProject("B");
    s().addMontageItem(cutItem("cut:J:1"));

    s().pruneMontageJob("J");

    for (const m of s().montageProjects) {
      expect(m.items.every((i) => i.ref.kind !== "cut")).toBe(true);
    }
    expect(
      s()
        .montageProjects.find((m) => m.name === "A")!
        .items.map((i) => i.key),
    ).toEqual(["upload:U"]);
  });

  it("montageBaseName prefers the user's name, then a shared source, then nothing", () => {
    const item = (sub?: string): MontageItem => ({
      key: `k${Math.random()}`,
      label: "clip",
      sub,
      ref: { kind: "cut", jobId: "J", position: 1 },
    });
    // explicit name always wins
    expect(montageBaseName({ name: "  My Montage ", items: [item("Vid A")] })).toBe("My Montage");
    // no name, every clip from the same source -> that source
    expect(
      montageBaseName({ name: undefined, items: [item("Lofi Beats"), item("Lofi Beats")] }),
    ).toBe("Lofi Beats");
    // no name, clips from different sources -> undefined (caller falls back to "montagem")
    expect(
      montageBaseName({ name: undefined, items: [item("Vid A"), item("Vid B")] }),
    ).toBeUndefined();
    // no name, no subs -> undefined
    expect(montageBaseName({ name: undefined, items: [item(), item()] })).toBeUndefined();
  });

  it("stored round-trip keeps id/name/items and compilationId -> compilation.id", () => {
    s().createMontageProject("A");
    s().addMontageItem(cutItem("cut:J:1"));
    s().setCompilation({ id: "comp-1", phase: "done", percent: 100 });
    const mp = s().montageProjects[0];

    const back = fromStoredMontage(toStoredMontage(mp));
    expect(back.id).toBe(mp.id);
    expect(back.name).toBe("A");
    expect(back.items.map((i) => i.key)).toEqual(["cut:J:1"]);
    expect(back.compilation.id).toBe("comp-1");
  });
});
