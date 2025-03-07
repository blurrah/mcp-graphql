import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { z } from "zod";

export const configSchema = z.object({
  name: z.string().default("mcp-graphql"),
  // Endpoint for the schema to be introspected and transformed into tools
  endpoint: z.string().url(),
  // File path alternative to endpoint, will read the file instead of fetching the endpoint
  schemaPath: z.string().optional(),
  // Headers to be sent with the request to the schema endpoint
  headers: z.record(z.string()).optional(),
  // Allow MCP clients to use mutations, can potentially be dangerous so we disable by default
  allowMutations: z.boolean().optional().default(false),
  // Queries to exclude from the generated tools
  excludeQueries: z.array(z.string()).optional().default([]),
  // Mutations to exclude from the generated tools
  excludeMutations: z.array(z.string()).optional().default([]),
});

export type Config = z.infer<typeof configSchema>;

export function parseArgumentsToConfig(): Config {
  const argv = yargs(hideBin(process.argv))
    .option("name", {
      type: "string",
      description:
        "Name of the MCP server, can be used if you want to override the default name",
    })
    .option("endpoint", {
      type: "string",
      description:
        "Endpoint for the schema to be introspected and transformed into tools",
    })
    .option("schemaPath", {
      type: "string",
      description:
        "Alternative path for GraphQL schema file, use this if you cannot introspect the schema from the endpoint",
    })
    .option("headers", {
      type: "string",
      description:
        "JSON stringified headers to be sent with the request to the schema endpoint",
      default: "{}",
    })
    .option("allowMutations", {
      type: "boolean",
      description:
        "Allow MCP clients to use mutations, can potentially be dangerous so we disable by default",
    })
    .option("excludeQueries", {
      type: "array",
      description: "Queries to exclude from the generated tools",
    })
    .option("excludeMutations", {
      type: "array",
      description: "Mutations to exclude from the generated tools",
    })
    .help()
    .parseSync();

  const parsedArgs = {
    ...argv,
    headers: argv.headers ? JSON.parse(argv.headers) : undefined,
  };

  // Just let this throw, will catch it during main execution
  return configSchema.parse(parsedArgs);
}
