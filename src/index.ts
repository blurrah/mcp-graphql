// V2 Implementation
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getVersion } from "../helpers/package";
import { parseArgumentsToConfig } from "./lib/config";
import { createGraphQLHandler } from "./lib/graphql";

const config = parseArgumentsToConfig();
const handler = await createGraphQLHandler(config);

const server = new Server(
  {
    name: "mcp-graphql",
    version: getVersion(),
    description: `GraphQL client for ${
      config.source === "endpoint" ? config.endpoint : config.schemaPath
    }`,
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

/**
 * Handles tool calling from the client and executes the tool
 */
async function handleToolCall(name: string, body: string, variables: string) {
  const tool = handler.getTool(name);
  if (!tool) {
    console.error(`Tool ${name} not found`);
    return {
      status: "error",
      message: `Tool ${name} not found`,
    };
  }
  const result = await handler.execute(tool, body, variables);
  return result;
}

/**
 * Sets up the transport and starts the server with it
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  server.sendLoggingMessage({
    level: "info",
    message: `Started mcp-graphql server for ${
      config.source === "endpoint" ? config.endpoint : config.schemaPath
    }`,
  });
}

// Run
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
