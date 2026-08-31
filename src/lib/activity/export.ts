import * as XLSX from "xlsx";

export function exportRows(rows: Record<string, unknown>[], filename: string, format: "csv" | "xlsx") {
  const sheet = XLSX.utils.json_to_sheet(rows);
  if (format === "csv") {
    const csv = XLSX.utils.sheet_to_csv(sheet);
    download(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `${filename}.csv`);
    return;
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Report");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  download(new Blob([out], { type: "application/octet-stream" }), `${filename}.xlsx`);
}

export function exportPdf(title: string, rows: Record<string, unknown>[]) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const html = `<!doctype html><html><head><title>${title}</title>
  <style>
    body{font-family:ui-sans-serif,system-ui,sans-serif;padding:24px;color:#111}
    h1{font-size:18px;margin:0 0 4px}
    p{font-size:12px;color:#666;margin:0 0 16px}
    table{border-collapse:collapse;width:100%;font-size:11px}
    th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
    th{background:#f4f4f5}
  </style></head><body>
  <h1>${title}</h1><p>Generated ${new Date().toLocaleString()}</p>
  <table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
  <tbody>${rows
    .map((r) => `<tr>${headers.map((h) => `<td>${String(r[h] ?? "")}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>
  <script>window.onload=()=>window.print()</script></body></html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
