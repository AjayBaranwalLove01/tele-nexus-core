import * as XLSX from "xlsx";

const SAMPLE_ROWS = [
  { Name: "Rahul Sharma", "Phone Number": "9876543210" },
  { Name: "Priya Verma", "Phone Number": "9812345678" },
  { Name: "Amit Patel", "Phone Number": "9900112233" },
];

export function downloadLeadTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(SAMPLE_ROWS);
  ws["!cols"] = [{ wch: 28 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws, "Leads");

  const notes = XLSX.utils.aoa_to_sheet([
    ["How to use this template"],
    ["1. Keep the header row exactly as in the 'Leads' sheet: Name, Phone Number."],
    ["2. Add one lead per row. Replace the sample rows with your own data."],
    ["3. Phone numbers should be digits only (no spaces or symbols)."],
    ["4. Duplicate phone numbers are skipped automatically during import."],
    ["5. Save as .xlsx or .csv, then upload it on the Import Leads page."],
  ]);
  notes["!cols"] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, notes, "Instructions");

  XLSX.writeFile(wb, "leadflow-import-template.xlsx");
}
