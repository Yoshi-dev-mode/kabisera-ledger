import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";

describe("csvCell", () => {
  it("neutralises spreadsheet formulas in text", () => {
    expect(csvCell("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("-5")).toBe("'-5"); // a text cell that merely looks numeric stays text
  });

  it("keeps genuine numbers numeric", () => {
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell("-5.00", "number")).toBe("-5.00");
    expect(csvCell("1250.50", "number")).toBe("1250.50");
  });

  it("quotes cells containing commas, quotes or line breaks", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell("=1,2")).toBe("\"'=1,2\"");
  });

  it("writes empty cells for null and undefined", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("rejects non-finite numbers", () => {
    expect(() => csvCell(Number.NaN)).toThrow(RangeError);
  });
});

describe("toCsv", () => {
  const rows = [
    { name: "Cee jay", owed: "1000.00" },
    { name: "=HYPERLINK(1)", owed: "-0.05" },
  ];
  const columns = [
    { header: "Customer", value: (r: (typeof rows)[number]) => r.name },
    { header: "Owed", value: (r: (typeof rows)[number]) => r.owed, kind: "number" as const },
  ];

  it("writes a header, CRLF rows and a trailing newline", () => {
    expect(toCsv(rows, columns)).toBe("Customer,Owed\r\nCee jay,1000.00\r\n'=HYPERLINK(1),-0.05\r\n");
  });

  it("can add a UTF-8 byte-order mark for Excel on Windows", () => {
    expect(toCsv(rows, columns, { bom: true }).startsWith("\uFEFF")).toBe(true);
    expect(toCsv(rows, columns).startsWith("\uFEFF")).toBe(false);
  });
});
