import React from "react";
import { useSearchParams } from "react-router-dom";
import { dmsDocumentId } from "./dmsLinks";
import { useTranslation } from "react-i18next";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  ChevronRightIcon,
  DocumentPlusIcon,
  DocumentTextIcon,
  EyeIcon,
  MagnifyingGlassIcon,
  PaperAirplaneIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button, IconButton } from "../../components/ui/Button";
import { EmptyState, ErrorState } from "../../components/ui/EmptyState";
import { SkeletonText } from "../../components/ui/Skeleton";
import { dmsApi, DmsApiError, type DmsDirection, type DmsDocument, type DmsPrincipal, type DmsWorkQueue } from "./dmsApi";
import { beginDmsAuthorization, completeDmsAuthorization, getDmsAccessToken } from "./dmsOAuth";
import { DmsAdministration } from "./DmsAdministration";
import { DmsReport } from "./DmsReport";
import { OrganizationMemberPicker } from "./OrganizationMemberPicker";
import { DocumentTasks } from "./DocumentTasks";
const PdfJsViewer = React.lazy(() => import("../../components/preview/PdfJsViewer"));

type DirectionFilter = "ALL" | DmsDirection;
type DetailTab = "summary" | "files" | "history" | "tasks";
type ActionMode = "edit" | "submit" | "approve" | "return" | "reject" | "register" | "issue" | "distribute" | "recall" | "archive";
type WorkspaceView = "work" | "documents" | "archive" | "configuration" | "reports";
type WorkType = "PROCESSING" | "APPROVAL" | "INCOMING" | "DUE_SOON";
const DOCUMENT_PAGE_SIZE = 50;
const LIFECYCLE_STATES = ["DRAFT", "REGISTERED", "ISSUED", "COMPLETED", "ARCHIVED", "CANCELLED"];
const WORK_TYPES: WorkType[] = ["PROCESSING", "APPROVAL", "INCOMING", "DUE_SOON"];

const formatDate = (value?: string | null): string => value
  ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "—";

const statusTone = (status: string): string => {
  if (["APPROVED", "ISSUED", "COMPLETED", "ARCHIVED", "SIGNED"].includes(status)) return "bg-success/10 text-success";
  if (["REJECTED", "FAILED"].includes(status)) return "bg-danger/10 text-danger";
  if (["PENDING", "IN_PROGRESS", "RETURNED"].includes(status)) return "bg-warning/15 text-amber-700 dark:text-amber-300";
  return "bg-surface-overlay text-text-secondary";
};

const StatusChip: React.FC<{ value: string }> = ({ value }) => {
  const { t } = useTranslation("dms");
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone(value)}`}>{t(`lifecycle.${value}`, { defaultValue: t("lifecycle.unknown") })}</span>;
};

export default function DocumentWorkspace(): React.ReactElement {
  const { t } = useTranslation("dms");
  const [authReady, setAuthReady] = React.useState(Boolean(getDmsAccessToken()));
  const [authError, setAuthError] = React.useState(false);
  const [principal, setPrincipal] = React.useState<DmsPrincipal | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialDirection = searchParams.get("direction");
  const [direction, setDirection] = React.useState<DirectionFilter>(["INCOMING", "OUTGOING", "INTERNAL"].includes(initialDirection ?? "") ? initialDirection as DmsDirection : "ALL");
  const initialLifecycleState = searchParams.get("state");
  const [lifecycleState, setLifecycleState] = React.useState<string | null>(LIFECYCLE_STATES.includes(initialLifecycleState ?? "") ? initialLifecycleState : null);
  const [documentType, setDocumentType] = React.useState<string | null>(searchParams.get("documentType") || null);
  const [search, setSearch] = React.useState(searchParams.get("search") || "");
  const initialWorkType = searchParams.get("workType");
  const [workType, setWorkType] = React.useState<WorkType | null>(WORK_TYPES.includes(initialWorkType as WorkType) ? initialWorkType as WorkType : null);
  const [documents, setDocuments] = React.useState<DmsDocument[]>([]);
  const [workQueue, setWorkQueue] = React.useState<DmsWorkQueue | null>(null);
  const [total, setTotal] = React.useState(0);
  const requestedPage = Number(searchParams.get("page"));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const setPage = (nextPage: number | ((current: number) => number)): void => {
    const value = typeof nextPage === "function" ? nextPage(page) : nextPage;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value > 1) next.set("page", String(value)); else next.delete("page");
      return next;
    });
  };
  const setListFilter = (name: "direction" | "state" | "documentType" | "search", value: string | null): void => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(name, value); else next.delete(name);
      next.delete("page");
      return next;
    });
  };
  const selectedId = dmsDocumentId(searchParams.get("documentId"));
  const [loadedDocument, setSelected] = React.useState<DmsDocument | null>(null);
  const selected = loadedDocument?.id === selectedId ? loadedDocument : null;
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [detailTab, setDetailTab] = React.useState<DetailTab>("summary");
  const [actionMode, setActionMode] = React.useState<ActionMode | null>(null);
  const [view, setView] = React.useState<WorkspaceView>(() => {
    const workspace = searchParams.get("workspace");
    return ["documents", "archive", "configuration", "reports"].includes(workspace ?? "") ? workspace as WorkspaceView : "work";
  });
  const setSelectedId = (id: string): void => {
    setSearchParams((current) => { const next = new URLSearchParams(current); next.set("documentId", id); next.set("workspace", view); return next; });
  };

  React.useEffect(() => {
    void completeDmsAuthorization()
      .then((completed) => {
        if (completed) { setAuthReady(true); setSearchParams(new URLSearchParams(window.location.search), { replace: true }); }
      })
      .catch(() => setAuthError(true));
  }, [setSearchParams]);

  React.useEffect(() => {
    if (!authReady) return;
    void dmsApi.principal()
      .then(setPrincipal)
      .catch((cause: unknown) => {
        if (cause instanceof DmsApiError && cause.status === 401) setAuthReady(false);
        else setError(t("errors.principal"));
      });
  }, [authReady, t]);

  React.useEffect(() => {
    if (!principal || !["work", "documents", "archive"].includes(view)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void dmsApi.list({ direction: direction === "ALL" ? null : direction, state: lifecycleState, documentType, archiveState: view === "archive" ? "ARCHIVED" : "ACTIVE", queue: view === "work" ? "WORK" : null, workType: view === "work" ? workType : null, search, page, pageSize: DOCUMENT_PAGE_SIZE })
        .then((result) => {
          if (controller.signal.aborted) return;
          setDocuments(result.items);
          setTotal(result.total);
        })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) setError(errorMessage(cause, t));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [direction, documentType, lifecycleState, page, principal, refreshKey, search, t, view, workType]);

  React.useEffect(() => {
    if (!principal) return;
    let active = true;
    void dmsApi.workQueue().then((result) => { if (active) setWorkQueue(result); }).catch(() => { if (active) setWorkQueue(null); });
    return () => { active = false; };
  }, [principal, refreshKey]);

  React.useEffect(() => {
    if (!selectedId || !principal) return;
    let active = true;
    void dmsApi.detail(selectedId)
      .then((document) => { if (active) setSelected(document); })
      .catch((cause: unknown) => { if (active) { setSelected(null); setError(errorMessage(cause, t)); } });
    return () => { active = false; };
  }, [selectedId, principal, refreshKey, t]);

  const refresh = (): void => setRefreshKey((value) => value + 1);
  const capabilities = new Set(principal?.capabilities ?? []);

  if (!authReady) {
    return (
      <section className="w-full rounded-xl border border-border bg-surface p-5 shadow-sm" aria-labelledby="dms-title">
        <div className="mx-auto max-w-xl py-5 text-center">
          <DocumentTextIcon className="mx-auto h-11 w-11 text-primary" aria-hidden="true" />
          <h2 id="dms-title" className="mt-3 text-xl font-bold text-text-primary">{t("title")}</h2>
          <p className="mt-2 text-sm text-text-secondary">{authError ? t("errors.oauth") : t("connect.description")}</p>
          <Button className="mt-4" onClick={() => void beginDmsAuthorization()}>{t("connect.action")}</Button>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full overflow-hidden rounded-xl border border-border bg-surface shadow-sm" aria-labelledby="dms-title" data-testid="dms-workspace">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div>
          <div className="flex items-center gap-2">
            <DocumentTextIcon className="h-6 w-6 text-primary" aria-hidden="true" />
            <h2 id="dms-title" className="text-xl font-bold text-text-primary">{t("title")}</h2>
          </div>
          <p className="mt-1 text-sm text-text-secondary">{t("subtitle", { employeeCode: principal?.employeeCode ?? "…" })}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" leftIcon={<ArrowPathIcon />} onClick={refresh}>{t("actions.refresh")}</Button>
          {view === "documents" && capabilities.has("document.draft.manage") && (
            <Button size="sm" leftIcon={<DocumentPlusIcon />} onClick={() => setCreateOpen(true)}>{t("actions.create")}</Button>
          )}
        </div>
      </header>

      {workQueue && Object.values(workQueue).some((count) => count > 0) && <div className="flex flex-wrap gap-x-5 gap-y-2 border-b border-border bg-surface-overlay px-4 py-2 text-sm sm:px-5" aria-label={t("queue.label")} data-testid="dms-work-queue">
        {(["processing", "approvals", "incoming", "dueSoon"] as const).filter((key) => workQueue[key] > 0).map((key) => <button key={key} type="button" onClick={() => { const type = ({ processing: "PROCESSING", approvals: "APPROVAL", incoming: "INCOMING", dueSoon: "DUE_SOON" } as const)[key]; setView("work"); setWorkType(type); setSearchParams((current) => { const next = new URLSearchParams(current); next.set("workspace", "work"); next.set("workType", type); next.delete("page"); return next; }); }} className="text-left text-text-secondary hover:text-text-primary focus-visible:ring-2 focus-visible:ring-focus">{t(`queue.${key}`)} <strong className="text-text-primary">{workQueue[key]}</strong></button>)}
      </div>}

      <nav className="flex overflow-x-auto border-b border-border px-3 sm:px-5" aria-label={t("navigation.label")}>{(["work", "documents", "archive", "configuration", "reports"] as const).filter((item) => item !== "reports" || capabilities.has("document.report.read")).map((item) => <button key={item} type="button" aria-current={view === item ? "page" : undefined} onClick={() => { setView(item); setSearchParams((current) => { const next = new URLSearchParams(current); next.set("workspace", item); next.delete("page"); return next; }); if (["work", "documents", "archive"].includes(item)) setLifecycleState(null); }} className={`min-h-11 shrink-0 border-b-2 px-3 text-sm font-semibold ${view === item ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text-primary"}`}>{t(`navigation.${item}`)}</button>)}</nav>

      {view === "configuration" && principal ? <DmsAdministration principal={principal} /> : view === "reports" ? <DmsReport onDrillDown={(group, filters) => { const nextView = group.lifecycle_state === "ARCHIVED" ? "archive" : "documents"; setDirection(group.direction as DmsDirection); setLifecycleState(group.lifecycle_state); setDocumentType(filters.documentType ?? null); setView(nextView); setSearchParams((current) => { const next = new URLSearchParams(current); next.set("workspace", nextView); next.set("direction", group.direction); next.set("state", group.lifecycle_state); if (filters.documentType) next.set("documentType", filters.documentType); else next.delete("documentType"); next.delete("page"); return next; }); }} /> : <>

      {createOpen && principal && (
        <CreateDocumentPanel principal={principal} onClose={() => setCreateOpen(false)} onCreated={(id) => { setCreateOpen(false); setSelectedId(id); refresh(); }} />
      )}

      <div className="border-b border-border px-3 pt-2 sm:px-5">
        <div className="flex overflow-x-auto" role="tablist" aria-label={t("filters.direction")}> 
          {(["ALL", "INCOMING", "OUTGOING", "INTERNAL"] as const).map((item) => (
            <button key={item} type="button" role="tab" aria-selected={direction === item} onClick={() => { setDirection(item); setListFilter("direction", item === "ALL" ? null : item); }} className={`min-h-10 shrink-0 border-b-2 px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-focus ${direction === item ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text-primary"}`}>
              {t(`directions.${item}`)}
            </button>
          ))}
        </div>
        <div className="my-3 flex flex-wrap gap-3">
          <label className="relative block min-w-[16rem] max-w-xl flex-1">
            <span className="sr-only">{t("filters.search")}</span>
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-text-muted" aria-hidden="true" />
            <input value={search} onChange={(event) => { const value = event.target.value; setSearch(value); setListFilter("search", value || null); }} className="min-h-10 w-full rounded-lg border border-border bg-background pl-10 pr-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-border-focus focus:ring-2 focus:ring-focus/20" placeholder={t("filters.searchPlaceholder")} />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-text-secondary">
            {t("fields.documentType")}
            <input value={documentType ?? ""} onChange={(event) => { const value = event.target.value || null; setDocumentType(value); setListFilter("documentType", value); }} className="min-h-10 rounded-lg border border-border bg-background px-3 text-sm font-normal text-text-primary outline-none placeholder:text-text-muted focus:border-border-focus focus:ring-2 focus:ring-focus/20" maxLength={120} />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-text-secondary">
            {t("filters.state")}
            <select value={lifecycleState ?? ""} onChange={(event) => { const value = event.target.value || null; setLifecycleState(value); setListFilter("state", value); }} className="min-h-10 rounded-lg border border-border bg-background px-3 text-sm font-normal text-text-primary outline-none focus:border-border-focus focus:ring-2 focus:ring-focus/20">
              <option value="">{t("filters.allStates")}</option>
              {["DRAFT", "REGISTERED", "ISSUED", "COMPLETED"].map((state) => <option key={state} value={state}>{t(`lifecycle.${state}`, { defaultValue: state })}</option>)}
            </select>
          </label>
        </div>
      </div>

      {error ? (
        <ErrorState title={t("errors.listTitle")} message={error} onRetry={refresh} />
      ) : (
        <div className="grid min-h-[420px] lg:grid-cols-[minmax(320px,42%)_minmax(0,1fr)]">
          <div className="border-b border-border lg:border-b-0 lg:border-r">
            <div className="flex min-h-10 items-center justify-between border-b border-border px-4 text-sm">
              <span className="font-semibold text-text-primary">{t(view === "archive" ? "archive.title" : view === "work" ? "queue.title" : "list.title")}</span>
              <span className="text-text-muted" aria-live="polite">{t("list.total", { count: total })}</span>
            </div>
            <div className="max-h-[620px] overflow-y-auto">
              {loading ? <div className="p-4"><SkeletonText lines={5} /></div> : documents.length === 0 ? (
                <EmptyState title={t(view === "archive" ? "archive.empty" : view === "work" ? "queue.empty" : "list.empty")} description={t(view === "archive" ? "archive.emptyDescription" : view === "work" ? "queue.emptyDescription" : "list.emptyDescription")} />
              ) : documents.map((document) => (
                <button key={document.id} data-testid="dms-document-row" type="button" onClick={() => { setSelectedId(document.id); setDetailTab("summary"); setActionMode(null); }} className={`grid w-full grid-cols-[1fr_auto] gap-3 border-b border-border px-4 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus ${selectedId === document.id ? "bg-primary/8" : "hover:bg-surface-hover"}`}>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-text-primary">{document.subject}</span>
                    <span className="mt-1 block truncate text-xs text-text-secondary">{document.document_number ?? t("list.noNumber")} · {t(`directions.${document.direction}`)}</span>
                    <span className="mt-1 block text-xs text-text-muted">{formatDate(document.updated_at)}</span>
                  </span>
                  <span className="flex items-center gap-2"><StatusChip value={document.lifecycle_state} /><ChevronRightIcon className="h-4 w-4 text-text-muted" /></span>
                </button>
              ))}
            </div>
            {Math.ceil(total / DOCUMENT_PAGE_SIZE) > 1 && <div className="flex min-h-12 items-center justify-between gap-2 border-t border-border px-4 text-sm">
              <Button size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{t("pagination.previous")}</Button>
              <span className="text-text-secondary" aria-live="polite">{t("pagination.page", { page, count: Math.ceil(total / DOCUMENT_PAGE_SIZE) })}</span>
              <Button size="sm" variant="secondary" disabled={page >= Math.ceil(total / DOCUMENT_PAGE_SIZE)} onClick={() => setPage((value) => Math.min(Math.ceil(total / DOCUMENT_PAGE_SIZE), value + 1))}>{t("pagination.next")}</Button>
            </div>}
          </div>
          {selected ? (
            <DocumentDetail document={selected} subjectId={principal?.subjectId ?? ""} capabilities={capabilities} tab={detailTab} onTab={setDetailTab} actionMode={actionMode} onAction={setActionMode} onRefresh={refresh} />
          ) : (
            <EmptyState icon={<DocumentTextIcon className="h-full w-full" />} title={t("detail.selectTitle")} description={t("detail.selectDescription")} />
          )}
        </div>
      )}
      </>}
    </section>
  );
}

export const CreateDocumentPanel: React.FC<{ principal: DmsPrincipal; onClose: () => void; onCreated: (id: string) => void }> = ({ principal, onClose, onCreated }) => {
  const { t } = useTranslation("dms");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [organizationId, setOrganizationId] = React.useState(principal.organizationIds[0] ?? "");
  const [templates, setTemplates] = React.useState<Array<Record<string, unknown>>>([]);
  React.useEffect(() => {
    let active = true;
    if (organizationId) void dmsApi.templates(organizationId).then((items) => { if (active) setTemplates(items as Array<Record<string, unknown>>); }).catch(() => { if (active) setTemplates([]); });
    return () => { active = false; };
  }, [organizationId]);
  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const result = await dmsApi.create({
        organizationId: String(data.get("organizationId")),
        direction: String(data.get("direction")),
        subject: String(data.get("subject")),
        documentType: String(data.get("documentType")),
        confidentiality: String(data.get("confidentiality")),
        documentDate: String(data.get("documentDate")) || null,
        dueDate: String(data.get("dueDate")) || null,
        templateVersionId: String(data.get("templateVersionId")) || null,
        signingRequired: data.get("signingRequired") === "on",
      });
      onCreated(result.id);
    } catch (cause) {
      setError(errorMessage(cause, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={(event) => void submit(event)} className="border-b border-border bg-background p-4" aria-label={t("create.title")}> 
      <div className="mb-3 flex items-center justify-between"><h3 className="font-bold text-text-primary">{t("create.title")}</h3><IconButton icon={<XMarkIcon />} aria-label={t("actions.close")} size="sm" onClick={onClose} /></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t("fields.organization")}><select name="organizationId" required value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>{principal.organizationIds.map((id) => <option key={id} value={id}>{id}</option>)}</select></Field>
        <Field label={t("fields.direction")}><select name="direction" required><option value="INCOMING">{t("directions.INCOMING")}</option><option value="OUTGOING">{t("directions.OUTGOING")}</option><option value="INTERNAL">{t("directions.INTERNAL")}</option></select></Field>
        <Field label={t("fields.template")}><select name="templateVersionId"><option value="">{t("create.withoutTemplate")}</option>{templates.map((item) => <option key={String(item.latest_version_id)} value={String(item.latest_version_id)}>{String(item.name)} · v{String(item.version)}</option>)}</select></Field>
        <Field label={t("fields.documentType")}><input name="documentType" required maxLength={120} /></Field>
        <Field label={t("fields.confidentiality")}><select name="confidentiality"><option value="NORMAL">{t("confidentiality.NORMAL")}</option><option value="CONFIDENTIAL">{t("confidentiality.CONFIDENTIAL")}</option><option value="SECRET">{t("confidentiality.SECRET")}</option></select></Field>
        <Field label={t("fields.subject")} className="sm:col-span-2"><input name="subject" required maxLength={500} /></Field>
        <Field label={t("fields.documentDate")}><input name="documentDate" type="date" /></Field>
        <Field label={t("fields.dueDate")}><input name="dueDate" type="date" /></Field>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-text-secondary"><input name="signingRequired" type="checkbox" />{t("fields.signingRequired")}</label>
      {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
      <div className="mt-3 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>{t("actions.cancel")}</Button><Button type="submit" isLoading={busy}>{t("actions.saveDraft")}</Button></div>
    </form>
  );
};

const Field: React.FC<{ label: string; children: React.ReactElement<{ className?: string }>; className?: string }> = ({ label, children, className }) => (
  <label className={`grid gap-1 text-xs font-semibold text-text-secondary ${className ?? ""}`}>{label}{React.cloneElement(children, { className: "min-h-10 w-full rounded-md border border-border bg-surface px-3 text-sm font-normal text-text-primary outline-none focus:border-border-focus focus:ring-2 focus:ring-focus/20" })}</label>
);

const DocumentDetail: React.FC<{ document: DmsDocument; subjectId: string; capabilities: Set<string>; tab: DetailTab; onTab: (tab: DetailTab) => void; actionMode: ActionMode | null; onAction: (mode: ActionMode | null) => void; onRefresh: () => void }> = ({ document, subjectId, capabilities, tab: selectedTab, onTab, actionMode, onAction, onRefresh }) => {
  const { t } = useTranslation("dms");
  const available = actionsFor(document, capabilities, subjectId);
  const tabs = (["summary", "files", "history", "tasks"] as const).filter((item) => item !== "history" || document.access?.history === true);
  const tab = tabs.includes(selectedTab) ? selectedTab : "summary";
  return (
    <article className="min-w-0">
      <header className="border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-primary">{t(`directions.${document.direction}`)}</p><h3 className="mt-1 text-lg font-bold text-text-primary">{document.subject}</h3><p className="mt-1 text-sm text-text-secondary">{document.document_number ?? t("list.noNumber")}</p></div><StatusChip value={document.lifecycle_state} /></div>
        {available.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{available.map((action) => <Button key={action} size="xs" variant={action === "reject" ? "danger" : "secondary"} onClick={() => onAction(action)}>{t(`actions.${action}`)}</Button>)}</div>}
      </header>
      {actionMode && <ActionPanel document={document} mode={actionMode} onClose={() => onAction(null)} onDone={() => { onAction(null); onRefresh(); }} />}
      <div className="flex overflow-x-auto border-b border-border" role="tablist">{tabs.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => onTab(item)} className={`min-h-10 border-b-2 px-4 text-sm font-semibold ${tab === item ? "border-primary text-primary" : "border-transparent text-text-secondary"}`}>{t(`detail.tabs.${item}`)}</button>)}</div>
      <div className="max-h-[470px] overflow-y-auto p-4">
        {tab === "summary" && <dl className="grid gap-3 sm:grid-cols-2"><Datum label={t("fields.organization")} value={document.organization_id} /><Datum label={t("fields.documentType")} value={document.document_type} /><Datum label={t("fields.confidentiality")} value={t(`confidentiality.${document.confidentiality}`)} /><Datum label={t("fields.documentDate")} value={formatDate(document.document_date)} /><Datum label={t("fields.dueDate")} value={formatDate(document.due_date)} /><Datum label={t("fields.approval")} value={document.approval_state} /><Datum label={t("fields.distribution")} value={document.distribution_state} /><Datum label={t("fields.signing")} value={document.signing_state} /></dl>}
        {tab === "files" && <Files key={document.id} document={document} canUpload={capabilities.has("document.draft.manage") && document.lifecycle_state === "DRAFT"} canPreview={capabilities.has("document.file.read")} canDownload={capabilities.has("document.file.download")} onRefresh={onRefresh} />}
        {tab === "history" && <div className="space-y-3">{document.history?.map((event) => <div key={event.id} className="rounded-lg border border-border p-3"><div className="flex justify-between gap-3"><span className="font-semibold text-text-primary">{event.action.replaceAll("_", " ")}</span><span className="text-xs text-text-muted">{formatDate(event.occurred_at)}</span></div><p className="mt-1 text-xs text-text-secondary">{event.result}{event.reason_code ? ` · ${event.reason_code}` : ""}</p></div>) ?? null}</div>}
        {tab === "tasks" && <DocumentTasks key={document.id} tasks={document.tasks ?? []} subjectId={subjectId} canProcess={capabilities.has("document.process")} onRefresh={onRefresh} />}
      </div>
    </article>
  );
};

const Datum: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => <div className="rounded-lg bg-background p-3"><dt className="text-xs font-semibold text-text-muted">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-text-primary">{value}</dd></div>;

const Files: React.FC<{ document: DmsDocument; canUpload: boolean; canPreview: boolean; canDownload: boolean; onRefresh: () => void }> = ({ document, canUpload, canPreview, canDownload, onRefresh }) => {
  const { t } = useTranslation("dms");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<{ url: string; name: string; size: number } | null>(null);
  const requestRef = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => { requestRef.current?.abort(); }, []);
  React.useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  const open = async (fileId: string, download: boolean): Promise<void> => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy(true);
    setError(null);
    try {
      const blob = await dmsApi.file(document.id, fileId, download, controller.signal);
      if (controller.signal.aborted) return;
      const file = document.files?.find((item) => item.id === fileId);
      if (!download && blob.type !== "application/pdf") {
        setError(t("files.unsupportedPreview"));
        return;
      }
      const url = URL.createObjectURL(blob);
      if (!download) {
        setPreview({ url, name: file?.filename ?? "document.pdf", size: blob.size });
        return;
      }
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = file?.filename ?? "document.pdf";
      anchor.rel = "noopener";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      if (!controller.signal.aborted) setError(t("files.failed"));
    } finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const upload = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try { await dmsApi.upload(document.id, file); onRefresh(); } catch { setError(t("files.failed")); } finally { setBusy(false); event.target.value = ""; }
  };
  if (error) return <ErrorState title={t("files.failed")} message={error} onRetry={() => setError(null)} />;
  if (preview && canPreview) return (
    <section aria-label={t("files.preview")} className="min-w-0" data-testid="dms-pdf-preview">
      <Button size="sm" variant="secondary" onClick={() => setPreview(null)}>{t("files.closePreview")}</Button>
      <React.Suspense fallback={<SkeletonText lines={5} />}>
        <PdfJsViewer url={preview.url} fileName={preview.name} fileSize={preview.size} embedded allowExport={false} />
      </React.Suspense>
    </section>
  );
  return <div className="space-y-3">{canUpload && <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-primary/40 px-3 text-sm font-semibold text-primary"><ArrowUpTrayIcon className="h-4 w-4" />{t("files.upload")}<input className="sr-only" type="file" accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={busy} onChange={(event) => void upload(event)} /></label>}{document.files?.map((file) => <div key={file.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-text-primary">{file.filename}</p><p className="text-xs text-text-muted">{Math.ceil(file.content_length / 1024)} KB · {file.integrity_state}</p></div><div className="flex gap-1">{canPreview && <IconButton icon={<EyeIcon />} aria-label={t("files.preview")} size="sm" disabled={busy} onClick={() => void open(file.id, false)} />}{canDownload && <IconButton icon={<ArrowDownTrayIcon />} aria-label={t("files.download")} size="sm" disabled={busy} onClick={() => void open(file.id, true)} />}</div></div>)}</div>;
};

const ActionPanel: React.FC<{ document: DmsDocument; mode: ActionMode; onClose: () => void; onDone: () => void }> = ({ document, mode, onClose, onDone }) => {
  const { t } = useTranslation("dms");
  const [workflows, setWorkflows] = React.useState<Array<Record<string, unknown>>>([]);
  const [books, setBooks] = React.useState<Array<Record<string, unknown>>>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (mode === "submit") void dmsApi.workflows(document.organization_id).then((items) => setWorkflows(items as Array<Record<string, unknown>>));
    if (mode === "issue" || mode === "register") void dmsApi.books(document.organization_id, document.direction).then((items) => setBooks(items as Array<Record<string, unknown>>));
  }, [document.direction, document.organization_id, mode]);
  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    let body: Record<string, unknown> = {};
    if (mode === "edit") body = { revision: document.revision, subject: String(data.get("subject")).trim(), documentType: String(data.get("documentType")).trim() };
    if (mode === "submit") body = { workflowVersionId: String(data.get("workflowVersionId")) };
    if (["return", "reject", "recall"].includes(mode)) body = { reason: String(data.get("reason")) };
    if (["register", "issue"].includes(mode)) body = { bookId: String(data.get("bookId")) };
    if (mode === "distribute") {
      const recipients = data.getAll("recipientSubjectId").map(String);
      const processor = String(data.get("processorSubjectId") ?? "").trim();
      const coordinators = data.getAll("coordinatorSubjectId").map(String);
      if (coordinators.includes(processor)) { setError(t("tasks.roleConflict")); return; }
      const dueAt = data.get("dueAt") ? new Date(String(data.get("dueAt"))).toISOString() : null;
      body = { recipients: recipients.map((subjectId) => ({ subjectId, deliveryMethod: "INTERNAL" })), tasks: [...(processor ? [{ subjectId: processor, role: "PRIMARY", dueAt }] : []), ...coordinators.map((subjectId) => ({ subjectId, role: "COORDINATOR", dueAt }))] };
    }
    setBusy(true); setError(null);
    try { if (mode === "edit") await dmsApi.update(document.id, body); else await dmsApi.action(document.id, mode, body); onDone(); } catch (cause) { setError(errorMessage(cause, t)); } finally { setBusy(false); }
  };
  return <form onSubmit={(event) => void submit(event)} className="border-b border-border bg-primary/5 p-4">
    <div className="mb-3 flex justify-between"><h4 className="font-bold text-text-primary">{t(`actionPanel.${mode}`)}</h4><IconButton icon={<XMarkIcon />} aria-label={t("actions.close")} size="sm" onClick={onClose} /></div>
    <div className="grid gap-3 sm:grid-cols-2">
      {mode === "edit" && <>
        <Field label={t("fields.subject")}><input name="subject" required maxLength={500} defaultValue={document.subject} /></Field>
        <Field label={t("fields.documentType")}><input name="documentType" required maxLength={120} defaultValue={document.document_type} /></Field>
      </>}
      {mode === "submit" && <Field label={t("fields.workflow")}><select name="workflowVersionId" required>{workflows.map((item) => <option key={String(item.version_id)} value={String(item.version_id)}>{String(item.name)} · v{String(item.version)}</option>)}</select></Field>}
      {["return", "reject", "recall"].includes(mode) && <Field label={t("fields.reason")} className="sm:col-span-2"><textarea name="reason" required={mode !== "recall"} rows={3} /></Field>}
      {["register", "issue"].includes(mode) && <Field label={t("fields.book")}><select name="bookId" required>{books.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.name)}</option>)}</select></Field>}
      {mode === "distribute" && <>
        <OrganizationMemberPicker organizationId={document.organization_id} name="recipientSubjectId" label={t("members.recipients")} required />
        <OrganizationMemberPicker organizationId={document.organization_id} name="processorSubjectId" label={t("members.processor")} max={1} />
        <OrganizationMemberPicker organizationId={document.organization_id} name="coordinatorSubjectId" label={t("members.coordinators")} max={49} />
        <Field label={t("fields.dueDate")} className="self-start"><input name="dueAt" type="datetime-local" /></Field>
      </>}
    </div>
    {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
    <div className="mt-3 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>{t("actions.cancel")}</Button><Button type="submit" isLoading={busy} leftIcon={<PaperAirplaneIcon />}>{t("actions.confirm")}</Button></div>
  </form>;
};

const actionsFor = (document: DmsDocument, capabilities: Set<string>, subjectId: string): ActionMode[] => {
  const actions: ActionMode[] = [];
  if (document.created_by_subject_id === subjectId && document.lifecycle_state === "DRAFT" && capabilities.has("document.draft.manage") && ["NOT_REQUIRED", "RETURNED", "REJECTED"].includes(document.approval_state)) actions.push("edit");
  if (document.lifecycle_state === "DRAFT" && capabilities.has("document.workflow.submit") && ["NOT_REQUIRED", "RETURNED", "REJECTED"].includes(document.approval_state)) actions.push("submit");
  if (document.approval_state === "PENDING" && capabilities.has("document.workflow.approve")) actions.push("approve", "return", "reject");
  if (document.lifecycle_state === "DRAFT" && document.direction === "INCOMING" && capabilities.has("document.issue")) actions.push("register");
  if (document.lifecycle_state === "DRAFT" && document.direction !== "INCOMING" && capabilities.has("document.issue") && ["APPROVED", "NOT_REQUIRED"].includes(document.approval_state)) actions.push("issue");
  if (["ISSUED", "REGISTERED"].includes(document.lifecycle_state) && capabilities.has("document.distribute")) actions.push("distribute");
  if (document.distribution_state === "DISTRIBUTED" && capabilities.has("document.distribute")) actions.push("recall");
  if (["ISSUED", "COMPLETED"].includes(document.lifecycle_state) && capabilities.has("document.archive")) actions.push("archive");
  return actions;
};

const errorMessage = (cause: unknown, t: (key: string) => string): string => {
  if (!(cause instanceof DmsApiError)) return t("errors.unavailable");
  if (cause.status === 403) return t("errors.forbidden");
  if (cause.status === 404) return t("errors.notFound");
  if (cause.status === 409) return t("errors.conflict");
  if (cause.status === 422) return t("errors.invalid");
  return t("errors.unavailable");
};
