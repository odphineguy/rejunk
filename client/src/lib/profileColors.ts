import type { ProfileColor } from "@/types/employees";

export const profileColors: Array<{ value: ProfileColor; label: string; className: string; hex: string }> = [
  { value: "purple", label: "Purple", className: "bg-purple-600", hex: "#9333ea" },
  { value: "red", label: "Red", className: "bg-rose-600", hex: "#e11d48" },
  { value: "brown", label: "Brown", className: "bg-amber-700", hex: "#a16207" },
  { value: "rose", label: "Rose", className: "bg-pink-600", hex: "#db2777" },
  { value: "orange", label: "Orange", className: "bg-orange-500", hex: "#f97316" },
  { value: "green", label: "Green", className: "bg-green-600", hex: "#16a34a" },
  { value: "teal", label: "Teal", className: "bg-teal-600", hex: "#0d9488" },
  { value: "navy", label: "Navy", className: "bg-blue-950", hex: "#172554" },
  { value: "blue", label: "Blue", className: "bg-blue-600", hex: "#2563eb" },
  { value: "magenta", label: "Magenta", className: "bg-fuchsia-600", hex: "#c026d3" },
  { value: "black", label: "Black", className: "bg-black", hex: "#111111" },
];

export function colorFor(value: ProfileColor | undefined) {
  return profileColors.find((color) => color.value === value) ?? profileColors[1];
}

export function profileColorHex(value: ProfileColor | undefined) {
  return colorFor(value).hex;
}
