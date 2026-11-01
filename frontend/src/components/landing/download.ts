// Client-side CSV download for the demo master timetable.
// (Preview only — the authenticated app exports the real published schedule.)

import { CSV_CONTENT } from "./data";

export function downloadMasterCsv(): void {
  const blob = new Blob([CSV_CONTENT], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "schedulesolve_master_timetable_fall2026.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
