import { useState } from "react";
import { useStore } from "../store";
import { useStats } from "../lib/useStats";
import { currentKeptRefs } from "../lib/keptRefs";
import { purgeDisk } from "../lib/api";
import { formatBytes } from "../../shared/bytes";
import { KpiCard } from "./KpiCard";
import { ConfirmDialog } from "./ConfirmDialog";

export function HomeView() {
  const projectCount = useStore((s) => s.projects.length);
  const montageCount = useStore((s) => s.montageProjects.length);
  const { stats, loading, error, reload } = useStats();

  const [confirmPurge, setConfirmPurge] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgeMsg, setPurgeMsg] = useState<string>();

  // The projects KPI is client-side, so it stays live even if the fetch fails.
  const serverLoading = loading && !stats;
  const serverError = !!error && !stats;

  const disk = stats?.disk;
  const orphanBytes = stats?.orphans.bytes ?? 0;
  const orphanCount = (stats?.orphans.jobs ?? 0) + (stats?.orphans.compilations ?? 0);
  const diskTitle = disk
    ? `Fontes ${formatBytes(disk.sources)} · Cortes ${formatBytes(disk.output)} · ` +
      `Uploads ${formatBytes(disk.uploads)} · Montagens ${formatBytes(disk.compilations)}`
    : undefined;

  async function runPurge() {
    setPurging(true);
    setPurgeMsg(undefined);
    try {
      const { freed } = await purgeDisk(currentKeptRefs());
      setPurgeMsg(`${formatBytes(freed)} liberados`);
      reload();
      window.setTimeout(() => setPurgeMsg(undefined), 5000);
    } catch (err) {
      setPurgeMsg((err as Error).message);
    } finally {
      setPurging(false);
      setConfirmPurge(false);
    }
  }

  return (
    <div className="home">
      <div className="home__kpis">
        <KpiCard label="Total de projetos" value={projectCount} hint="Salvos neste navegador" />
        <KpiCard
          label="Cortes gerados"
          value={stats?.cuts.done ?? 0}
          hint={`${stats?.clips ?? 0} disponíveis p/ montagem`}
          loading={serverLoading}
          error={serverError}
        />
        <KpiCard
          label="Vídeos mesclados"
          value={stats?.compilations.done ?? 0}
          hint={`${montageCount} ${montageCount === 1 ? "montagem salva" : "montagens salvas"}`}
          loading={serverLoading}
          error={serverError}
        />
        <KpiCard
          label="Uso de disco"
          value={formatBytes(disk?.total ?? 0)}
          hint={
            purgeMsg ? (
              purgeMsg
            ) : orphanBytes > 0 ? (
              <>
                {formatBytes(orphanBytes)} sem uso ·{" "}
                <button type="button" className="link-btn" onClick={() => setConfirmPurge(true)}>
                  Limpar disco
                </button>
              </>
            ) : (
              "Espaço usado em data/"
            )
          }
          title={diskTitle}
          loading={serverLoading || purging}
          error={serverError}
        />
      </div>

      {serverError && (
        <p className="hint hint--error">
          Não foi possível carregar as estatísticas ·{" "}
          <button type="button" className="link-btn" onClick={reload}>
            Tentar de novo
          </button>
        </p>
      )}

      <ConfirmDialog
        open={confirmPurge}
        title="Limpar disco"
        message={
          `Remove do servidor ${orphanCount > 0 ? `${orphanCount} item(ns) e ` : ""}` +
          `${formatBytes(orphanBytes)} de cortes, montagens e vídeos baixados que não ` +
          `pertencem a nenhum projeto ou montagem aberto. Não pode ser desfeito.`
        }
        confirmLabel="Limpar"
        danger
        busy={purging}
        onConfirm={runPurge}
        onCancel={() => !purging && setConfirmPurge(false)}
      />
    </div>
  );
}
