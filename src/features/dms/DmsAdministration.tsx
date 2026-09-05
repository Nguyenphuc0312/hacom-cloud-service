import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/Button";
import { dmsApi, type DmsPrincipal } from "./dmsApi";
import { OrganizationMemberPicker } from "./OrganizationMemberPicker";

type ConfigTab = "templates" | "workflows" | "books" | "catalogs";

const inputClass = "min-h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus:border-border-focus focus:ring-2 focus:ring-focus/20";

export const DmsAdministration: React.FC<{ principal: DmsPrincipal }> = ({ principal }) => {
  const { t } = useTranslation("dms");
  const [organizationId, setOrganizationId] = React.useState(principal.organizationIds[0] ?? "");
  const [tab, setTab] = React.useState<ConfigTab>("templates");
  const [items, setItems] = React.useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [revision, setRevision] = React.useState(0);

  React.useEffect(() => {
    if (!organizationId) return;
    let active = true;
    const loader = tab === "templates" ? dmsApi.templates
      : tab === "workflows" ? dmsApi.workflows
        : tab === "books" ? dmsApi.books
          : dmsApi.catalogs;
    void loader(organizationId)
      .then((result) => { if (active) setItems(result as Array<Record<string, unknown>>); })
      .catch(() => { if (active) setError(t("errors.unavailable")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organizationId, revision, t, tab]);

  const canManage = principal.capabilities.includes({ templates: "document.template.manage", workflows: "document.workflow.manage", books: "document.numbering.manage", catalogs: "document.catalog.manage" }[tab]);
  return (
    <div className="p-4 sm:p-5" data-testid="dms-administration">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h3 className="text-lg font-bold text-text-primary">{t("admin.title")}</h3><p className="mt-1 text-sm text-text-secondary">{t("admin.description")}</p></div>
        <label className="grid gap-1 text-xs font-semibold text-text-secondary">{t("fields.organization")}<select className={inputClass} value={organizationId} onChange={(event) => { setLoading(true); setOrganizationId(event.target.value); }}>{principal.organizationIds.map((id) => <option key={id} value={id}>{id}</option>)}</select></label>
      </div>
      <div className="mt-4 flex overflow-x-auto border-b border-border" role="tablist">{(["templates", "workflows", "books", "catalogs"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => { setLoading(true); setTab(item); setError(null); }} className={`min-h-10 shrink-0 border-b-2 px-4 text-sm font-semibold ${tab === item ? "border-primary text-primary" : "border-transparent text-text-secondary"}`}>{t(`admin.tabs.${item}`)}</button>)}</div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,38%)]">
        <section className="overflow-hidden rounded-lg border border-border" aria-label={t(`admin.tabs.${tab}`)}>
          <div className="border-b border-border bg-background px-3 py-2 text-xs font-semibold text-text-secondary">{loading ? t("admin.loading") : t("admin.count", { count: items.length })}</div>
          {error ? <p className="p-4 text-sm text-danger" role="alert">{error}</p> : items.length === 0 && !loading ? <p className="p-4 text-sm text-text-muted">{t("admin.empty")}</p> : <div className="max-h-[420px] divide-y divide-border overflow-y-auto">{items.map((item, index) => <div key={String(item.id ?? item.version_id ?? index)} className="p-3"><p className="text-sm font-semibold text-text-primary">{String(item.name ?? item.code ?? item.catalog_type ?? t("admin.unnamed"))}</p><p className="mt-1 text-xs text-text-muted">{summary(item)}</p></div>)}</div>}
        </section>
        {canManage ? <ConfigForm key={`${organizationId}:${tab}`} tab={tab} organizationId={organizationId} onSaved={() => { setLoading(true); setRevision((value) => value + 1); }} /> : <aside className="rounded-lg border border-border bg-background p-4 text-sm text-text-secondary">{t("admin.readOnly")}</aside>}
      </div>
    </div>
  );
};

const ConfigForm: React.FC<{ tab: ConfigTab; organizationId: string; onSaved: () => void }> = ({ tab, organizationId, onSaved }) => {
  const { t } = useTranslation("dms");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savedRevision, setSavedRevision] = React.useState(0);
  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const common = { organizationId, code: String(data.get("code")), name: String(data.get("name")) };
    setBusy(true); setError(null);
    try {
      if (tab === "templates") {
        const rawContent = String(data.get("content") || "{}");
        await dmsApi.createTemplate({ ...common, activate: data.get("activate") === "on", content: JSON.parse(rawContent) as Record<string, unknown> });
      } else if (tab === "books") {
        await dmsApi.createBook({ ...common, direction: String(data.get("direction")), prefix: String(data.get("prefix")), suffix: String(data.get("suffix")) });
      } else if (tab === "catalogs") {
        await dmsApi.upsertCatalog({ ...common, catalogType: String(data.get("catalogType")), displayOrder: Number(data.get("displayOrder") || 0), status: String(data.get("status")) });
      } else {
        const actors = data.getAll("actors").map(String);
        await dmsApi.createWorkflow({ ...common, activate: data.get("activate") === "on", steps: actors.map((actorSubjectId, index) => ({ order: index + 1, mode: "SEQUENTIAL", actorType: "PERSON", actorSubjectId })) });
      }
      form.reset(); setSavedRevision((value) => value + 1); onSaved();
    } catch {
      setError(t("admin.invalid"));
    } finally { setBusy(false); }
  };
  return <form onSubmit={(event) => void submit(event)} className="rounded-lg border border-border bg-background p-4"><h4 className="font-bold text-text-primary">{t(`admin.create.${tab}`)}</h4><div className="mt-3 grid gap-3"><Label text={t("admin.fields.code")}><input className={inputClass} name="code" required /></Label><Label text={t("admin.fields.name")}><input className={inputClass} name="name" required /></Label>{tab === "templates" && <><Label text={t("admin.fields.content")}><textarea className={inputClass} name="content" rows={4} defaultValue="{}" required /></Label><Checkbox name="activate" label={t("admin.fields.activate")} /></>}{tab === "workflows" && <><OrganizationMemberPicker key={savedRevision} organizationId={organizationId} name="actors" label={t("members.approvers")} required max={20} /><Checkbox name="activate" label={t("admin.fields.activate")} /></>}{tab === "books" && <><Label text={t("fields.direction")}><select className={inputClass} name="direction"><option value="INCOMING">{t("directions.INCOMING")}</option><option value="OUTGOING">{t("directions.OUTGOING")}</option><option value="INTERNAL">{t("directions.INTERNAL")}</option></select></Label><div className="grid grid-cols-2 gap-3"><Label text={t("admin.fields.prefix")}><input className={inputClass} name="prefix" /></Label><Label text={t("admin.fields.suffix")}><input className={inputClass} name="suffix" /></Label></div></>}{tab === "catalogs" && <><Label text={t("admin.fields.catalogType")}><input className={inputClass} name="catalogType" required /></Label><div className="grid grid-cols-2 gap-3"><Label text={t("admin.fields.displayOrder")}><input className={inputClass} name="displayOrder" type="number" defaultValue="0" /></Label><Label text={t("admin.fields.status")}><select className={inputClass} name="status"><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></Label></div></>}</div>{error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}<Button className="mt-4" type="submit" isLoading={busy}>{t("admin.save")}</Button></form>;
};

const Label: React.FC<{ text: string; children: React.ReactNode }> = ({ text, children }) => <label className="grid gap-1 text-xs font-semibold text-text-secondary">{text}{children}</label>;
const Checkbox: React.FC<{ name: string; label: string }> = ({ name, label }) => <label className="flex items-center gap-2 text-sm text-text-secondary"><input type="checkbox" name={name} />{label}</label>;
const summary = (item: Record<string, unknown>): string => [item.code, item.direction, item.status, item.catalog_type, item.version ? `v${String(item.version)}` : null].filter(Boolean).join(" · ");
