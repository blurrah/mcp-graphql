#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { parse } from "graphql/language";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { checkDeprecatedArguments } from "./helpers/deprecation.js";
import {
	introspectEndpoint,
	introspectLocalSchema,
	introspectSchemaFromUrl,
} from "./helpers/introspection.js";
import { getVersion } from "./helpers/package.js" with { type: "macro" };
import { EndpointRegistry } from "./endpoints.js";
import {
	shouldWriteToFile,
	writeOutputFile,
	formatLargeJsonSummary,
	formatLargeSchemaMessage,
	summarizeJsonResult,
} from "./response.js";
import {
	generateSchemaSummary,
	generateTypeDetail,
} from "./schema-summary.js";
import { jsonToCsv } from "./csv.js";

// Check for deprecated command line arguments
checkDeprecatedArguments();

const config = loadConfig();
const registry = new EndpointRegistry(config);

const endpointNames = registry.names();
const serverName =
	endpointNames[0] === "default" ? "mcp-graphql" : endpointNames[0];
const serverDescription =
	endpointNames.length === 1
		? `GraphQL MCP server for ${registry.getDefault().url}`
		: `GraphQL MCP server for endpoints: ${endpointNames.join(", ")}`;

const server = new McpServer({
	name: serverName,
	version: getVersion(),
	description: serverDescription,
});

/**
 * Helper to introspect schema for a given endpoint config.
 */
async function introspectSchemaForEndpoint(endpoint: {
	url: string;
	headers: Record<string, string>;
	schema?: string;
}): Promise<string> {
	if (endpoint.schema) {
		if (
			endpoint.schema.startsWith("http://") ||
			endpoint.schema.startsWith("https://")
		) {
			return introspectSchemaFromUrl(endpoint.schema);
		}
		return introspectLocalSchema(endpoint.schema);
	}
	return introspectEndpoint(endpoint.url, endpoint.headers);
}

// Register resources: one per endpoint
for (const ep of registry.list()) {
	const resourceName =
		endpointNames.length === 1
			? "graphql-schema"
			: `graphql-schema-${ep.name}`;

	server.resource(resourceName, new URL(ep.url).href, async (uri) => {
		try {
			const schema = await introspectSchemaForEndpoint(ep);
			return {
				contents: [
					{
						uri: uri.href,
						text: schema,
					},
				],
			};
		} catch (error) {
			throw new Error(`Failed to get GraphQL schema: ${error}`);
		}
	});
}

const endpointParamDescription =
	endpointNames.length === 1
		? "Endpoint name (optional, only one endpoint configured)"
		: `Endpoint name. Available: ${endpointNames.join(", ")}. Default: ${registry.getDefault().name}`;

server.tool(
	"introspect-schema",
	`Introspect the GraphQL schema. Returns a compact summary by default to save context. Use detail='full' for complete SDL, or detail='types' with specific type names for detailed type info. Supports multiple endpoints.`,
	{
		// This is a workaround to help clients that can't handle an empty object as an argument
		__ignore__: z
			.boolean()
			.default(false)
			.describe("This does not do anything"),
		endpoint: z
			.string()
			.optional()
			.describe(endpointParamDescription),
		detail: z
			.enum(["summary", "full", "types"])
			.default("summary")
			.describe(
				"Level of detail: 'summary' returns type/field counts and root fields, 'full' returns complete SDL (written to file if large), 'types' returns specific types in detail",
			),
		types: z
			.array(z.string())
			.optional()
			.describe(
				"When detail='types', list of type names to return in detail",
			),
	},
	async ({ endpoint: endpointName, detail, types: typeNames }) => {
		try {
			const ep = registry.resolve(endpointName);
			const sdl = await introspectSchemaForEndpoint(ep);

			// Always write full SDL to file for reference
			const filePath = writeOutputFile(sdl, "graphql", config.outputDir);

			if (detail === "summary") {
				const summary = generateSchemaSummary(sdl, ep.name);
				return {
					content: [
						{
							type: "text",
							text: `${summary}\n\nFull schema: ${filePath}`,
						},
					],
				};
			}

			if (detail === "types") {
				if (!typeNames || typeNames.length === 0) {
					return {
						isError: true,
						content: [
							{
								type: "text",
								text: "Please provide type names via the 'types' parameter when using detail='types'",
							},
						],
					};
				}
				const typeDetail = generateTypeDetail(sdl, typeNames);
				return {
					content: [
						{
							type: "text",
							text: `${typeDetail}\n\nFull schema: ${filePath}`,
						},
					],
				};
			}

			// detail === "full"
			if (shouldWriteToFile(sdl, config.responseSizeThreshold)) {
				return {
					content: [
						{
							type: "text",
							text: formatLargeSchemaMessage(sdl, filePath),
						},
					],
				};
			}

			return {
				content: [
					{
						type: "text",
						text: sdl,
					},
				],
			};
		} catch (error) {
			return {
				isError: true,
				content: [
					{
						type: "text",
						text: `Failed to introspect schema: ${error}`,
					},
				],
			};
		}
	},
);

server.tool(
	"query-graphql",
	`Query a GraphQL endpoint. Supports multiple endpoints, CSV export (output_format='csv'), and row limiting (max_rows). Large responses are automatically written to file with a summary returned.`,
	{
		query: z.string(),
		variables: z.string().optional(),
		endpoint: z
			.string()
			.optional()
			.describe(endpointParamDescription),
		output_format: z
			.enum(["json", "csv"])
			.default("json")
			.describe(
				"Output format: 'json' (default, inline or file if large) or 'csv' (always written to file for data analysis)",
			),
		max_rows: z
			.number()
			.int()
			.positive()
			.optional()
			.describe(
				"Maximum number of result rows to return. Exceeding rows are truncated with total count reported.",
			),
	},
	async ({
		query,
		variables,
		endpoint: endpointName,
		output_format,
		max_rows,
	}) => {
		let ep;
		try {
			ep = registry.resolve(endpointName);
		} catch (error) {
			return {
				isError: true,
				content: [
					{
						type: "text",
						text: `${error}`,
					},
				],
			};
		}

		try {
			const parsedQuery = parse(query);

			const isMutation = parsedQuery.definitions.some(
				(def) =>
					def.kind === "OperationDefinition" &&
					def.operation === "mutation",
			);

			if (isMutation && !ep.allowMutations) {
				return {
					isError: true,
					content: [
						{
							type: "text",
							text: "Mutations are not allowed unless you enable them in the configuration. Please use a query operation instead.",
						},
					],
				};
			}
		} catch (error) {
			return {
				isError: true,
				content: [
					{
						type: "text",
						text: `Invalid GraphQL query: ${error}`,
					},
				],
			};
		}

		try {
			const response = await fetch(ep.url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...ep.headers,
				},
				body: JSON.stringify({
					query,
					variables,
				}),
			});

			if (!response.ok) {
				const responseText = await response.text();
				return {
					isError: true,
					content: [
						{
							type: "text",
							text: `GraphQL request failed: ${response.statusText}\n${responseText}`,
						},
					],
				};
			}

			const data = await response.json();

			if (data.errors && data.errors.length > 0) {
				return {
					isError: true,
					content: [
						{
							type: "text",
							text: `The GraphQL response has errors, please fix the query: ${JSON.stringify(
								data,
								null,
								2,
							)}`,
						},
					],
				};
			}

			// Apply max_rows truncation
			let truncatedInfo: string | null = null;
			if (max_rows != null) {
				const summary = summarizeJsonResult(data);
				if (summary && summary.rowCount > max_rows) {
					const totalCount = summary.rowCount;
					data.data[summary.rootKey] = data.data[
						summary.rootKey
					].slice(0, max_rows);
					truncatedInfo = `Showing ${max_rows} of ${totalCount} total rows (max_rows=${max_rows}).`;
				}
			}

			// CSV export: always write to file
			if (output_format === "csv") {
				const summary = summarizeJsonResult(data);
				if (!summary) {
					return {
						isError: true,
						content: [
							{
								type: "text",
								text: "Cannot export to CSV: result does not contain an array of objects.",
							},
						],
					};
				}

				const csvContent = jsonToCsv(data.data[summary.rootKey]);
				if (!csvContent) {
					return {
						isError: true,
						content: [
							{
								type: "text",
								text: "Cannot export to CSV: failed to convert result to CSV.",
							},
						],
					};
				}

				const filePath = writeOutputFile(
					csvContent,
					"csv",
					config.outputDir,
				);
				const msg = truncatedInfo
					? `${truncatedInfo}\nCSV exported: ${summary.rowCount > max_rows! ? max_rows : summary.rowCount} rows x ${summary.fields.length} columns\nFile: ${filePath}`
					: `CSV exported: ${summary.rowCount} rows x ${summary.fields.length} columns\nFile: ${filePath}`;

				return {
					content: [
						{
							type: "text",
							text: msg,
						},
					],
				};
			}

			// JSON output: check size threshold
			const jsonContent = JSON.stringify(data, null, 2);

			if (shouldWriteToFile(jsonContent, config.responseSizeThreshold)) {
				const filePath = writeOutputFile(
					jsonContent,
					"json",
					config.outputDir,
				);
				const summary = formatLargeJsonSummary(data, filePath);
				const text = truncatedInfo
					? `${truncatedInfo}\n\n${summary}`
					: summary;

				return {
					content: [
						{
							type: "text",
							text,
						},
					],
				};
			}

			// Small response: return inline
			const text = truncatedInfo
				? `${truncatedInfo}\n\n${jsonContent}`
				: jsonContent;

			return {
				content: [
					{
						type: "text",
						text,
					},
				],
			};
		} catch (error) {
			throw new Error(`Failed to execute GraphQL query: ${error}`);
		}
	},
);

async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);

	console.error(
		`Started graphql mcp server "${serverName}" for endpoint(s): ${endpointNames.join(", ")}`,
	);
}

main().catch((error) => {
	console.error(`Fatal error in main(): ${error}`);
	process.exit(1);
});
