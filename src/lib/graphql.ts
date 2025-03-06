// Contains Schema parsing and transformation logic

import {
  type GraphQLArgument,
  type GraphQLSchema,
  Kind,
  type TypeNode,
  type VariableDefinitionNode,
  buildClientSchema,
  buildSchema,
  getIntrospectionQuery,
  printSchema,
} from "graphql";
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import zodToJsonSchema, { type JsonSchema7Type } from "zod-to-json-schema";
import type { Config } from "./config";

export async function loadSchemaFromIntrospection(
  endpoint: string,
  headers?: Record<string, string>
): Promise<GraphQLSchema> {
  const response = await fetch(endpoint, {
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    method: "POST",
    body: JSON.stringify({
      query: getIntrospectionQuery(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch GraphQL schema: ${response.statusText}`);
  }

  const responseJson = await response.json();

  if (responseJson.errors) {
    throw new Error(
      `Failed to fetch GraphQL schema: ${JSON.stringify(responseJson.errors)}`
    );
  }

  if (!responseJson.data.__schema) {
    throw new Error(`Invalid schema found at ${JSON.stringify(responseJson)}`);
  }

  const schemaObj = buildClientSchema(responseJson.data);

  const sdl = printSchema(schemaObj);

  // Debug code to not rate limit the endpoint:
  await writeFile("schema.graphql", sdl);

  return schemaObj;
}

export async function loadSchemaFromFile(path: string): Promise<GraphQLSchema> {
  const data = await readFile(path, "utf-8");

  return buildSchema(data);
}

type Operation = {
  name: string;
  type: "query" | "mutation";
  description: string | undefined | null;
  parameters: readonly GraphQLArgument[];
};

/**
 * Extracts all operations from a GraphQL schema and return them in a structured format
 * @param schema - The GraphQL schema to extract operations from
 * @returns An array of operations
 */
export function getOperations(
  schema: GraphQLSchema,
  // Subscriptions are not supported (yet?)
  allowedOperations: ("query" | "mutation")[] = ["query", "mutation"]
): Operation[] {
  const operations: Operation[] = [];

  if (allowedOperations.includes("query")) {
    const queryType = schema.getQueryType();
    const queryFields = queryType?.getFields();
    for (const [fieldName, field] of Object.entries(queryFields || {})) {
      operations.push({
        name: fieldName,
        type: "query",
        description: field.description,
        parameters: field.args,
      });
    }
  }

  if (allowedOperations.includes("mutation")) {
    const mutationType = schema.getMutationType();
    const mutationFields = mutationType?.getFields();
    for (const [fieldName, field] of Object.entries(mutationFields || {})) {
      operations.push({
        name: fieldName,
        type: "mutation",
        description: field.description,
        parameters: field.args,
      });
    }
  }

  console.error(operations.length);
  return operations;
}

type Tool = {
  name: string;
  description: string;
  parameters: z.ZodTypeAny;
  inputSchema: JsonSchema7Type;
};

/**
 * Converts a GraphQL operation to a MCP tool object
 * @param operation - The GraphQL operation to convert
 * @returns A MCP tool object
 */
export function operationToTool(operation: Operation): Tool {
  // Import necessary types if they're not already imported

  if (!operation.name) {
    // Should never reach this as we already filter out operations without a name earlier
    throw new Error("Operation name is required");
  }

  // Create a name for the tool based on the operation
  const name = `${operation.type}-${operation.name}`;

  // Get description from the operation or use a default
  const description = operation.description;

  // Build parameters schema based on variable definitions
  const paramSchema = buildZodSchemaFromVariables(operation.parameters);

  // Return the tool object
  return {
    name,
    description: description || "",
    parameters: paramSchema,
    inputSchema: zodToJsonSchema(paramSchema),
  };
}

/**
 * Builds a Zod schema from GraphQL variable definitions
 * @param variableDefinitions - The variable definitions from a GraphQL operation
 * @returns A Zod schema object
 */
function buildZodSchemaFromVariables(
  variableDefinitions: ReadonlyArray<VariableDefinitionNode>
) {
  const schemaObj: Record<string, z.ZodTypeAny> = {};

  for (const varDef of variableDefinitions) {
    const varName = varDef.variable.name.value;
    schemaObj[varName] = typeNodeToZodSchema(varDef.type);
  }

  return z.object(schemaObj);
}

/**
 * Converts a GraphQL type node to a Zod schema
 * @param typeNode - The GraphQL type node
 * @returns A Zod schema
 */
function typeNodeToZodSchema(typeNode: TypeNode): z.ZodTypeAny {
  switch (typeNode.kind) {
    case Kind.NON_NULL_TYPE:
      return typeNodeToZodSchema(typeNode.type);

    case Kind.LIST_TYPE:
      return z.array(typeNodeToZodSchema(typeNode.type));

    case Kind.NAMED_TYPE:
      return namedTypeToZodSchema(typeNode.name.value);

    default:
      return z.any();
  }
}

/**
 * Converts a GraphQL named type to a Zod schema
 * @param typeName - The name of the GraphQL type
 * @returns A Zod schema
 */
function namedTypeToZodSchema(typeName: string): z.ZodTypeAny {
  switch (typeName) {
    case "String":
      return z.string();
    case "Int":
      return z.number().int();
    case "Float":
      return z.number();
    case "Boolean":
      return z.boolean();
    case "ID":
      return z.string();
    default:
      // We just fallback to string for now when using custom scalars
      // TODO: Handle custom scalars using configuration
      return z.string();
  }
}

export async function createGraphQLHandler(config: Config) {
  let schema: GraphQLSchema;

  if (config.schemaPath) {
    schema = await loadSchemaFromFile(config.schemaPath);
  } else {
    // Fall back to introspection if no schema path is provided
    schema = await loadSchemaFromIntrospection(config.endpoint, config.headers);
  }

  const tools = new Map<string, Tool>();

  async function loadTools() {
    const operations = getOperations(
      schema,
      config.allowMutations ? ["query", "mutation"] : ["query"]
    );

    // Add tools
    for (const operation of operations) {
      if (
        !operation.name ||
        config.excludeQueries.includes(operation.name) ||
        config.excludeMutations.includes(operation.name)
      ) {
        // Operation not found or excluded
        console.error(`Skipping operation ${operation.name} as it is excluded`);
        continue;
      }

      const tool = operationToTool(operation);

      tools.set(tool.name, tool);
    }
  }

  // Load initial tools
  await loadTools();

  return {
    tools,
    loadTools,
    async execute(query: string, variables: unknown) {
      const result = await fetch(config.endpoint, {
        method: "POST",
        body: JSON.stringify({ query, variables }),
      });

      return {
        status: "success",
        data: await result.json(),
      };
    },
  };
}
