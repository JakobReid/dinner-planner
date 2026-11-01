// Calendar helpers. Dates are "YYYY-MM-DD" strings in local time; the week runs Friday to Thursday.
export const WEEK_START = 5; // 0 = Sun … 5 = Fri
export const DAYS = ["Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu"];
export const DAY_FULL = ["Friday", "Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];

export const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const parse = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (s, n) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
export function weekStartOf(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 7 - WEEK_START) % 7));
  return ymd(x);
}
export const dayName = (s) => DAYS[(parse(s).getDay() + 7 - WEEK_START) % 7];
export const todayStr = () => ymd(new Date());
export const thisWeek = () => weekStartOf(new Date());
export const fmt = (s) => parse(s).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
export const isDateKey = (k) => /^\d{4}-\d{2}-\d{2}$/.test(k);
