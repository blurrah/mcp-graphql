import { readFileSync } from "node:fs";
import { z } from "zod";

export const EndpointConfigSchema = z.object({
	name: z.string(),
	url: z.string().url(),
	headers: z.record(z.string()).default({}),
	allowMutations: z.boolean().default(false),
	schema: z.string().optional(),
});

export type EndpointConfig = z.infer<typeof EndpointConfigSchema>;

export const AppConfigSchema = z.object({
	endpoints: z.array(EndpointConfigSchema).min(1),
	responseSizeThreshold: z.number().int().positive().default(2048),
	outputDir: z.string().default("/tmp/mcp-graphql/"),
	defaultEndpoint: z.string().optional(),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

/**
 * Load configuration from either a JSON config file (MCP_GRAPHQL_CONFIG env var)
 * or from legacy environment variables for backward compatibility.
 */
export function loadConfig(): AppConfig {
	const configPath = process.env.MCP_GRAPHQL_CONFIG;

	let config: AppConfig;

	if (configPath) {
		config = loadFromFile(configPath);
	} else {
		config = loadFromLegacyEnv();
	}

	// MCP_GRAPHQL_OUTPUT_DIR overrides config.outputDir
	if (process.env.MCP_GRAPHQL_OUTPUT_DIR) {
		config.outputDir = process.env.MCP_GRAPHQL_OUTPUT_DIR;
	}

	return config;
}

function loadFromFile(path: string): AppConfig {
	let raw: string;
	try {
		raw = readFileSync(path, "utf-8");
	} catch (error) {
		throw new Error(`Failed to read config file at ${path}: ${error}`);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new Error(`Failed to parse config file as JSON: ${error}`);
	}

	return AppConfigSchema.parse(parsed);
}

function loadFromLegacyEnv(): AppConfig {
	const name = process.env.NAME ?? "default";
	const url = process.env.ENDPOINT ?? "http://localhost:4000/graphql";
	const allowMutations = process.env.ALLOW_MUTATIONS === "true";
	const schema = process.env.SCHEMA;

	// Validate URL
	z.string().url().parse(url);

	let headers: Record<string, string> = {};
	if (process.env.HEADERS) {
		try {
			headers = JSON.parse(process.env.HEADERS);
		} catch (e) {
			throw new Error("HEADERS must be a valid JSON string");
		}
	}

	const responseSizeThreshold = process.env.RESPONSE_SIZE_THRESHOLD
		? Number.parseInt(process.env.RESPONSE_SIZE_THRESHOLD, 10)
		: 2048;

	if (Number.isNaN(responseSizeThreshold) || responseSizeThreshold <= 0) {
		throw new Error("RESPONSE_SIZE_THRESHOLD must be a positive integer");
	}

	const outputDir =
		process.env.MCP_GRAPHQL_OUTPUT_DIR ?? "/tmp/mcp-graphql/";

	return {
		endpoints: [
			{
				name,
				url,
				headers,
				allowMutations,
				schema,
			},
		],
		responseSizeThreshold,
		outputDir,
		defaultEndpoint: name,
	};
}
