/**
 * Escape a CSV cell value.
 * Wraps in double quotes if the value contains a comma, double quote, or newline.
 * Double quotes within the value are escaped as "".
 */
function escapeCsvCell(value: any): string {
  if (value === null || value === undefined) {
    return "";
  }

  const str = typeof value === "object" ? JSON.stringify(value) : String(value);

  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert an array of objects to a CSV string.
 *
 * - Header row derived from keys of the first object.
 * - Nested objects/arrays are serialized with JSON.stringify.
 * - Values containing commas, quotes, or newlines are properly escaped.
 *
 * Returns null if data is not a non-empty array of objects.
 */
export function jsonToCsv(data: any[]): string | null {
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const first = data[0];
  if (first == null || typeof first !== "object" || Array.isArray(first)) {
    return null;
  }

  const headers = Object.keys(first);
  const lines: string[] = [];

  lines.push(headers.map(escapeCsvCell).join(","));

  for (const row of data) {
    const cells = headers.map((h) => escapeCsvCell(row?.[h]));
    lines.push(cells.join(","));
  }

  return lines.join("\n");
}
