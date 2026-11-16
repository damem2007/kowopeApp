export const today = new Date().toISOString().slice(0, 10);
export const toDate = (value) => new Date(`${value}T00:00:00Z`);
export const iso = (date) => date.toISOString().slice(0, 10);
export const formatDate = (value) =>
  toDate(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
export const addDays = (value, days) => {
  const date = toDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
};
export const addMonths = (value, months) => {
  const date = toDate(value);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return iso(date);
};
export const stepFrequency = (value, frequency, count) =>
  ({
    Weekly: () => addDays(value, 7 * count),
    Biweekly: () => addDays(value, 14 * count),
    Monthly: () => addMonths(value, count),
    Quarterly: () => addMonths(value, 3 * count),
    Yearly: () => addMonths(value, 12 * count),
  })[frequency]();
