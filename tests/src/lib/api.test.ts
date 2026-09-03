import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/lib/api";

const jsonRes = (body: unknown, ok = true, status = 200) =>
  ({
    ok,
    status,
    json: async () => body,
  }) as Response;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("URL builders", () => {
  it("build the expected paths", () => {
    expect(api.sourceStreamUrl("a b")).toBe("/api/source?url=a%20b");
    expect(api.fileUrl("j", 2)).toBe("/api/jobs/j/files/2");
    expect(api.previewUrl("j", 3)).toBe("/api/jobs/j/preview/3");
    expect(api.uploadPreviewUrl("u")).toBe("/api/uploads/u");
    expect(api.downloadAllUrl("j")).toBe("/api/jobs/j/download-all");
    expect(api.compilationDownloadUrl("c")).toBe("/api/compilations/c/download");
    expect(api.compilationDownloadUrl("c", "My Vid.mp4")).toBe(
      "/api/compilations/c/download?name=My%20Vid.mp4",
    );
  });
});

describe("jsonOrThrow (via simple wrappers)", () => {
  it("returns the parsed body on success", async () => {
    fetchMock.mockResolvedValue(jsonRes([{ jobId: "x" }]));
    await expect(api.listJobs()).resolves.toEqual([{ jobId: "x" }]);
  });

  it("throws the server error message on a non-ok response", async () => {
    fetchMock.mockResolvedValue(jsonRes({ error: "boom" }, false, 500));
    await expect(api.getJob("j")).rejects.toThrow("boom");
  });

  it("throws a generic 'Erro <status>' when there is no message", async () => {
    fetchMock.mockResolvedValue(jsonRes({}, false, 418));
    await expect(api.getJob("j")).rejects.toThrow("Erro 418");
  });
});

describe("fetchVideoInfo", () => {
  it("returns info on the first try", async () => {
    fetchMock.mockResolvedValue(jsonRes({ title: "T", duration: 1 }));
    await expect(api.fetchVideoInfo("u")).resolves.toMatchObject({ title: "T" });
  });

  it("retries once after a network error, then succeeds", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonRes({ title: "ok", duration: 2 }));
    const p = api.fetchVideoInfo("u");
    const assertion = expect(p).resolves.toMatchObject({ title: "ok" });
    await vi.advanceTimersByTimeAsync(800);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives a friendly message when the network stays down", async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const p = api.fetchVideoInfo("u");
    const assertion = expect(p).rejects.toThrow(/servidor/i);
    await vi.advanceTimersByTimeAsync(800);
    await assertion;
  });

  it("does not retry a 4xx from the server", async () => {
    fetchMock.mockResolvedValue(jsonRes({ error: "bad url" }, false, 422));
    await expect(api.fetchVideoInfo("u")).rejects.toThrow("bad url");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("best-effort calls swallow errors", () => {
  it("prefetchSource never throws", async () => {
    fetchMock.mockRejectedValue(new Error("x"));
    await expect(api.prefetchSource("u")).resolves.toBeUndefined();
  });

  it("deleteJob never throws", async () => {
    fetchMock.mockRejectedValue(new Error("x"));
    await expect(api.deleteJob("j")).resolves.toBeUndefined();
  });

  it("prefetchStatus falls back to idle on !ok and on throw", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({}, false, 500));
    await expect(api.prefetchStatus("u")).resolves.toEqual({ state: "idle", percent: 0 });
    fetchMock.mockRejectedValueOnce(new Error("x"));
    await expect(api.prefetchStatus("u")).resolves.toEqual({ state: "idle", percent: 0 });
  });

  it("prefetchStatus returns the server status when ok", async () => {
    fetchMock.mockResolvedValue(jsonRes({ state: "downloading", percent: 30 }));
    await expect(api.prefetchStatus("u")).resolves.toEqual({ state: "downloading", percent: 30 });
  });
});

describe("thin POST/DELETE wrappers", () => {
  it("createJob posts the project and returns the id", async () => {
    fetchMock.mockResolvedValue(jsonRes({ jobId: "new" }));
    await expect(
      api.createJob({ id: "p", sourceUrl: "u", cutMode: "precise", format: "mp4", cuts: [] }),
    ).resolves.toEqual({ jobId: "new" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/jobs",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("cancelJob / retryJob / deleteCut hit the right endpoints", async () => {
    fetchMock.mockResolvedValue(jsonRes({ id: "j" }));
    await api.cancelJob("j");
    await api.retryJob("j");
    await api.deleteCut("j", 3);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/jobs/j/cancel", { method: "POST" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/jobs/j/retry", { method: "POST" });
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/jobs/j/cuts/3", { method: "DELETE" });
  });

  it("uploadClip / uploadWatermarkImage send FormData", async () => {
    vi.stubGlobal(
      "FormData",
      class FakeFormData {
        entries: [string, unknown][] = [];
        append(k: string, v: unknown) {
          this.entries.push([k, v]);
        }
      },
    );
    fetchMock.mockResolvedValue(jsonRes({ uploadId: "u", originalName: "c.mp4" }));
    await expect(api.uploadClip({} as File)).resolves.toEqual({
      uploadId: "u",
      originalName: "c.mp4",
    });
    await api.uploadWatermarkImage({} as File);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/uploads/image",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("createCompilation / getStats / purgeDisk round-trip", async () => {
    fetchMock.mockResolvedValue(jsonRes({ id: "c" }));
    await expect(api.createCompilation({ items: [] })).resolves.toEqual({ id: "c" });
    fetchMock.mockResolvedValue(jsonRes({ jobs: 1 }));
    await expect(
      api.getStats({ jobs: [], uploads: [], compilations: [], sourceUrls: [] }),
    ).resolves.toEqual({ jobs: 1 });
    fetchMock.mockResolvedValue(jsonRes({ removed: 2, freed: 100 }));
    await expect(
      api.purgeDisk({ jobs: [], uploads: [], compilations: [], sourceUrls: [] }),
    ).resolves.toEqual({ removed: 2, freed: 100 });
  });

  it("getCompilation / listCompilations", async () => {
    fetchMock.mockResolvedValue(jsonRes({ id: "c", phase: "done" }));
    await expect(api.getCompilation("c")).resolves.toMatchObject({ id: "c" });
    fetchMock.mockResolvedValue(jsonRes([{ id: "c" }]));
    await expect(api.listCompilations()).resolves.toHaveLength(1);
  });
});

describe("SSE subscriptions", () => {
  class FakeEventSource {
    static instances: FakeEventSource[] = [];
    onmessage: ((e: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    closed = false;
    constructor(public url: string) {
      FakeEventSource.instances.push(this);
    }
    close() {
      this.closed = true;
    }
  }

  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  it("subscribeJob forwards parsed events and ignores malformed frames", () => {
    const onEvent = vi.fn();
    const stop = api.subscribeJob("j", onEvent);
    const es = FakeEventSource.instances[0];
    expect(es.url).toBe("/api/jobs/j/events");
    es.onmessage!({ data: JSON.stringify({ type: "job-done" }) });
    es.onmessage!({ data: "not json" });
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({ type: "job-done" });
    stop();
    expect(es.closed).toBe(true);
  });

  it("subscribeJob falls back to polling on error", async () => {
    vi.useFakeTimers();
    const onEvent = vi.fn();
    fetchMock.mockResolvedValue(jsonRes({ phase: "done" }));
    const stop = api.subscribeJob("j", onEvent);
    FakeEventSource.instances[0].onerror!();
    await vi.advanceTimersByTimeAsync(2000);
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "job-done" }));
    stop();
  });

  it("subscribeCompilation forwards parsed events and ignores bad frames", () => {
    const onEvent = vi.fn();
    const stop = api.subscribeCompilation("c", onEvent);
    const es = FakeEventSource.instances[0];
    expect(es.url).toBe("/api/compilations/c/events");
    es.onmessage!({ data: JSON.stringify({ type: "done" }) });
    es.onmessage!({ data: "<<bad>>" });
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({ type: "done" });
    stop();
    expect(es.closed).toBe(true);
  });

  it("subscribeCompilation polls after an error and reports failures via onError", async () => {
    vi.useFakeTimers();
    const onEvent = vi.fn();
    const onError = vi.fn();
    fetchMock
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValue(jsonRes({ phase: "done" }));
    const stop = api.subscribeCompilation("c", onEvent, onError);
    FakeEventSource.instances[0].onerror!();
    await vi.advanceTimersByTimeAsync(2000);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    await vi.advanceTimersByTimeAsync(2000);
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "done" }));
    stop();
  });
});
