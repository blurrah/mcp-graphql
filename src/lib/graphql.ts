// Contains Schema parsing and transformation logic

import {
	type GraphQLArgument,
	type GraphQLInputType,
	GraphQLNonNull,
	type GraphQLOutputType,
	type GraphQLSchema,
	buildClientSchema,
	buildSchema,
	getIntrospectionQuery,
	isInputObjectType,
	isListType,
	isNonNullType,
	isScalarType,
	printSchema,
} from "graphql";
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import zodToJsonSchema, { type JsonSchema7Type } from "zod-to-json-schema";
import type { Config } from "./config";

export async function loadSchemaFromIntrospection(
	endpoint: string,
	headers?: Record<string, string>,
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
			`Failed to fetch GraphQL schema: ${JSON.stringify(responseJson.errors)}`,
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
	allowedOperations: ("query" | "mutation")[] = ["query", "mutation"],
): Operation[] {
	const operations: Operation[] = [];

	if (allowedOperations.includes("query")) {
		const queryType = schema.getQueryType();
		const queryFields = queryType?.getFields();
		for (const [fieldName, field] of Object.entries(queryFields || {})) {
			operations.push({
				name: fieldName,
				type: "query",
				// TODO: Add all the possibly output types to the description
				description: createOperationDescription(schema, {
					name: fieldName,
					type: "query",
					parameters: field.args,
					description: field.description,
				} satisfies Operation),
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
				description: createOperationDescription(schema, {
					name: fieldName,
					type: "mutation",
					parameters: field.args,
					description: field.description,
				} satisfies Operation),
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

	console.error(paramSchema);

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
	variableDefinitions: ReadonlyArray<GraphQLArgument>,
) {
	const schemaObj: Record<string, z.ZodTypeAny> = {};

	for (const definition of variableDefinitions) {
		schemaObj[definition.name] = argumentToZodSchema(definition);
	}

	return z.object({
		variables: z.object(schemaObj),
		query: z.string(),
	});
}

function argumentToZodSchema(argument: GraphQLArgument): z.ZodTypeAny {
	// Build individual zod schema's
	function convertToZodSchema(
		type: GraphQLInputType,
		maxDepth = 3,
	): z.ZodTypeAny {
		if (maxDepth === 0) {
			// Fall back to any type when we reach recursion limit, especially with circular references to input types this can get quite intensive
			return z.any();
		}

		if (type instanceof GraphQLNonNull) {
			// Non-null type, need to go deeper
			return convertToZodSchema(type.ofType);
		}

		if (isListType(type)) {
			return z.array(convertToZodSchema(type.ofType));
		}

		if (isScalarType(type)) {
			if (type.name === "String" || type.name === "ID") return z.string();
			if (type.name === "Int") return z.number().int();
			if (type.name === "Float") return z.number();
			if (type.name === "Boolean") return z.boolean();
			// Fall back to string for now when using custom scalars
			return z.string();
		}

		if (isInputObjectType(type)) {
			const fields = type.getFields();
			const shape: Record<string, z.ZodTypeAny> = {};
			for (const [fieldName, field] of Object.entries(fields)) {
				shape[fieldName] =
					field.type instanceof GraphQLNonNull
						? convertToZodSchema(field.type, maxDepth - 1)
						: convertToZodSchema(field.type, maxDepth - 1).optional();
			}

			return z.object(shape).optional();
		}

		// Fall back to any type for now, hopefully extra input context will help an LLM with this
		return z.any();
	}

	const zodField = convertToZodSchema(argument.type);

	// Default value is not part of the type, so we add it outside of the type converter
	if (argument.defaultValue !== undefined) {
		zodField.default(argument.defaultValue);
	}

	return zodField;
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
			config.allowMutations ? ["query", "mutation"] : ["query"],
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
			const body = JSON.stringify({ query, variables });
			console.error("body", body);
			const result = await fetch(config.endpoint, {
				method: "POST",
				body,
			});

			console.error("result", await result.json());

			return {
				status: "success",
				data: await result.json(),
			};
		},
	};
}

/**
 * Extracts the output type information from a GraphQL operation
 * @param schema - The GraphQL schema
 * @param operation - The GraphQL operation
 * @returns A string representation of the output type structure
 */
function getOperationOutputType(
	schema: GraphQLSchema,
	operation: Operation,
): string {
	const typeMap = schema.getTypeMap();
	let outputType: GraphQLOutputType | undefined;

	if (operation.type === "query") {
		const queryType = schema.getQueryType();
		if (queryType) {
			const field = queryType.getFields()[operation.name];
			if (field) {
				outputType = field.type;
			}
		}
	} else if (operation.type === "mutation") {
		const mutationType = schema.getMutationType();
		if (mutationType) {
			const field = mutationType.getFields()[operation.name];
			if (field) {
				outputType = field.type;
			}
		}
	}

	if (!outputType) {
		return "Unknown output type";
	}

	// Generate a string representation of the output type
	return printType(outputType, schema);
}

/**
 * Recursively prints a GraphQL type structure
 * @param type - The GraphQL type to print
 * @param schema - The GraphQL schema
 * @param depth - Current recursion depth to prevent infinite loops
 * @returns A string representation of the type
 */
function printType(
	type: GraphQLOutputType,
	schema: GraphQLSchema,
	maxDepth = 5,
): string {
	if (maxDepth === 0) return "..."; // Prevent too deep recursion, should I add it in text here?

	// Handle non-null and list wrappers
	if ("ofType" in type) {
		if (isListType(type)) {
			return `[${printType(type.ofType, schema, maxDepth)}]`;
		}
		if (isNonNullType(type)) {
			// Not sure why typescript goes to never typing here, need to check later
			return `${printType(
				(type as GraphQLNonNull<GraphQLOutputType>).ofType,
				schema,
				maxDepth,
			)}!`;
		}
	}
	// Handle scalar types
	if (isScalarType(type)) {
		return type.name;
	}

	// Handle enum types
	if (type.astNode?.kind === "EnumTypeDefinition") {
		return `ENUM ${type.name}`;
	}

	// Handle object types
	if ("getFields" in type && typeof type.getFields === "function") {
		const fields = type.getFields();
		if (maxDepth - 1 === 0) {
			// Return the type name if we are at the max depth already
			return type.name;
		}
		const fieldStrings = Object.entries(fields).map(([name, field]) => {
			return `  ${name}: ${printType(field.type, schema, maxDepth - 1)}`;
		});

		return `{\n${fieldStrings.join("\n")}\n}`;
	}

	return "name" in type ? type.name : "Unknown";
}

function createOperationDescription(
	schema: GraphQLSchema,
	operation: Operation,
) {
	const outputTypeInfo = getOperationOutputType(schema, operation);
	return `
  ${operation.type} operation: "${operation.name}"

DESCRIPTION:
${operation.description || "No description available"}

PARAMETERS:
${
	operation.parameters.length > 0
		? operation.parameters
				.map(
					(param) =>
						`- ${param.name}: ${param.type.toString()}${
							param.description ? ` - ${param.description}` : ""
						}`,
				)
				.join("\n")
		: "No parameters required"
}

OUTPUT TYPE:
${outputTypeInfo}

When you use this operation, you'll receive a response with this structure.`;
}
