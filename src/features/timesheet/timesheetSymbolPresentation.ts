const normalizeSymbolToken = (value: string): string => {
  const token = value.trim().toUpperCase();
  if (token === "L1") return "L";
  if (token === "Ô") return "OM";
  if (token === "CÔ") return "CO";
  return token;
};

export const timesheetSymbolTokens = (value: string): string[] =>
  value
    .split(";")
    .map(normalizeSymbolToken)
    .filter((token) => token && token !== "+" && token !== "-");

export const timesheetSymbolLookupCode = (value: string): string =>
  timesheetSymbolTokens(value)[0] ?? "";

/** Exact attendance surfaces from the HRM BCC colour legend. */
export const timesheetSymbolClass = (value: string): string => {
  const symbols = timesheetSymbolTokens(value);
  if (symbols.includes("KL"))
    return "border-[#ef4444] bg-[#ff7875] text-[#7f1d1d]";
  if (
    symbols.some(
      (symbol) => symbol === "P" || symbol === "L" || symbol === "L2",
    )
  )
    return "border-[#e5d65a] bg-[#fff59d] text-[#713f12]";
  if (symbols.includes("TR"))
    return "border-[#e6a7bc] bg-[#f8bbd0] text-[#831843]";
  if (symbols.some((symbol) => symbol === "CT" || symbol === "BP"))
    return "border-[#99ca7d] bg-[#c7e9b4] text-[#166534]";
  if (symbols.some((symbol) => ["OM", "CO", "TS"].includes(symbol)))
    return "border-[#f0b96e] bg-[#ffd8a8] text-[#9a3412]";
  return "border-[#d7dce3] bg-white text-[#334155]";
};

export const shiftCodeClass = "border-[#90caf9] bg-[#e3f2fd] text-[#1565C0]";
