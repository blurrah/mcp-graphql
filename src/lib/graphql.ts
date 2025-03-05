// Contains Schema parsing and transformation logic

import {
  Kind,
  type OperationDefinitionNode,
  type TypeNode,
  type VariableDefinitionNode,
  getIntrospectionQuery,
  parse,
} from "graphql";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import zodToJsonSchema, { type JsonSchema7Type } from "zod-to-json-schema";
import type { Config } from "./config";

export async function loadSchema(
  endpoint: string,
  headers?: Record<string, string>
) {
  if (endpoint) {
    const response = await fetch(endpoint, {
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({
        query: getIntrospectionQuery(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch GraphQL schema: ${response.statusText}`);
    }

    const data = await response.json();

    return data;
  }
}

export async function loadSchemaFromFile(path: string) {
  const data = await readFile(path, "utf-8");

  return data;
}

/**
 * Extracts all operations from a GraphQL schema and return them in a structured format
 * @param schema - The GraphQL schema to extract operations from
 * @returns An array of operations
 */
export async function getOperations(
  schema: string,
  // Subscriptions are not supported (yet?)
  allowedOperations: ("query" | "mutation")[]
): Promise<OperationDefinitionNode[]> {
  const document = parse(schema);

  const operationDefinition = document.definitions.filter(
    (definition) => definition.kind === "OperationDefinition"
  );

  return operationDefinition.filter((operation) =>
    allowedOperations.includes(
      // TODO: Fix with proper types
      operation.operation as unknown as "query" | "mutation"
    )
  );
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
export function operationToTool(operation: OperationDefinitionNode): Tool {
  // Import necessary types if they're not already imported

  // Create a name for the tool based on the operation
  const name = operation.name?.value
    ? `${operation.operation}-${operation.name.value}`
    : `anonymous-${operation.operation}`;

  // Get description from the operation or use a default
  const description =
    operation.name?.value || `Anonymous ${operation.operation}`;

  // Build parameters schema based on variable definitions
  const paramSchema = buildZodSchemaFromVariables(
    operation.variableDefinitions || []
  );

  // Return the tool object
  return {
    name,
    description,
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
  let schema: string;

  if (config.source === "file") {
    schema = await loadSchemaFromFile(config.schemaPath);
  } else if (config.source === "endpoint") {
    schema = await loadSchema(config.endpoint, config.headers);
  }

  const tools = new Map<string, Tool>();

  return {
    async loadTools() {
      const operations = await getOperations(
        schema,
        config.allowMutations ? ["query", "mutation"] : ["query"]
      );

      // Add tools
      for (const operation of operations) {
        if (
          !operation.name?.value ||
          config.excludeQueries?.includes(operation.name.value) ||
          config.excludeMutations?.includes(operation.name.value)
        ) {
          // Operation not found or excluded
          continue;
        }

        const tool = operationToTool(operation);

        tools.set(tool.name, tool);
      }

      return tools;
    },
    getTool(name: string) {
      return tools.get(name);
    },
  };
}
