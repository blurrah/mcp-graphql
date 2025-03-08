#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { parse } from "graphql/language";
import { getIntrospectionQuery } from "graphql/utilities";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";
import { getVersion } from "./helpers/package.js" with { type: "macro" };
import { tools } from "./tools.js";

const GraphQLSchema = z.object({
  query: z.string(),
  variables: z.string().optional(),
});

const ConfigSchema = z.object({
  name: z.string().default("mcp-graphql"),
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
          .join("\n")
      );
    } else {
      console.error("Error parsing arguments:", error);
    }
    process.exit(1);
  }
}

const config = parseArgs();

const server = new Server(
  {
    name: config.name,
    version: getVersion(),
    description: `GraphQL client for ${config.endpoint}`,
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

const graphQLJsonSchema = zodToJsonSchema(GraphQLSchema);

server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
  return {
    resources: [
      {
        name: "graphql-schema",
        mimeType: "application/json",
        description: "The GraphQL schema of the server",
        uri: new URL(config.endpoint).href,
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  server.sendLoggingMessage({
    level: "debug",
    message: `ReadResourceRequestSchema: ${JSON.stringify(request, null, 2)}`,
  });

  try {
    const response = await fetch(request.params.uri, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...config.headers,
      },
      body: JSON.stringify({
        query: getIntrospectionQuery(),
      }),
    });

    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.statusText}`);
    }

    const schemaData = await response.json();

    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: "application/json",
          text: JSON.stringify(schemaData, null, 2),
        },
      ],
    };
  } catch (error) {
    server.sendLoggingMessage({
      level: "error",
      message: `Failed to fetch GraphQL schema: ${error}`,
    });
    throw new Error(`Failed to fetch GraphQL schema: ${error}`);
  }
});

server.setRequestHandler(ListToolsRequestSchema, async (request) => {
  return {
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.args,
      // biome-ignore lint/suspicious/noExplicitAny: standard schema -> zod transform
      inputSchema: tool.args ? zodToJsonSchema(tool.args as any, "args").definitions?.args : {type: "object"},
    })),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {

  const tool = tools.find((tool) => tool.name === request.params.name);

  if (!tool) {
    throw new Error("Invalid tool name");
  }

  let args = request.params.arguments;

  if (tool.args) {
    const validated = await tool.args["~standard"].validate(args);
    if (validated.issues) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Invalid arguments: ${validated.issues.map((issue) => issue.message).join(", ")}`,
          },
        ],
      };
    }
    args = validated.value as Record<string, unknown>;
  }
  const { query, variables } = GraphQLSchema.parse(request.params.arguments);

  if (request.params.name === "query-graphql") {
  const { query, variables } = GraphQLSchema.parse(request.params.arguments);

  server.sendLoggingMessage({
    level: "info",
    message: `Calling query-graphql tool with body: ${query} and variables: ${variables}`,
  });

  // Parse the query to check for syntax errors before sending it to the server
  try {
    parse(query);
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
              2
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
    server.sendLoggingMessage({
      level: "error",
      message: `Failed to execute GraphQL query: ${error}`,
    });
    throw new Error(`Failed to execute GraphQL query: ${error}`);
  }
}
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  server.sendLoggingMessage({
    level: "info",
    message: `Started mcp-graphql server for endpoint: ${config.endpoint}`,
  });
}

main().catch((error) => {
  console.error(`Fatal error in main(): ${error}`);
  process.exit(1);
});
