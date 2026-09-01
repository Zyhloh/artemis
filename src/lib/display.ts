const CONTROL = new RegExp(
  "[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]",
  "g"
);

export const displayName = (name: string) => name.replace(CONTROL, "").trim();

export function initial(name: string): string {
  const clean = displayName(name);
  if (!clean) return "?";

  const [first] = Array.from(clean);
  return first ? first.toUpperCase() : "?";
}
