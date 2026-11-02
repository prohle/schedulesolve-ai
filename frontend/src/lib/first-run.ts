// First-run progress marks. Real institution state (imported data, intake
// submissions, a published timetable) is checked first; these marks cover the
// in-between actions a coordinator has already completed in this browser.

export type FirstRunStep = "import" | "intake" | "build" | "review" | "publish";

const KEY = "schedulesolve.firstrun";

export function getMarks(): Partial<Record<FirstRunStep, boolean>> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Record<FirstRunStep, boolean>>;
  } catch {
    return {};
  }
}

export function markStep(step: FirstRunStep): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...getMarks(), [step]: true }));
  } catch {
    /* storage is optional */
  }
}

export function clearMarks(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage is optional */
  }
}
