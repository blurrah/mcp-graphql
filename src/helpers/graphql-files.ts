import { readdir, readFile } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import { existsSync } from "node:fs";
import {
	parse,
	type DocumentNode,
	type OperationDefinitionNode,
	type VariableDefinitionNode,
} from "graphql";
import { z } from "zod";

export interface GraphQLOperation {
	name: string;
	type: "query" | "mutation" | "subscription";
	content: string;
	variables: VariableDefinitionNode[];
	filePath: string;
}

export async function discoverGraphQLFiles(
	directory: string,
): Promise<string[]> {
	if (!existsSync(directory)) {
		return [];
	}

	const files: string[] = [];

	async function scanDirectory(dir: string): Promise<void> {
		const entries = await readdir(dir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = join(dir, entry.name);

			if (entry.isDirectory()) {
				await scanDirectory(fullPath);
			} else if (
				entry.isFile() &&
				(entry.name.endsWith(".graphql") || entry.name.endsWith(".gql"))
			) {
				files.push(fullPath);
			}
		}
	}

	await scanDirectory(directory);
	return files;
}

export async function parseGraphQLFile(
	filePath: string,
): Promise<GraphQLOperation[]> {
	const content = await readFile(filePath, "utf-8");
	const operations: GraphQLOperation[] = [];

	try {
		const document: DocumentNode = parse(content);

		for (const definition of document.definitions) {
			if (definition.kind === "OperationDefinition") {
				const operationDef = definition as OperationDefinitionNode;
				
				// Use operation name or derive from filename
				const operationName =
					operationDef.name?.value ||
					basename(filePath, extname(filePath));

				operations.push({
					name: operationName,
					type: operationDef.operation,
					content: content,
					variables: operationDef.variableDefinitions || [],
					filePath,
				});
			}
		}
	} catch (error) {
		console.error(`Failed to parse GraphQL file ${filePath}:`, error);
	}

	return operations;
}

export async function loadAllGraphQLOperations(
	directory: string,
): Promise<GraphQLOperation[]> {
	const files = await discoverGraphQLFiles(directory);
	const allOperations: GraphQLOperation[] = [];

	for (const file of files) {
		const operations = await parseGraphQLFile(file);
		allOperations.push(...operations);
	}

	return allOperations;
}

function getGraphQLTypeAsZod(type: any): z.ZodTypeAny {
	// Handle NonNull types
	if (type.kind === "NonNullType") {
		return getGraphQLTypeAsZod(type.type);
	}

	// Handle List types
	if (type.kind === "ListType") {
		return z.array(getGraphQLTypeAsZod(type.type)).optional();
	}

	// Handle Named types
	if (type.kind === "NamedType") {
		switch (type.name.value) {
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
				// For custom types, treat as JSON string
				return z.string().describe(`GraphQL ${type.name.value} type`);
		}
	}

	// Default to string for unknown types
	return z.string();
}

export function createVariableSchema(
	variables: VariableDefinitionNode[],
): z.ZodObject<any> {
	const schemaShape: Record<string, z.ZodTypeAny> = {};

	for (const variable of variables) {
		const varName = variable.variable.name.value;
		let zodType = getGraphQLTypeAsZod(variable.type);

		// Add default value if present
		if (variable.defaultValue) {
			zodType = zodType.optional();
		}

		// Check if the variable type is NonNull (required)
		if (variable.type.kind !== "NonNullType") {
			zodType = zodType.optional();
		}

		schemaShape[varName] = zodType;
	}

	return z.object(schemaShape);
}

export function generateToolName(operation: GraphQLOperation): string {
	// Convert operation name to kebab-case for consistency
	const kebabName = operation.name
		.replace(/([A-Z])/g, "-$1")
		.toLowerCase()
		.replace(/^-/, "");
	
	return `gql-${kebabName}`;
}

export function generateToolDescription(operation: GraphQLOperation): string {
	const operationType = operation.type.charAt(0).toUpperCase() + operation.type.slice(1);
	return `${operationType} GraphQL operation: ${operation.name}`;
}