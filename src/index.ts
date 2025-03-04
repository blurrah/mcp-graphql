// V2 Implementation

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { z } from "zod";

const argsSchema = z.object({
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
});

function parseArgs(): z.infer<typeof argsSchema> {
  const argv = yargs(hideBin(process.argv))
    .option("endpoint", {
      type: "string",
      description:
        "Endpoint for the schema to be introspected and transformed into tools",
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

  return argsSchema.parse(parsedArgs);
}
