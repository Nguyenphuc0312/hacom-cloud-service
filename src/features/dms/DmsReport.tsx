import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/Button";
import { ErrorState } from "../../components/ui/EmptyState";
import { dmsApi } from "./dmsApi";

type ReportGroup = { direction: string; lifecycle_state: string; count: number };
type ReportFilters = { from?: string; to?: string; direction?: string; state?: string; documentType?: string };

export const DmsReport: React.FC<{ canExport?: boolean; onDrillDown: (group: ReportGroup, filters: ReportFilters) => void }> = ({ canExport = false, onDrillDown }) => {
  const { t } = useTranslation("dms");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [direction, setDirection] = React.useState("");
  const [state, setState] = React.useState("");
  const [documentType, setDocumentType] = React.useState("");
  const [report, setReport] = React.useState<{ groups: ReportGroup[]; total: number } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [exporting, setExporting] = React.useState(false);
  const [error, setError] = React.useState(false);
  const load = async (filters: ReportFilters = {}): Promise<void> => {
    setLoading(true); setError(false);
    try { setReport(await dmsApi.report(filters)); } catch { setError(true); } finally { setLoading(false); }
  };
  React.useEffect(() => {
    let active = true;
    void dmsApi.report().then((result) => { if (active) setReport(result); }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const selectedFilters = (): ReportFilters => ({ from: from || undefined, to: to || undefined, direction: direction || undefined, state: state || undefined, documentType: documentType.trim() || undefined });
  const exportReport = async (): Promise<void> => {
    setExporting(true); setError(false);
    try {
      const href = URL.createObjectURL(await dmsApi.exportReport(selectedFilters()));
      const link = document.createElement("a");
      link.href = href; link.download = "dms-report.csv"; link.click();
      URL.revokeObjectURL(href);
    } catch { setError(true); } finally { setExporting(false); }
  };
  return <div className="p-4 sm:p-5"><div><h3 className="text-lg font-bold text-text-primary">{t("report.title")}</h3><p className="mt-1 text-sm text-text-secondary">{t("report.description")}</p></div><div className="mt-4 flex flex-wrap items-end gap-3"><label className="grid gap-1 text-xs font-semibold text-text-secondary">{t("report.from")}<input className="min-h-10 rounded-md border border-border bg-surface px-3 text-sm" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="grid gap-1 text-xs font-semibold text-text-secondary">{t("report.to")}<input className="min-h-10 rounded-md border border-border bg-surface px-3 text-sm" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><label className="grid gap-1 text-xs font-semibold text-text-secondary">{t("fields.documentType")}<input className="min-h-10 rounded-md border border-border bg-surface px-3 text-sm" maxLength={120} value={documentType} onChange={(event) => setDocumentType(event.target.value)} /></label><label className="grid gap-1 text-xs font-semibold text-text-secondary">{t("fields.direction")}<select className="min-h-10 rounded-md border border-border bg-surface px-3 text-sm" value={direction} onChange={(event) => setDirection(event.target.value)}><option value="">{t("report.allDirections")}</option>{["INCOMING", "OUTGOING", "INTERNAL"].map((item) => <option key={item} value={item}>{t(`directions.${item}`)}</option>)}</select></label><label className="grid gap-1 text-xs font-semibold text-text-secondary">{t("report.state")}<select className="min-h-10 rounded-md border border-border bg-surface px-3 text-sm" value={state} onChange={(event) => setState(event.target.value)}><option value="">{t("report.allStates")}</option>{["DRAFT", "REGISTERED", "ISSUED", "COMPLETED", "ARCHIVED", "CANCELLED"].map((item) => <option key={item} value={item}>{t(`lifecycle.${item}`)}</option>)}</select></label><Button isLoading={loading} onClick={() => void load(selectedFilters())}>{t("report.run")}</Button>{canExport && <Button variant="secondary" isLoading={exporting} onClick={() => void exportReport()}>{t("report.export")}</Button>}</div>{error ? <ErrorState title={t("report.errorTitle")} message={t("errors.unavailable")} onRetry={() => void load(selectedFilters())} /> : report && <><div className="mt-5 rounded-xl bg-primary/8 p-5"><p className="text-xs font-semibold uppercase tracking-wide text-primary">{t("report.total")}</p><p className="mt-1 text-3xl font-bold text-text-primary">{report.total}</p></div><div className="mt-4 overflow-x-auto rounded-lg border border-border"><table className="w-full text-left text-sm"><thead className="bg-background text-text-secondary"><tr><th className="px-4 py-3">{t("fields.direction")}</th><th className="px-4 py-3">{t("report.state")}</th><th className="px-4 py-3 text-right">{t("report.count")}</th><th className="px-4 py-3"><span className="sr-only">{t("report.drillDown")}</span></th></tr></thead><tbody className="divide-y divide-border">{report.groups.map((group) => <tr key={`${group.direction}:${group.lifecycle_state}`}><td className="px-4 py-3">{t(`directions.${group.direction}`)}</td><td className="px-4 py-3">{t(`lifecycle.${group.lifecycle_state}`)}</td><td className="px-4 py-3 text-right font-semibold">{group.count}</td><td className="px-4 py-3 text-right"><Button size="xs" variant="secondary" onClick={() => onDrillDown(group, selectedFilters())}>{t("report.drillDown")}</Button></td></tr>)}</tbody></table></div></>}</div>;
};
