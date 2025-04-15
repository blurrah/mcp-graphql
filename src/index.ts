#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { parse } from "graphql/language";
import { z } from "zod";
import { checkDeprecatedArguments } from "./helpers/deprecation.js";
import { parseAndMergeHeaders } from "./helpers/headers.js";
import {
	introspectEndpoint,
	introspectLocalSchema,
} from "./helpers/introspection.js";
import { getVersion } from "./helpers/package.js" with { type: "macro" };

// Check for deprecated command line arguments
checkDeprecatedArguments();

const EnvSchema = z.object({
	NAME: z.string().default("mcp-graphql"),
	ENDPOINT: z.string().url().default("http://localhost:4000/graphql"),
	ALLOW_MUTATIONS: z.enum(['true', 'false']).transform((value) => value === 'true').default("false"),
	HEADERS: z
		.string()
		.default("{}")
		.transform((val) => {
			try {
				return JSON.parse(val);
			} catch (e) {
				throw new Error("HEADERS must be a valid JSON string");
			}
		}),
	SCHEMA: z.string().optional(),
});

const env = EnvSchema.parse(process.env);

const server = new McpServer({
	name: env.NAME,
	version: getVersion(),
	description: `GraphQL MCP server for ${env.ENDPOINT}`,
});

server.resource("graphql-schema", new URL(env.ENDPOINT).href, async (uri) => {
	try {
		let schema: string;
		if (env.SCHEMA) {
			schema = await introspectLocalSchema(env.SCHEMA);
		} else {
			schema = await introspectEndpoint(env.ENDPOINT, env.HEADERS);
		}

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

server.tool(
	"introspect-schema",
	"Introspect the GraphQL schema, use this tool before doing a query to get the schema information if you do not have it available as a resource already.",
	{
		endpoint: z
			.string()
			.url()
			.optional()
			.describe(
				`Optional: Override the default endpoint, the already used endpoint is: ${env.ENDPOINT}`,
			),
		headers: z
			.union([z.record(z.string()), z.string()])
			.optional()
			.describe(
				`Optional: Add additional headers, the already used headers are: ${JSON.stringify(env.HEADERS)}`,
			),
	},
	async ({ endpoint, headers }) => {
		try {
			let schema: string;
			if (env.SCHEMA) {
				schema = await introspectLocalSchema(env.SCHEMA);
			} else {
				const useEndpoint = endpoint || env.ENDPOINT;
				const useHeaders = parseAndMergeHeaders(env.HEADERS, headers);
				schema = await introspectEndpoint(useEndpoint, useHeaders);
			}

			return {
				content: [
					{
						type: "text",
						text: schema,
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
	{
		query: z.string(),
		variables: z.string().optional(),
		endpoint: z
			.string()
			.url()
			.optional()
			.describe(
				`Optional: Override the default endpoint, the already used endpoint is: ${env.ENDPOINT}`,
			),
		headers: z
			.union([z.record(z.string()), z.string()])
			.optional()
			.describe(
				`Optional: Add additional headers, the already used headers are: ${JSON.stringify(env.HEADERS)}`,
			),
	},
	async ({ query, variables, endpoint, headers }) => {
		try {
			const parsedQuery = parse(query);

			// Check if the query is a mutation
			const isMutation = parsedQuery.definitions.some(
				(def) =>
					def.kind === "OperationDefinition" && def.operation === "mutation",
			);

			if (isMutation && !env.ALLOW_MUTATIONS) {
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
			const useEndpoint = endpoint || env.ENDPOINT;
			const useHeaders = parseAndMergeHeaders(env.HEADERS, headers);

			const response = await fetch(useEndpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...useHeaders,
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
		`Started graphql mcp server ${env.NAME} for endpoint: ${env.ENDPOINT}`,
	);
}

main().catch((error) => {
	console.error(`Fatal error in main(): ${error}`);
	process.exit(1);
});
