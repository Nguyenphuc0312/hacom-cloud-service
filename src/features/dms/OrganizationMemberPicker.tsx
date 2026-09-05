import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { dmsApi, DmsApiError, type DmsOrganizationMember } from "./dmsApi";

type Props = { organizationId: string; name: string; label: string; required?: boolean; max?: number };

export const OrganizationMemberPicker: React.FC<Props> = (props) => <MemberPicker key={props.organizationId} {...props} />;

const MemberPicker: React.FC<Props> = ({ organizationId, name, label, required = false, max = 50 }) => {
  const { t } = useTranslation("dms");
  const id = React.useId();
  const [search, setSearch] = React.useState("");
  const [items, setItems] = React.useState<DmsOrganizationMember[]>([]);
  const [selected, setSelected] = React.useState<DmsOrganizationMember[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [searched, setSearched] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const pending = React.useRef<AbortController | null>(null);
  const resultSelect = React.useRef<HTMLSelectElement | null>(null);
  React.useEffect(() => () => pending.current?.abort(), []);

  const lookup = async (): Promise<void> => {
    pending.current?.abort();
    if (!search.trim()) return;
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true); setItems([]); setError(null); setSearched(false);
    try {
      const result = await dmsApi.organizationMembers(organizationId, search.trim(), controller.signal);
      if (!controller.signal.aborted) { setItems(result.items); setSearched(true); }
    } catch (cause) {
      if (!controller.signal.aborted) setError(t(cause instanceof DmsApiError && cause.status === 403 ? "errors.forbidden" : "members.unavailable"));
    } finally { if (!controller.signal.aborted) setLoading(false); }
  };

  return <fieldset className="min-w-0 space-y-2" aria-describedby={`${id}-status`}>
    <legend className="mb-2 text-sm font-semibold text-text-secondary">{label}</legend>
    <div className="flex items-end gap-2">
      <Input containerClassName="min-w-0 flex-1" aria-label={t("members.searchLabel", { label })} placeholder={t("members.hint")} value={search} maxLength={100}
        onChange={(event) => { pending.current?.abort(); setSearch(event.target.value); setLoading(false); setItems([]); setError(null); setSearched(false); }}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void lookup(); } }} />
      <Button type="button" variant="secondary" disabled={!search.trim()} isLoading={loading} onClick={() => void lookup()}>{t("members.search")}</Button>
    </div>
    <label className="grid min-w-0 gap-1 text-sm text-text-secondary" htmlFor={`${id}-results`}>{t("members.results")}
      <select ref={resultSelect} id={`${id}-results`} className="input-surface min-h-10 w-full min-w-0 bg-surface px-3 text-text-primary focus-visible:ring-2 focus-visible:ring-primary" value="" required={required && selected.length === 0}
        onChange={(event) => { const member = items.find((item) => item.subjectId === event.target.value); if (member && selected.length < max && !selected.some((item) => item.subjectId === member.subjectId)) setSelected([...selected, member]); }}>
        <option value="">{t(selected.length >= max ? "members.limit" : "members.choose", { count: max })}</option>
        {selected.length < max && items.filter((item) => !selected.some((member) => member.subjectId === item.subjectId)).map((item) => <option key={item.subjectId} value={item.subjectId}>{item.displayName} · {item.employeeCode}</option>)}
      </select>
    </label>
    <p id={`${id}-status`} role={error ? "alert" : "status"} className={`text-sm ${error ? "text-danger" : "text-text-secondary"}`}>
      {error ?? (loading ? t("members.loading") : searched ? t(items.length === 50 ? "members.refine" : items.length ? "members.found" : "members.empty", { count: items.length }) : t("members.hint"))}
    </p>
    {selected.length > 0 && <ol className="divide-y divide-border">{selected.map((member, index) => <li key={member.subjectId} className="flex min-w-0 items-center justify-between gap-2 py-1">
      <input type="hidden" name={name} value={member.subjectId} />
      <span className="min-w-0 break-words text-sm text-text-primary">{index + 1}. {member.displayName} · {member.employeeCode}</span>
      <Button type="button" variant="ghost" aria-label={t("members.removeLabel", { name: member.displayName })} onClick={() => { setSelected(selected.filter((item) => item.subjectId !== member.subjectId)); resultSelect.current?.focus(); }}>{t("members.remove")}</Button>
    </li>)}</ol>}
  </fieldset>;
};
