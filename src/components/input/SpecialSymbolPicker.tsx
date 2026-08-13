import React from "react";
import clsx from "clsx";
import { useClickOutside } from "../../hooks";

interface SpecialSymbolPickerProps {
  onSelect: (symbol: string) => void;
  onClose: () => void;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Bảng ký hiệu đặc biệt cho thanh định dạng (Ctrl+Shift+X).
 *
 * Đây là các ký tự KHÔNG gõ thẳng được trên bàn phím tiếng Việt — người dùng
 * xưa nay phải mở Word/web khác để copy về. Cố ý KHÔNG gộp emoji vào đây: emoji
 * đã có nút riêng (`EmojiButton`), trộn chung thì bảng dài ra mà vẫn khó tìm.
 *
 * Nhóm theo việc thật trong văn phòng (tiền tệ, đơn vị đo, dấu câu, mũi tên,
 * toán học, đánh dấu) thay vì theo bảng mã Unicode — người dùng tìm theo "cái
 * mình cần viết", không theo tên kỹ thuật của ký tự.
 */
interface SymbolGroup {
  label: string;
  symbols: Array<{ char: string; label: string }>;
}

const SYMBOL_GROUPS: SymbolGroup[] = [
  {
    label: "Tiền tệ",
    symbols: [
      { char: "₫", label: "Đồng" },
      { char: "$", label: "Đô la" },
      { char: "€", label: "Euro" },
      { char: "£", label: "Bảng Anh" },
      { char: "¥", label: "Yên" },
      { char: "₩", label: "Won" },
      { char: "¢", label: "Xu" },
    ],
  },
  {
    label: "Đơn vị & số",
    symbols: [
      { char: "%", label: "Phần trăm" },
      { char: "‰", label: "Phần nghìn" },
      { char: "°", label: "Độ" },
      { char: "℃", label: "Độ C" },
      { char: "m²", label: "Mét vuông" },
      { char: "m³", label: "Mét khối" },
      { char: "½", label: "Một phần hai" },
      { char: "¼", label: "Một phần tư" },
      { char: "¾", label: "Ba phần tư" },
    ],
  },
  {
    label: "Toán học",
    symbols: [
      { char: "×", label: "Nhân" },
      { char: "÷", label: "Chia" },
      { char: "±", label: "Cộng trừ" },
      { char: "≈", label: "Xấp xỉ" },
      { char: "≠", label: "Khác" },
      { char: "≤", label: "Nhỏ hơn hoặc bằng" },
      { char: "≥", label: "Lớn hơn hoặc bằng" },
      { char: "√", label: "Căn bậc hai" },
      { char: "∞", label: "Vô cực" },
      { char: "π", label: "Số pi" },
      { char: "Σ", label: "Tổng" },
    ],
  },
  {
    label: "Mũi tên",
    symbols: [
      { char: "→", label: "Mũi tên phải" },
      { char: "←", label: "Mũi tên trái" },
      { char: "↑", label: "Mũi tên lên" },
      { char: "↓", label: "Mũi tên xuống" },
      { char: "↔", label: "Mũi tên hai chiều" },
      { char: "⇒", label: "Suy ra" },
      { char: "⇔", label: "Tương đương" },
    ],
  },
  {
    label: "Đánh dấu",
    symbols: [
      { char: "•", label: "Chấm tròn" },
      { char: "◦", label: "Chấm rỗng" },
      { char: "▪", label: "Ô vuông đặc" },
      { char: "✓", label: "Dấu tích" },
      { char: "✔", label: "Dấu tích đậm" },
      { char: "✗", label: "Dấu nhân" },
      { char: "★", label: "Sao đặc" },
      { char: "☆", label: "Sao rỗng" },
      { char: "♦", label: "Hình thoi" },
    ],
  },
  {
    label: "Dấu câu & khác",
    symbols: [
      { char: "…", label: "Ba chấm" },
      { char: "–", label: "Gạch ngang ngắn" },
      { char: "—", label: "Gạch ngang dài" },
      { char: "«", label: "Ngoặc kép trái" },
      { char: "»", label: "Ngoặc kép phải" },
      { char: "“", label: "Nháy kép mở" },
      { char: "”", label: "Nháy kép đóng" },
      { char: "§", label: "Điều khoản" },
      { char: "¶", label: "Đoạn văn" },
      { char: "©", label: "Bản quyền" },
      { char: "®", label: "Đăng ký" },
      { char: "™", label: "Thương hiệu" },
      { char: "№", label: "Số hiệu" },
    ],
  },
];

export const SpecialSymbolPicker: React.FC<SpecialSymbolPickerProps> = ({
  onSelect,
  onClose,
  className,
  style,
}) => {
  const pickerRef = React.useRef<HTMLDivElement>(null);
  const [query, setQuery] = React.useState("");

  useClickOutside(pickerRef, onClose);

  // Esc đóng bảng — người dùng mở nhầm thì thoát được ngay, không phải rê chuột
  // ra ngoài.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const normalizedQuery = query.trim().toLowerCase();
  const groups = React.useMemo(() => {
    if (!normalizedQuery) return SYMBOL_GROUPS;
    return SYMBOL_GROUPS.map((group) => ({
      ...group,
      symbols: group.symbols.filter(
        (symbol) =>
          symbol.label.toLowerCase().includes(normalizedQuery) ||
          symbol.char === normalizedQuery,
      ),
    })).filter((group) => group.symbols.length > 0);
  }, [normalizedQuery]);

  return (
    <div
      ref={pickerRef}
      role="menu"
      aria-label="Ký hiệu đặc biệt"
      style={style}
      className={clsx(
        "flex max-h-80 w-72 flex-col gap-2 overflow-y-auto rounded-lg border border-border bg-surface-raised p-2 shadow-lg shadow-black/10 ring-1 ring-black/5",
        className,
      )}
    >
      <input
        type="text"
        value={query}
        autoFocus
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Tìm ký hiệu…"
        aria-label="Tìm ký hiệu"
        className="w-full shrink-0 rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-[#1976D2]/60 focus:outline-none focus:ring-2 focus:ring-[#1565C0]/25"
      />

      {groups.length === 0 ? (
        <p className="px-1 py-2 text-xs text-text-muted">
          Không tìm thấy ký hiệu phù hợp
        </p>
      ) : (
        groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <span className="px-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
              {group.label}
            </span>
            <div className="grid grid-cols-7 gap-0.5">
              {group.symbols.map((symbol) => (
                <button
                  key={symbol.char}
                  type="button"
                  role="menuitem"
                  title={`${symbol.label} (${symbol.char})`}
                  aria-label={symbol.label}
                  onClick={() => {
                    onSelect(symbol.char);
                    onClose();
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-base text-text-primary transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40"
                >
                  {symbol.char}
                </button>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default SpecialSymbolPicker;
