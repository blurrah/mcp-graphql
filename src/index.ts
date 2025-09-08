#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { parse } from "graphql/language";
import { z } from "zod";
import { checkDeprecatedArguments } from "./helpers/deprecation.js";
import {
	introspectEndpoint,
	introspectLocalSchema,
	introspectSchemaFromUrl,
} from "./helpers/introspection.js";
import { getVersion } from "./helpers/package.js" with { type: "macro" };
import {
	loadGraphQLConfig,
	createVariableSchema,
	generateToolName,
	generateToolDescription,
	type GraphQLConfigOperation,
} from "./helpers/graphql-config.js";

// Check for deprecated command line arguments
checkDeprecatedArguments();

const EnvSchema = z.object({
	NAME: z.string().default("mcp-graphql"),
	ENDPOINT: z.string().url().default("http://localhost:4000/graphql"),
	ALLOW_MUTATIONS: z
		.enum(["true", "false"])
		.transform((value) => value === "true")
		.default("false"),
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
	GRAPHQL_DIR: z.string().default("./graphql"),
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
			if (
				env.SCHEMA.startsWith("http://") ||
				env.SCHEMA.startsWith("https://")
			) {
				schema = await introspectSchemaFromUrl(env.SCHEMA);
			} else {
				schema = await introspectLocalSchema(env.SCHEMA);
			}
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
		// This is a workaround to help clients that can't handle an empty object as an argument
		// They will often send undefined instead of an empty object which is not allowed by the schema
		__ignore__: z
			.boolean()
			.default(false)
			.describe("This does not do anything"),
	},
	async () => {
		try {
			let schema: string;
			if (env.SCHEMA) {
				schema = await introspectLocalSchema(env.SCHEMA);
			} else {
				schema = await introspectEndpoint(env.ENDPOINT, env.HEADERS);
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
	"Query a GraphQL endpoint with the given query and variables",
	{
		query: z.string(),
		variables: z.string().optional(),
	},
	async ({ query, variables }) => {
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
			const response = await fetch(env.ENDPOINT, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...env.HEADERS,
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

async function registerGraphQLFileTools() {
	// Load configuration with proper precedence:
	// 1. Environment variables (highest priority)
	// 2. GraphQL Config file
	// 3. Default values
	const configResult = await loadGraphQLConfig(process.cwd(), env);
	
	const { operations, endpoint, headers, config } = configResult;
	
	if (config) {
		console.error(
			`Loaded GraphQL Config from ${config.filepath}`,
		);
	}
	
	if (operations.length > 0) {
		const source = config ? 'GraphQL Config' : env.GRAPHQL_DIR;
		console.error(
			`Found ${operations.length} operations from ${source}`,
		);
	}

	for (const operation of operations) {
		// Skip mutations if not allowed
		if (operation.type === "mutation" && !env.ALLOW_MUTATIONS) {
			console.error(
				`Skipping mutation ${operation.name} (mutations disabled)`,
			);
			continue;
		}

		const toolName = generateToolName(operation);
		const toolDescription = generateToolDescription(operation);
		const variableSchema = createVariableSchema(operation.variables);

		server.tool(
			toolName,
			toolDescription,
			variableSchema.shape,
			async (variables) => {
				try {
					const response = await fetch(endpoint, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							...headers,
						},
						body: JSON.stringify({
							query: operation.content,
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
									text: `GraphQL errors: ${JSON.stringify(
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
					return {
						isError: true,
						content: [
							{
								type: "text",
								text: `Failed to execute GraphQL operation: ${error}`,
							},
						],
					};
				}
			},
		);

		console.error(`Registered tool: ${toolName}`);
	}
}

async function main() {
	// Register tools from GraphQL files
	await registerGraphQLFileTools();

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
