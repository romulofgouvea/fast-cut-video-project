import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  CompilationItem,
  CompilationPhase,
  CutMode,
  Job,
  OutputFormat,
  VideoCut,
  Watermark,
} from "../shared/types";
import { formatTimecode } from "../shared/time";
import { extractYouTubeId } from "../shared/youtube";
import { detectSource, extractSourceUrl } from "../shared/videoSource";
import { fetchVideoInfo } from "./lib/api";
import { getStoredSidebarCollapsed, storeSidebarCollapsed } from "./lib/sidebar";
import { uuid } from "./lib/uuid";
import { isTauri } from "./lib/platform";
import { desktopStorage } from "./lib/desktopStorage";

export type ProjectPhase = "url" | "editor" | "progress" | "results";

/** Progress of the (slow) yt-dlp metadata fetch, which runs after the player is up. */
export type InfoStatus = "idle" | "loading" | "ready" | "error";

/** One video being cut. Several can exist at once; each gets its own job. */
export type Project = {
  id: string;
  createdAt: string;
  phase: ProjectPhase;
  sourceUrl: string;
  /** User-given project name (overrides `title` for labels and file names). */
  name?: string;
  title?: string;
  duration?: number;
  thumbnail?: string;
  videoId?: string;
  infoStatus: InfoStatus;
  infoError?: string;
  cutMode: CutMode;
  format: OutputFormat;
  watermark?: Watermark;
  cuts: VideoCut[];
  jobId?: string; // set once "Processar" is clicked
  job?: Job; // latest snapshot from SSE / poll
};

/**
 * Shape persisted to localStorage (key `yt-cut-projects`). Deliberately minimal —
 * just enough to rebuild a project after a reload. Runtime-only fields (job
 * progress, player bridge) are not stored.
 */
export type StoredCut = { init: string; end: string; name?: string };
export type StoredProject = {
  id: string;
  url: string;
  isLow: boolean; // true = modo "rápido" (-c copy); false = "preciso" (re-encode)
  cuts: StoredCut[];
  name?: string;
  // kept so the restored editor still shows the video + validates against duration
  title?: string;
  duration?: number;
  thumbnail?: string;
  videoId?: string;
  format?: OutputFormat;
  watermark?: Watermark;
  // last processing run, so results survive a reload (job snapshot is re-fetched)
  jobId?: string;
};

/** A fresh cut spanning the whole video (falls back to 1 min when duration is unknown). */
const emptyCut = (duration?: number): VideoCut => ({
  id: uuid(),
  start: "00:00:00",
  end: duration && duration > 0 ? formatTimecode(duration) : "00:01:00",
});

export const toStored = (p: Project): StoredProject => ({
  id: p.id,
  url: p.sourceUrl,
  isLow: p.cutMode === "fast",
  cuts: p.cuts.map((c) => ({ init: c.start, end: c.end, name: c.name })),
  name: p.name,
  title: p.title,
  duration: p.duration,
  thumbnail: p.thumbnail,
  videoId: p.videoId,
  format: p.format === "mp4" ? undefined : p.format,
  watermark: p.watermark,
  jobId: p.jobId,
});

export const fromStored = (sp: StoredProject): Project => {
  const url = sp.url ?? "";
  return {
    id: sp.id,
    createdAt: new Date().toISOString(),
    phase: sp.jobId ? "progress" : sp.cuts.length > 0 || sp.videoId ? "editor" : "url",
    sourceUrl: url,
    name: sp.name,
    title: sp.title,
    duration: sp.duration,
    thumbnail: sp.thumbnail,
    videoId: sp.videoId ?? extractYouTubeId(url) ?? undefined,
    infoStatus: sp.duration !== undefined ? "ready" : "idle",
    cutMode: sp.isLow ? "fast" : "precise",
    format: sp.format ?? "mp4",
    watermark: sp.watermark,
    cuts: sp.cuts.map((c) => ({
      id: uuid(),
      start: c.init,
      end: c.end,
      name: c.name,
    })),
    jobId: sp.jobId,
  };
};

const makeProject = (): Project => ({
  id: uuid(),
  createdAt: new Date().toISOString(),
  phase: "url",
  sourceUrl: "",
  infoStatus: "idle",
  cutMode: "precise",
  format: "mp4",
  cuts: [],
});

/** A clip staged on the montage timeline. */
export type MontageItem = {
  key: string;
  label: string;
  sub?: string;
  ref: CompilationItem;
};

export type CompilationState = {
  id?: string;
  phase?: CompilationPhase;
  percent: number;
  error?: string;
};

/** One saved montage project: its own name, timeline and last compilation run. */
export type MontageProject = {
  id: string;
  createdAt: string;
  name?: string;
  items: MontageItem[];
  compilation: CompilationState;
};

/** Persisted shape of a montage project (key `yt-cut-projects`, v2). */
export type StoredMontageProject = {
  id: string;
  createdAt: string;
  name?: string;
  items: MontageItem[]; // MontageItem is already fully serializable
  compilationId?: string; // last compilation generated — re-hydrates status on load
};

export const toStoredMontage = (m: MontageProject): StoredMontageProject => ({
  id: m.id,
  createdAt: m.createdAt,
  name: m.name,
  items: m.items,
  compilationId: m.compilation.id,
});

export const fromStoredMontage = (sm: StoredMontageProject): MontageProject => ({
  id: sm.id,
  createdAt: sm.createdAt ?? new Date().toISOString(),
  name: sm.name,
  items: sm.items ?? [],
  // Real phase/percent come back via <MontageWatchers/> once mounted.
  compilation: { percent: 0, id: sm.compilationId },
});

const makeMontageProject = (name?: string): MontageProject => ({
  id: uuid(),
  createdAt: new Date().toISOString(),
  name: name?.trim() || undefined,
  items: [],
  compilation: { percent: 0 },
});

/** Top-level route. The montage flow's token is "montage" (label "Editor" in the UI). */
export type AppRoute = "home" | "projects" | "montage";

type State = {
  projects: Project[];
  activeId: string | null;
  /** Current top-level route. Not persisted — the app always opens on the Home. */
  route: AppRoute;
  /** Whether the left sidebar is collapsed (persisted via its own localStorage key). */
  sidebarCollapsed: boolean;
  /** Set by the preview player so any component can jump playback to a timecode. */
  seekTo?: (seconds: number) => void;
  /** Bridge to the preview player's current time (seconds), set while it is mounted. */
  getPlayerTime?: () => number | undefined;
  /** Whether the preview player is loaded and ready to be queried. */
  playerReady: boolean;
  /** Pending "mark start" timestamp waiting for a matching "mark end". */
  pendingStart: number | null;

  /** Per-project undo/redo stacks of the cut list (runtime only, not persisted). */
  history: Record<string, { past: VideoCut[][]; future: VideoCut[][] }>;

  // montage projects (each with its own name + timeline + last compilation run)
  montageProjects: MontageProject[];
  activeMontageId: string | null;

  // navigation
  setRoute: (route: AppRoute) => void;
  toggleSidebar: () => void;

  // project lifecycle
  createProject: () => void;
  selectProject: (id: string) => void;
  removeProject: (id: string) => void;
  /** Leave the open project and return to the projects gallery (keeps `route`). */
  closeProject: () => void;

  // montage-project lifecycle
  createMontageProject: (name?: string) => void;
  selectMontageProject: (id: string) => void;
  removeMontageProject: (id: string) => void;
  renameMontageProject: (id: string, name: string) => void;
  /** Leave the open montage and return to the montage gallery (keeps `route`). */
  closeMontage: () => void;
  /** Patch a specific montage's compilation state (used by <MontageWatchers/>). */
  patchMontageCompilation: (montageId: string, patch: Partial<CompilationState>) => void;

  // active-project edits
  setUrl: (url: string) => void;
  setProjectName: (name: string) => void;
  /** Move to the editor; the preview figures out the source from `sourceUrl`. */
  openEditor: () => void;
  /** Kick off the slow yt-dlp metadata fetch for a project (title/duration/thumb). */
  loadVideoInfo: (projectId: string) => Promise<void>;
  setCutMode: (mode: CutMode) => void;
  setFormat: (format: OutputFormat) => void;
  setWatermark: (watermark: Watermark | undefined) => void;
  addCut: () => void;
  /** Append a cut from raw seconds (used by the "mark start / mark end" buttons). */
  addCutFromSeconds: (startSec: number, endSec: number) => void;
  updateCut: (cutId: string, patch: Partial<Pick<VideoCut, "start" | "end" | "name">>) => void;
  removeCut: (cutId: string) => void;
  duplicateCut: (cutId: string) => void;
  /** Step the active project's cut list back / forward through its history. */
  undo: () => void;
  redo: () => void;
  goTo: (phase: ProjectPhase) => void;

  // jobs (keyed by project id, run in the background)
  attachJob: (projectId: string, jobId: string, job: Job) => void;
  updateJob: (projectId: string, job: Job) => void;

  setSeekTo: (fn?: (seconds: number) => void) => void;
  setPlayerBridge: (getTime?: () => number | undefined, ready?: boolean) => void;
  /** Stash the current player time as the start of the next cut. */
  markStart: () => void;
  /** Close the pending cut at the current player time. Returns an error message when invalid. */
  markEndAndCreate: () => string | undefined;
  clearPendingStart: () => void;

  // montage timeline
  addMontageItem: (item: MontageItem) => void;
  removeMontageItem: (key: string) => void;
  /** Drop every timeline clip that came from a given job (used when it is re-processed). */
  pruneMontageJob: (jobId: string) => void;
  moveMontageItem: (key: string, dir: -1 | 1) => void;
  /** Drag-and-drop reorder: drop the dragged clip onto the target clip's slot. */
  reorderMontage: (fromKey: string, toKey: string) => void;
  clearMontage: () => void;
  setCompilation: (patch: Partial<CompilationState>) => void;
};

const mapById = (projects: Project[], id: string | null, fn: (p: Project) => Project) =>
  projects.map((p) => (p.id === id ? fn(p) : p));

/**
 * Where the persisted project list lives:
 *  - desktop (Tauri)  → SQLite key/value table (./lib/desktopStorage)
 *  - browser / Docker → localStorage
 *  - tests / SSR      → in-memory no-op
 */
const appStorage = createJSONStorage(() => {
  if (isTauri()) return desktopStorage;
  if (typeof localStorage !== "undefined") return localStorage;
  return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
});

export const useStore = create<State>()(
  persist(
    (set, get) => {
      /** Apply `fn` to the active project. */
      const editActive = (fn: (p: Project) => Project) =>
        set((s) => ({ projects: mapById(s.projects, s.activeId, fn) }));
      const editById = (id: string, fn: (p: Project) => Project) =>
        set((s) => ({ projects: mapById(s.projects, id, fn) }));

      // Undo/redo for the cut list. Rapid edits to the same field coalesce into
      // one history frame; structural changes (add/remove/…) always push one.
      let lastEditKey = "";
      let lastEditAt = 0;
      const HISTORY_CAP = 60;
      const pushHistory = (s: State, editKey: string): State["history"] => {
        const id = s.activeId;
        const proj = id ? s.projects.find((p) => p.id === id) : undefined;
        if (!id || !proj) return s.history;
        const now = Date.now();
        const coalesce =
          editKey.startsWith("update:") && editKey === lastEditKey && now - lastEditAt < 700;
        lastEditKey = editKey;
        lastEditAt = now;
        if (coalesce) return s.history;
        const cur = s.history[id] ?? { past: [], future: [] };
        return {
          ...s.history,
          [id]: { past: [...cur.past, proj.cuts].slice(-HISTORY_CAP), future: [] },
        };
      };
      /** Mutate the active project's cuts and record a history frame. */
      const editCuts = (editKey: string, fn: (p: Project) => Project) =>
        set((s) => ({
          history: pushHistory(s, editKey),
          projects: mapById(s.projects, s.activeId, fn),
        }));

      /** Apply `fn` to the active montage project. */
      const editActiveMontage = (fn: (m: MontageProject) => MontageProject) =>
        set((s) => ({
          montageProjects: s.montageProjects.map((m) => (m.id === s.activeMontageId ? fn(m) : m)),
        }));

      return {
        projects: [],
        activeId: null,
        route: "home",
        sidebarCollapsed: getStoredSidebarCollapsed(),
        playerReady: false,
        pendingStart: null,
        history: {},
        montageProjects: [],
        activeMontageId: null,

        setRoute: (route) => set({ route }),

        toggleSidebar: () =>
          set((s) => {
            const sidebarCollapsed = !s.sidebarCollapsed;
            storeSidebarCollapsed(sidebarCollapsed);
            return { sidebarCollapsed };
          }),

        createProject: () =>
          set((s) => {
            const p = makeProject();
            return { projects: [...s.projects, p], activeId: p.id, route: "projects" };
          }),

        selectProject: (id) => set({ activeId: id, route: "projects" }),

        removeProject: (id) =>
          set((s) => {
            const projects = s.projects.filter((p) => p.id !== id);
            const activeId = s.activeId === id ? null : s.activeId;
            const history = { ...s.history };
            delete history[id];
            return { projects, activeId, history };
          }),

        closeProject: () => set({ activeId: null }),

        createMontageProject: (name) =>
          set((s) => {
            const m = makeMontageProject(name);
            return {
              montageProjects: [...s.montageProjects, m],
              activeMontageId: m.id,
              route: "montage",
            };
          }),

        selectMontageProject: (id) => set({ activeMontageId: id, route: "montage" }),

        removeMontageProject: (id) =>
          set((s) => ({
            montageProjects: s.montageProjects.filter((m) => m.id !== id),
            activeMontageId: s.activeMontageId === id ? null : s.activeMontageId,
          })),

        renameMontageProject: (id, name) =>
          set((s) => ({
            montageProjects: s.montageProjects.map((m) =>
              m.id === id ? { ...m, name: name.trim() || undefined } : m,
            ),
          })),

        closeMontage: () => set({ activeMontageId: null }),

        patchMontageCompilation: (montageId, patch) =>
          set((s) => ({
            montageProjects: s.montageProjects.map((m) =>
              m.id === montageId ? { ...m, compilation: { ...m.compilation, ...patch } } : m,
            ),
          })),

        // Unwrap a pasted embed snippet (<iframe>, <blockquote>, <script>, …) to
        // its canonical URL on the spot; leave normal typing alone.
        setUrl: (sourceUrl) =>
          editActive((p) => ({
            ...p,
            sourceUrl: sourceUrl.includes("<") ? extractSourceUrl(sourceUrl) : sourceUrl,
          })),

        setProjectName: (name) => editActive((p) => ({ ...p, name })),

        openEditor: () =>
          editActive((p) => ({
            ...p,
            videoId: detectSource(p.sourceUrl).id ?? p.videoId,
            phase: "editor",
            infoStatus: p.infoStatus === "ready" ? "ready" : "idle",
            infoError: undefined,
          })),

        loadVideoInfo: async (projectId) => {
          const p = get().projects.find((x) => x.id === projectId);
          if (!p || p.infoStatus === "loading" || !p.sourceUrl.trim()) return;
          editById(projectId, (x) => ({ ...x, infoStatus: "loading", infoError: undefined }));
          try {
            const info = await fetchVideoInfo(p.sourceUrl.trim());
            editById(projectId, (x) => ({
              ...x,
              title: info.title,
              duration: info.duration,
              thumbnail: info.thumbnail,
              videoId: detectSource(x.sourceUrl).id ?? x.videoId ?? info.videoId ?? undefined,
              infoStatus: "ready",
              infoError: undefined,
            }));
          } catch (err) {
            editById(projectId, (x) => ({
              ...x,
              infoStatus: "error",
              infoError: (err as Error).message,
            }));
          }
        },

        setCutMode: (cutMode) => editActive((p) => ({ ...p, cutMode })),

        setFormat: (format) => editActive((p) => ({ ...p, format })),

        setWatermark: (watermark) => editActive((p) => ({ ...p, watermark })),

        addCut: () =>
          editCuts("add", (p) => ({ ...p, cuts: [...p.cuts, emptyCut(p.duration)] })),

        addCutFromSeconds: (startSec, endSec) =>
          editCuts("mark", (p) => ({
            ...p,
            cuts: [
              ...p.cuts,
              {
                id: uuid(),
                start: formatTimecode(Math.min(startSec, endSec)),
                end: formatTimecode(Math.max(startSec, endSec)),
              },
            ],
          })),

        updateCut: (cutId, patch) =>
          editCuts(`update:${cutId}:${Object.keys(patch).join(",")}`, (p) => ({
            ...p,
            cuts: p.cuts.map((c) => (c.id === cutId ? { ...c, ...patch } : c)),
          })),

        removeCut: (cutId) =>
          editCuts("remove", (p) => ({ ...p, cuts: p.cuts.filter((c) => c.id !== cutId) })),

        duplicateCut: (cutId) =>
          editCuts("duplicate", (p) => {
            const idx = p.cuts.findIndex((c) => c.id === cutId);
            if (idx === -1) return p;
            const copy: VideoCut = { ...p.cuts[idx], id: uuid() };
            const cuts = [...p.cuts];
            cuts.splice(idx + 1, 0, copy);
            return { ...p, cuts };
          }),

        undo: () =>
          set((s) => {
            const id = s.activeId;
            const proj = id ? s.projects.find((p) => p.id === id) : undefined;
            const h = id ? s.history[id] : undefined;
            if (!id || !proj || !h || h.past.length === 0) return s;
            lastEditKey = "";
            const past = h.past.slice();
            const prev = past.pop()!;
            return {
              history: {
                ...s.history,
                [id]: { past, future: [proj.cuts, ...h.future].slice(0, HISTORY_CAP) },
              },
              projects: mapById(s.projects, id, (p) => ({ ...p, cuts: prev })),
            };
          }),

        redo: () =>
          set((s) => {
            const id = s.activeId;
            const proj = id ? s.projects.find((p) => p.id === id) : undefined;
            const h = id ? s.history[id] : undefined;
            if (!id || !proj || !h || h.future.length === 0) return s;
            lastEditKey = "";
            const [next, ...future] = h.future;
            return {
              history: {
                ...s.history,
                [id]: { past: [...h.past, proj.cuts].slice(-HISTORY_CAP), future },
              },
              projects: mapById(s.projects, id, (p) => ({ ...p, cuts: next })),
            };
          }),

        goTo: (phase) => editActive((p) => ({ ...p, phase })),

        attachJob: (projectId, jobId, job) =>
          set((s) => ({
            projects: mapById(s.projects, projectId, (p) => ({
              ...p,
              jobId,
              job,
              phase: "progress",
            })),
          })),

        updateJob: (projectId, job) =>
          set((s) => ({
            projects: mapById(s.projects, projectId, (p) => ({
              ...p,
              job,
              phase:
                (job.phase === "done" || job.phase === "failed") && p.phase === "progress"
                  ? "results"
                  : p.phase,
            })),
          })),

        setSeekTo: (fn) => set({ seekTo: fn }),

        setPlayerBridge: (getTime, ready = false) =>
          set({ getPlayerTime: getTime, playerReady: ready }),

        markStart: () => {
          const t = get().getPlayerTime?.();
          if (typeof t === "number") set({ pendingStart: t });
        },

        markEndAndCreate: () => {
          const { pendingStart, getPlayerTime } = get();
          const end = getPlayerTime?.();
          if (pendingStart === null || typeof end !== "number") return;
          if (end - pendingStart < 0.5) {
            return "O fim precisa ser pelo menos ~1s depois do início.";
          }
          get().addCutFromSeconds(pendingStart, end);
          set({ pendingStart: null });
          return undefined;
        },

        clearPendingStart: () => set({ pendingStart: null }),

        addMontageItem: (item) =>
          editActiveMontage((m) =>
            m.items.some((it) => it.key === item.key)
              ? m
              : { ...m, items: [...m.items, item] },
          ),

        removeMontageItem: (key) =>
          editActiveMontage((m) => ({ ...m, items: m.items.filter((it) => it.key !== key) })),

        pruneMontageJob: (jobId) =>
          set((s) => {
            let changed = false;
            const montageProjects = s.montageProjects.map((m) => {
              const items = m.items.filter(
                (it) => !(it.ref.kind === "cut" && it.ref.jobId === jobId),
              );
              if (items.length === m.items.length) return m;
              changed = true;
              return { ...m, items };
            });
            return changed ? { montageProjects } : s;
          }),

        moveMontageItem: (key, dir) =>
          editActiveMontage((m) => {
            const idx = m.items.findIndex((it) => it.key === key);
            const next = idx + dir;
            if (idx === -1 || next < 0 || next >= m.items.length) return m;
            const items = [...m.items];
            [items[idx], items[next]] = [items[next], items[idx]];
            return { ...m, items };
          }),

        reorderMontage: (fromKey, toKey) =>
          editActiveMontage((m) => {
            if (fromKey === toKey) return m;
            const from = m.items.findIndex((it) => it.key === fromKey);
            const to = m.items.findIndex((it) => it.key === toKey);
            if (from === -1 || to === -1) return m;
            const items = [...m.items];
            const [moved] = items.splice(from, 1);
            items.splice(to, 0, moved);
            return { ...m, items };
          }),

        clearMontage: () =>
          editActiveMontage((m) => ({ ...m, items: [], compilation: { percent: 0 } })),

        setCompilation: (patch) =>
          editActiveMontage((m) => ({ ...m, compilation: { ...m.compilation, ...patch } })),
      };
    },
    {
      name: "yt-cut-projects",
      version: 2,
      storage: appStorage,
      // No-op: `merge` below rebuilds the shape. This only silences zustand's
      // version-mismatch warning for users coming from v1.
      migrate: (persisted) => persisted as State,
      partialize: (s) => ({
        projects: s.projects.map(toStored),
        activeId: s.activeId,
        montageProjects: s.montageProjects.map(toStoredMontage),
        activeMontageId: s.activeMontageId,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as {
          projects?: StoredProject[];
          activeId?: string | null;
          montageProjects?: StoredMontageProject[];
          activeMontageId?: string | null;
        };
        const projects = (saved.projects ?? []).map(fromStored);
        const montageProjects = (saved.montageProjects ?? []).map(fromStoredMontage);
        const activeId =
          saved.activeId && projects.some((p) => p.id === saved.activeId) ? saved.activeId : null;
        const activeMontageId =
          saved.activeMontageId && montageProjects.some((m) => m.id === saved.activeMontageId)
            ? saved.activeMontageId
            : null;
        return { ...current, projects, activeId, montageProjects, activeMontageId, route: "home" };
      },
    },
  ),
);

/** The project currently shown in the editor, or null when none is open. */
export const useActiveProject = (): Project | null =>
  useStore((s) => s.projects.find((p) => p.id === s.activeId) ?? null);

/** The montage project currently open, or null when none is (= show the gallery). */
export const useActiveMontage = (): MontageProject | null =>
  useStore((s) => s.montageProjects.find((m) => m.id === s.activeMontageId) ?? null);
