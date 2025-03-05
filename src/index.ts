// V2 Implementation
import { parseArgumentsToConfig } from "./lib/config";
import {
  createGraphQLHandler,
  loadSchema,
  loadSchemaFromFile,
} from "./lib/graphql";

const config = parseArgumentsToConfig();

const handler = await createGraphQLHandler(config);

/**
 * Connects the server to a transport
 */
async function main() {
  let schema: string;
  if (config.source === "endpoint") {
    schema = await loadSchema(config.endpoint, config.headers);
  } else if (config.source === "file") {
    schema = await loadSchemaFromFile(config.schemaPath);
  }
}

// Run
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
