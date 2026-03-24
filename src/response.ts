import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { homedir } from "node:os";

const DEFAULT_OUTPUT_DIR = "/tmp/mcp-graphql/";

/**
 * Resolve output directory from env, config, or default.
 * MCP_GRAPHQL_OUTPUT_DIR env > config.outputDir > "/tmp/mcp-graphql/"
 * Expands ~ to homedir.
 */
export function getOutputDir(configOutputDir?: string): string {
  let dir = process.env.MCP_GRAPHQL_OUTPUT_DIR ?? configOutputDir ?? DEFAULT_OUTPUT_DIR;
  if (dir.startsWith("~")) {
    dir = join(homedir(), dir.slice(1));
  }
  return dir;
}

/**
 * Write content to an output file and return the absolute path.
 * Filename: mcp-graphql-{Date.now()}-{first8CharsOfSha256}.{ext}
 */
export function writeOutputFile(content: string, ext: string, configOutputDir?: string): string {
  const dir = getOutputDir(configOutputDir);
  mkdirSync(dir, { recursive: true });

  const hash = createHash("sha256").update(content).digest("hex").slice(0, 8);
  const filename = `mcp-graphql-${Date.now()}-${hash}.${ext}`;
  const filePath = join(dir, filename);

  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

/**
 * Check if content exceeds the given byte threshold.
 */
export function shouldWriteToFile(content: string, threshold: number): boolean {
  return Buffer.byteLength(content, "utf-8") > threshold;
}

/**
 * Analyze a GraphQL JSON response to extract summary info.
 * Walks data.data looking for the first array value.
 * Returns null if no array is found.
 */
export function summarizeJsonResult(data: any): {
  rootKey: string;
  rowCount: number;
  fields: string[];
  preview: any[];
} | null {
  const root = data?.data;
  if (root == null || typeof root !== "object") {
    return null;
  }

  for (const key of Object.keys(root)) {
    const value = root[key];
    if (Array.isArray(value) && value.length > 0) {
      const firstItem = value[0];
      const fields = firstItem != null && typeof firstItem === "object"
        ? Object.keys(firstItem)
        : [];
      return {
        rootKey: key,
        rowCount: value.length,
        fields,
        preview: value.slice(0, 3),
      };
    }
  }

  return null;
}

/**
 * Truncate a string value to maxLen, appending "..." if truncated.
 */
function truncateCell(value: any, maxLen: number = 50): string {
  if (value === null || value === undefined) {
    return "";
  }
  const str = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (str.length > maxLen) {
    return str.slice(0, maxLen) + "...";
  }
  return str;
}

/**
 * Format a large JSON response as a markdown summary + file path.
 */
export function formatLargeJsonSummary(data: any, filePath: string): string {
  const summary = summarizeJsonResult(data);
  if (summary == null) {
    return `Full result written to: ${filePath}`;
  }

  const { rootKey, rowCount, fields, preview } = summary;
  const lines: string[] = [];

  lines.push("## Query Result Summary");
  lines.push(`**Root key**: ${rootKey} | **Rows**: ${rowCount} | **Fields**: ${fields.join(", ")}`);
  lines.push("");

  if (preview.length > 0 && fields.length > 0) {
    lines.push(`### Preview (first ${preview.length} rows)`);
    lines.push(`| ${fields.map((f) => truncateCell(f)).join(" | ")} |`);
    lines.push(`|${fields.map(() => "---").join("|")}|`);
    for (const row of preview) {
      const cells = fields.map((f) => truncateCell(row?.[f]));
      lines.push(`| ${cells.join(" | ")} |`);
    }
    lines.push("");
  }

  lines.push(`Full result written to: ${filePath}`);
  return lines.join("\n");
}

/**
 * Format a large schema response summary + file path.
 * Simple version: byte count + line count + file path.
 */
export function formatLargeSchemaMessage(sdl: string, filePath: string): string {
  const byteCount = Buffer.byteLength(sdl, "utf-8");
  const lineCount = sdl.split("\n").length;
  return `Schema (${byteCount} bytes, ~${lineCount} lines) written to: ${filePath}`;
}
