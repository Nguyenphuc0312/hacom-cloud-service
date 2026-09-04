import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/Button";
import { ErrorState } from "../../components/ui/EmptyState";
import { dmsApi } from "./dmsApi";

export const DmsReport: React.FC = () => {
  const { t } = useTranslation("dms");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [report, setReport] = React.useState<{ groups: Array<{ direction: string; lifecycle_state: string; count: number }>; total: number } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const load = async (): Promise<void> => {
    setLoading(true);
    setError(false);
    try { setReport(await dmsApi.report(from, to)); } catch { setError(true); } finally { setLoading(false); }
  };
  React.useEffect(() => {
    void dmsApi.report().then(setReport).catch(() => setError(true)).finally(() => setLoading(false));
  }, []);
  return <div className="p-4 sm:p-5"><div><h3 className="text-lg font-bold text-text-primary">{t("report.title")}</h3><p className="mt-1 text-sm text-text-secondary">{t("report.description")}</p></div><div className="mt-4 flex flex-wrap items-end gap-3"><label className="grid gap-1 text-xs font-semibold text-text-secondary">{t("report.from")}<input className="min-h-10 rounded-md border border-border bg-surface px-3 text-sm" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="grid gap-1 text-xs font-semibold text-text-secondary">{t("report.to")}<input className="min-h-10 rounded-md border border-border bg-surface px-3 text-sm" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><Button isLoading={loading} onClick={() => void load()}>{t("report.run")}</Button></div>{error ? <ErrorState title={t("report.errorTitle")} message={t("errors.unavailable")} onRetry={() => void load()} /> : report && <><div className="mt-5 rounded-xl bg-primary/8 p-5"><p className="text-xs font-semibold uppercase tracking-wide text-primary">{t("report.total")}</p><p className="mt-1 text-3xl font-bold text-text-primary">{report.total}</p></div><div className="mt-4 overflow-x-auto rounded-lg border border-border"><table className="w-full text-left text-sm"><thead className="bg-background text-text-secondary"><tr><th className="px-4 py-3">{t("fields.direction")}</th><th className="px-4 py-3">{t("report.state")}</th><th className="px-4 py-3 text-right">{t("report.count")}</th></tr></thead><tbody className="divide-y divide-border">{report.groups.map((group) => <tr key={`${group.direction}:${group.lifecycle_state}`}><td className="px-4 py-3">{t(`directions.${group.direction}`)}</td><td className="px-4 py-3">{group.lifecycle_state.replaceAll("_", " ")}</td><td className="px-4 py-3 text-right font-semibold">{group.count}</td></tr>)}</tbody></table></div></>}</div>;
};
