import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { z } from "zod";

export const configSchema = z.discriminatedUnion(
  "source",
  [
    z.object({
      source: z.literal("endpoint"),
      // Endpoint for the schema to be introspected and transformed into tools
      endpoint: z.string().url(),
      // Headers to be sent with the request to the schema endpoint
      headers: z.record(z.string()).optional(),
      // Allow MCP clients to use mutations, can potentially be dangerous so we disable by default
      allowMutations: z.boolean().optional().default(false),
      // Queries to exclude from the generated tools
      excludeQueries: z.array(z.string()).optional(),
      // Mutations to exclude from the generated tools
      excludeMutations: z.array(z.string()).optional(),
    }),
    z.object({
      source: z.literal("file"),
      // File path alternative to endpoint, will read the file instead of fetching the endpoint
      schemaPath: z.string(),
      // Allow MCP clients to use mutations, can potentially be dangerous so we disable by default
      allowMutations: z.boolean().optional().default(false),
      // Queries to exclude from the generated tools
      excludeQueries: z.array(z.string()).optional(),
      // Mutations to exclude from the generated tools
      excludeMutations: z.array(z.string()).optional(),
    }),
  ],
  {
    errorMap: () => ({
      message:
        "You must provide either an endpoint URL or a schema file path, but not both",
    }),
  }
);

export type Config = z.infer<typeof configSchema>;

export function parseArgumentsToConfig(): Config {
  const argv = yargs(hideBin(process.argv))
    .option("endpoint", {
      type: "string",
      description:
        "Endpoint for the schema to be introspected and transformed into tools",
    })
    .option("schemaPath", {
      type: "string",
      description:
        "File path alternative to endpoint, will read the file instead of fetching the endpoint",
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
