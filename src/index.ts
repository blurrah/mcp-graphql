// V2 Implementation
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getVersion } from "../helpers/package";
import { parseArgumentsToConfig } from "./lib/config";
import { createGraphQLHandler } from "./lib/graphql";

const config = parseArgumentsToConfig();
const handler = await createGraphQLHandler(config);

const server = new Server(
  {
    name: config.name,
    version: getVersion(),
    description: `GraphQL server for ${config.endpoint}`,
  },
  {
    capabilities: {
      logging: {},
      tools: {},
      resources: {
        template: true,
        read: true,
      },
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async (request) => {
  await handler.loadTools();

  const tools = Array.from(handler.tools.values()).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    inputSchema: tool.inputSchema,
  }));

  return {
    tools,
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = handler.tools.get(request.params.name);
  if (!tool) {
    return {
      status: "error",
      message: `Tool ${request.params.name} not found`,
    };
  }

  console.error("tool call", request.params.arguments);

  const parsedArguments = tool.parameters.parse(request.params.arguments);

  console.error("parsed arguments", parsedArguments);

  const result = await handler.execute(
    parsedArguments.query,
    parsedArguments.variables
  );
  return result;
});

/**
 * Sets up the transport and starts the server with it
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  server.sendLoggingMessage({
    level: "info",
    message: `Started mcp-graphql server for ${config.endpoint}`,
  });
}

// Run
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
