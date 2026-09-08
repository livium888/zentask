/** Dates as a person would say them: no year unless it is not this one. */
export function formatDue(at: number, now = new Date()): string {
  const date = new Date(at);
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(date) - midnight(now)) / 86_400_000);

  const time = date.getHours() || date.getMinutes()
    ? date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : undefined;

  let day: string;
  if (days === 0) day = "Today";
  else if (days === 1) day = "Tomorrow";
  else if (days > 1 && days < 7) day = date.toLocaleDateString("en-GB", { weekday: "long" });
  else if (days < 0) day = `${Math.abs(days)}d overdue`;
  else
    day = date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
    });

  return time ? `${day}, ${time}` : day;
}
