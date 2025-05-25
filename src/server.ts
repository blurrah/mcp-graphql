// Back to the original server implementation as it's more flexible for tool call generation

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";
import { getVersion } from "./helpers/package.js" with { type: "macro" };
import { createGraphQLHandler } from "./lib/graphql";

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
});

const env = EnvSchema.parse(process.env);

const server = new Server(
	{
		name: env.NAME,
		version: getVersion(),
		description: `GraphQL MCP server for ${env.ENDPOINT}`,
	},
	{
		capabilities: {
			resources: {},
			tools: {},
			logging: {},
		},
	},
);

const handler = await createGraphQLHandler({
	endpoint: env.ENDPOINT,
	headers: env.HEADERS,
	allowMutations: env.ALLOW_MUTATIONS,
	excludeQueries: [],
	excludeMutations: [],
	name: env.NAME,
});

// Post-rebase artifact
const tools = Array.from(handler.tools.values()).map((tool) => ({
	name: tool.name,
	description: tool.description,
	parameters: tool.parameters,
	inputSchema: tool.inputSchema,
}));

// Post-rebase artifact
/**
 * Handles tool calling from the client and executes the tool
 */
// async function handleToolCall(name: string, body: string, variables: string) {
// 	const tool = handler.getTool(name);
// 	if (!tool) {
// 		console.error(`Tool ${name} not found`);
// 		return {
// 			status: "error",
// 			message: `Tool ${name} not found`,
// 		};
// 	}
// 	const result = await handler.execute(tool, body, variables);
// 	return result;
// }

server.setRequestHandler(ListToolsRequestSchema, async (request) => {
	return {
		tools: [
			{
				name: "introspect_schema",
				description:
					"Introspect the GraphQL schema, use this tool before doing a query to get the schema information if you do not have it available as a resource already.",
				inputSchema: zodToJsonSchema(z.object({})),
			},
			{
				// TODO: Check whether we should rename this to operation
				name: "execute_query",
				description:
					"Query a GraphQL endpoint with the given query and variables",
				parameters: z.object({
					query: z.string(),
					variables: z.string().optional(),
				}),
				inputSchema: zodToJsonSchema(
					z.object({
						query: z.string(),
						variables: z.string().optional(),
					}),
				),
			},
			...tools,
		],
	};
});

/**
 * Sets up the transport and starts the server with it
 */
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
