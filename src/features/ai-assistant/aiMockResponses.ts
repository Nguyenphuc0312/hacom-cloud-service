import i18n from "../../i18n";

const CONTENT_KEYS = {
  attendance: "aiAssistant:chat.mockAttendance",
  report: "aiAssistant:chat.mockReport",
  document: "aiAssistant:chat.mockDocument",
  work: "aiAssistant:chat.mockWork",
  default: "aiAssistant:chat.mockDefault",
} as const;

export function getMockResponse(input: string): string {
  const text = input.toLowerCase();

  if (text.includes("chấm công")) {
    return i18n.t(CONTENT_KEYS.attendance);
  }
  if (text.includes("báo cáo")) {
    return i18n.t(CONTENT_KEYS.report);
  }
  if (text.includes("tài liệu")) {
    return i18n.t(CONTENT_KEYS.document);
  }
  if (text.includes("công việc") || text.includes("tóm tắt")) {
    return i18n.t(CONTENT_KEYS.work);
  }
  return i18n.t(CONTENT_KEYS.default);
}
