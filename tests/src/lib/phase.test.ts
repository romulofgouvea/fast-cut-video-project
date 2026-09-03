import { describe, expect, it } from "vitest";
import { PHASE_LABEL } from "@/lib/phase";

describe("PHASE_LABEL", () => {
  it("has a Portuguese label for every project phase", () => {
    expect(PHASE_LABEL).toEqual({
      url: "Novo projeto",
      editor: "Editando cortes",
      progress: "Processando",
      results: "Resultados",
    });
  });
});
