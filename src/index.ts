#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { parse } from "graphql/language";
import {
	buildClientSchema,
	getIntrospectionQuery,
	printSchema,
} from "graphql/utilities";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { z } from "zod";
import { getVersion } from "./helpers/package.js" with { type: "macro" };

const graphQLSchema = z.object({
	query: z.string(),
	variables: z.string().optional(),
});

const ConfigSchema = z.object({
	name: z.string().default("mcp-graphql"),
	allowMutations: z.boolean().default(false),
	endpoint: z.string().url().default("http://localhost:4000/graphql"),
	headers: z.record(z.string()).default({}),
});

type Config = z.infer<typeof ConfigSchema>;

function parseArgs(): Config {
	const argv = yargs(hideBin(process.argv))
		.option("name", {
			type: "string",
			description: "Name of the MCP server",
			default: "mcp-graphql",
		})
		.option("endpoint", {
			type: "string",
			description: "GraphQL endpoint URL",
			default: "http://localhost:4000/graphql",
		})
		.option("enable-mutations", {
			type: "boolean",
			description: "Enable mutations",
			default: false,
		})
		.option("headers", {
			type: "string",
			description: "JSON string of headers to send with requests",
			default: "{}",
		})
		.help()
		.parseSync();

	try {
		return ConfigSchema.parse({
			endpoint: argv.endpoint,
			headers: typeof argv.headers === "string" ? JSON.parse(argv.headers) : {},
		});
	} catch (error) {
		if (error instanceof z.ZodError) {
			console.error("Invalid configuration:");
			console.error(
				error.errors
					.map((e) => `  ${e.path.join(".")}: ${e.message}`)
					.join("\n"),
			);
		} else {
			console.error("Error parsing arguments:", error);
		}
		process.exit(1);
	}
}

const config = parseArgs();

const server = new McpServer({
	name: config.name,
	version: getVersion(),
	description: `GraphQL client for ${config.endpoint}`,
});

server.resource(
	"graphql-schema",
	new URL(config.endpoint).href,
	async (uri) => {
		try {
			const response = await fetch(uri, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					query: getIntrospectionQuery(),
				}),
			});

			if (!response.ok) {
				throw new Error(`GraphQL request failed: ${response.statusText}`);
			}

			const responseJson = await response.json();

			const schema = buildClientSchema(responseJson.data);

			return {
				contents: [
					{
						uri: uri.href,
						text: printSchema(schema),
					},
				],
			};
		} catch (error) {
			throw new Error(`Failed to fetch GraphQL schema: ${error}`);
		}
	},
);

server.tool(
	"introspect-schema",
	"Introspect the GraphQL schema, use this tool before doing a query to get the schema information if you do not have it available as a resource already.",
	{},
	async () => {
		try {
			const response = await fetch(config.endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					query: getIntrospectionQuery(),
				}),
			});

			if (!response.ok) {
				throw new Error(`GraphQL request failed: ${response.statusText}`);
			}

			const responseJson = await response.json();

			const schema = buildClientSchema(responseJson.data);

			return {
				content: [
					{
						type: "text",
						text: printSchema(schema),
					},
				],
			};
		} catch (error) {
			throw new Error(`Failed to introspect schema: ${error}`);
		}
	},
);

server.tool(
	"query-graphql",
	"Query a GraphQL endpoint with the given query and variables",
	{ query: z.string(), variables: z.string().optional() },
	async ({ query, variables }) => {
		try {
			const parsedQuery = parse(query);

			// Check if the query is a mutation
			const isMutation = parsedQuery.definitions.some(
				(def) =>
					def.kind === "OperationDefinition" && def.operation === "mutation",
			);

			if (isMutation && !config.allowMutations) {
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
			const response = await fetch(config.endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...config.headers,
				},
				body: JSON.stringify({
					query,
					variables,
				}),
			});

			if (!response.ok) {
				throw new Error(`GraphQL request failed: ${response.statusText}`);
			}

			const data = await response.json();

			if (data.errors && data.errors.length > 0) {
				// Contains GraphQL errors
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

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(data, null, 2),
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
		`Started graphql mcp server ${config.name} for endpoint: ${config.endpoint}`,
	);
}

main().catch((error) => {
	console.error(`Fatal error in main(): ${error}`);
	process.exit(1);
});
