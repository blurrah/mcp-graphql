import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Current package version so I only need to update it in one place
const { version } = JSON.parse(
	readFileSync(join(__dirname, "../../package.json"), "utf-8"),
);

export function getVersion() {
	return version;
}
