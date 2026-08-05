/**
 * Lọc HTML bảng do SheetJS `sheet_to_html` sinh ra.
 *
 * SheetJS KHÔNG escape nội dung ô: một file .xlsx có `<img src=x onerror=…>`
 * trong ô A1 sẽ sinh ra HTML chạy được, và ExcelPreview render nó bằng
 * dangerouslySetInnerHTML → XSS chỉ cần nạn nhân bấm xem trước file.
 *
 * Chỉ giữ thẻ bảng + text. Mọi thuộc tính đều bị gỡ (kể cả style/colspan):
 * bảng preview không cần chúng, giữ lại chỉ mở thêm bề mặt tấn công.
 */
const TABLE_TAGS = ["table", "thead", "tbody", "tfoot", "tr", "th", "td", "br"];

export function sanitizeTableHtml(html: string): string {
  if (typeof window === "undefined") return "";
  const doc = new DOMParser().parseFromString(html, "text/html");

  // reverse() = từ trong ra ngoài, mỗi node chỉ chuyển cha 1 lần.
  // Xem messageContent.utils.ts để biết vì sao thứ tự này quan trọng.
  for (const el of Array.from(doc.body.querySelectorAll("*")).reverse()) {
    if (!TABLE_TAGS.includes(el.tagName.toLowerCase())) {
      const parent = el.parentNode;
      if (!parent) continue;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      el.removeAttribute(attr.name);
    }
  }
  return doc.body.innerHTML;
}
