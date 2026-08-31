import * as XLSX from "xlsx";

const SAMPLE_ROWS = [
  { "Lead Received Date": "2026-08-01", Name: "Rahul Sharma", "Phone Number": "9876543210", Email: "rahul@example.com", City: "Mumbai" },
  { "Lead Received Date": "2026-08-02", Name: "Priya Verma", "Phone Number": "9812345678", Email: "priya@example.com", City: "Delhi" },
  { "Lead Received Date": "2026-08-03", Name: "Amit Patel", "Phone Number": "9900112233", Email: "amit@example.com", City: "Ahmedabad" },
];

export function downloadLeadTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(SAMPLE_ROWS);
  ws["!cols"] = [{ wch: 20 }, { wch: 28 }, { wch: 18 }, { wch: 28 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws, "Leads");

  const notes = XLSX.utils.aoa_to_sheet([
    ["How to use this template"],
    ["1. Keep the header row exactly as in the 'Leads' sheet: Lead Received Date, Name, Phone Number, Email, City."],
    ["2. Name and Phone Number are mandatory — rows missing either are skipped."],
    ["3. Email and City are optional. Lead Received Date defaults to today when blank (use YYYY-MM-DD)."],
    ["4. Phone numbers should be digits only (no spaces or symbols)."],
    ["5. Duplicate phone numbers are skipped automatically during import."],
    ["6. Save as .xlsx or .csv, then upload it on the Import Leads page."],
  ]);
  notes["!cols"] = [{ wch: 95 }];
  XLSX.utils.book_append_sheet(wb, notes, "Instructions");

  XLSX.writeFile(wb, "oxo-lead-import-template.xlsx");
}
