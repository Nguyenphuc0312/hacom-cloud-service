#!/usr/bin/env node
/**
 * Chặn secret lọt vào các file .env đang được git theo dõi.
 *
 * Bối cảnh: .env nằm trong git là quyết định của team — ai clone về là chạy
 * dev trỏ thẳng backend production, đúng ý đồ "local như thật". Rủi ro kèm
 * theo là lần sau có người thêm API key vào đó thì nó đi thẳng lên remote.
 * Hook này chỉ chặn đúng rủi ro ấy, không đụng gì tới workflow.
 *
 * Nguyên tắc đọc: chỉ soi phần đã `git add` (staged), không soi file trên đĩa
 * — người ta có thể để key trong .env local mà không định commit.
 */
import { execFileSync } from "node:child_process";

/** Tên biến nghe như secret. URL/host công khai không nằm trong đây. */
const SECRET_NAME = /(SECRET|PASSWORD|PASSWD|PRIVATE_KEY|CREDENTIAL|_DSN)/i;
/** TOKEN/KEY/API_KEY nhưng loại các hậu tố cấu hình vô hại. */
const SECRET_NAME_SOFT = /(^|_)(TOKEN|API_?KEY|KEY)$/i;
/** Giá trị trông như secret thật, kể cả khi tên biến hiền lành. */
const SECRET_VALUE = [
  /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./, // JWT
  /^sk-[A-Za-z0-9_-]{16,}/, // OpenAI-style
  /^gh[pousr]_[A-Za-z0-9]{20,}/, // GitHub token
  /^AIza[A-Za-z0-9_-]{20,}/, // Google API key
  /^xox[baprs]-[A-Za-z0-9-]{10,}/, // Slack
];

/** Placeholder trong .env.example — không phải secret thật. */
const PLACEHOLDER = /^(|<.*>|your[-_ ].*|changeme|xxx+|\.\.\.|TODO)$/i;

function stagedEnvFiles() {
  const out = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACM"],
    { encoding: "utf8" },
  );
  return out
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => /(^|\/)\.env($|\.)/.test(f));
}

function stagedContent(file) {
  // Đọc bản trong index, không phải bản trên đĩa.
  return execFileSync("git", ["show", `:${file}`], { encoding: "utf8" });
}

const findings = [];

for (const file of stagedEnvFiles()) {
  let content;
  try {
    content = stagedContent(file);
  } catch {
    continue; // file bị xoá khỏi index
  }

  content.split(/\r?\n/).forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const eq = trimmed.indexOf("=");
    if (eq < 1) return;

    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");

    if (!value || PLACEHOLDER.test(value)) return;

    const nameLooksSecret = SECRET_NAME.test(name) || SECRET_NAME_SOFT.test(name);
    const valueLooksSecret = SECRET_VALUE.some((re) => re.test(value));

    if (nameLooksSecret || valueLooksSecret) {
      findings.push({
        file,
        line: i + 1,
        name,
        why: valueLooksSecret ? "giá trị trông như secret thật" : "tên biến nghe như secret",
      });
    }
  });
}

if (findings.length > 0) {
  console.error("\n✖ Chặn commit: có secret trong file .env\n");
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  ${f.name}  — ${f.why}`);
  }
  console.error(
    "\n.env nằm trong git nên thứ này sẽ lên remote và nằm lại trong lịch sử.\n" +
      "Cách xử lý: đưa giá trị thật ra ngoài git (biến môi trường của máy hoặc\n" +
      "CI secret), giữ trong .env một placeholder rỗng.\n" +
      "\nNếu chắc chắn đây không phải secret: git commit --no-verify\n",
  );
  process.exit(1);
}
