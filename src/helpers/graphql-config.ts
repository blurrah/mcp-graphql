import { loadConfig, type GraphQLConfig } from "graphql-config";
import { parse, type OperationDefinitionNode, type VariableDefinitionNode } from "graphql";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

export interface GraphQLConfigOperation {
	name: string;
	type: "query" | "mutation" | "subscription";
	content: string;
	variables: VariableDefinitionNode[];
	filePath: string;
	project?: string;
}

export interface ConfigWithOperations {
	config: GraphQLConfig | null;
	operations: GraphQLConfigOperation[];
	endpoint: string;
	headers: Record<string, string>;
}

/**
 * Load GraphQL Config and resolve configuration with proper precedence:
 * 1. Environment variables (highest priority)
 * 2. GraphQL Config file
 * 3. Default values
 */
export async function loadGraphQLConfig(
	rootDir: string = process.cwd(),
	env: {
		ENDPOINT?: string;
		HEADERS?: Record<string, any>;
		SCHEMA?: string;
		GRAPHQL_DIR?: string;
		ALLOW_MUTATIONS?: boolean;
	},
): Promise<ConfigWithOperations> {
	let config: GraphQLConfig | null = null;
	let operations: GraphQLConfigOperation[] = [];
	
	try {
		// Try to load GraphQL Config file
		config = await loadConfig({
			rootDir,
			throwOnMissing: false,
			throwOnEmpty: false,
		});

		if (config && config.filepath) {
			// Load operations from config documents
			operations = await loadOperationsFromConfig(config);
		}
	} catch (error) {
		console.error("Failed to load GraphQL Config:", error);
	}

	// If no config or no operations from config, try directory fallback
	if (operations.length === 0 && env.GRAPHQL_DIR) {
		operations = await loadOperationsFromDirectory(env.GRAPHQL_DIR);
	}

	// Resolve configuration with proper precedence:
	// 1. Environment variables (highest priority)
	// 2. GraphQL Config file
	// 3. Default values
	const extensions = config?.rawConfig?.extensions as any;
	
	const endpoint = 
		env.ENDPOINT ||  // Environment variable takes precedence
		extensions?.endpoints?.default?.url || // Then config file
		'http://localhost:4000/graphql'; // Default
	
	// Parse headers with precedence
	let headers: Record<string, string> = {};
	if (env.HEADERS) {
		// Environment variable takes precedence
		headers = typeof env.HEADERS === 'string' ? JSON.parse(env.HEADERS) : env.HEADERS;
	} else if (extensions?.endpoints?.default?.headers) {
		// Then config file
		headers = extensions.endpoints.default.headers;
	}

	return {
		config,
		operations,
		endpoint,
		headers,
	};
}

/**
 * Load all GraphQL operations from config documents
 */
async function loadOperationsFromConfig(
	config: GraphQLConfig,
): Promise<GraphQLConfigOperation[]> {
	const operations: GraphQLConfigOperation[] = [];
	
	// Handle single project or multiple projects
	const projects = config.projects 
		? Object.entries(config.projects)
		: [['default', config]];

	for (const [projectName, projectConfig] of projects) {
		try {
			// Get documents for this project
			const documents = await projectConfig.getDocuments();
			
			if (!documents || documents.length === 0) {
				continue;
			}

			// Parse operations from each document
			for (const doc of documents) {
				if (!doc.rawSDL || !doc.location) {
					continue;
				}

				try {
					const parsed = parse(doc.rawSDL);
					
					for (const definition of parsed.definitions) {
						if (definition.kind === "OperationDefinition") {
							const operationDef = definition as OperationDefinitionNode;
							
							// Use operation name or derive from file
							const operationName = operationDef.name?.value || 
								getOperationNameFromPath(doc.location);
							
							operations.push({
								name: operationName,
								type: operationDef.operation,
								content: doc.rawSDL,
								variables: operationDef.variableDefinitions || [],
								filePath: doc.location,
								project: projects.length > 1 ? projectName : undefined,
							});
						}
					}
				} catch (error) {
					console.error(`Failed to parse document ${doc.location}:`, error);
				}
			}
		} catch (error) {
			console.error(`Failed to load documents for project ${projectName}:`, error);
		}
	}

	return operations;
}

/**
 * Fallback to load operations from directory (for backward compatibility)
 */
export async function loadOperationsFromDirectory(
	directory: string,
): Promise<GraphQLConfigOperation[]> {
	if (!existsSync(directory)) {
		return [];
	}

	const { loadAllGraphQLOperations } = await import("./graphql-files.js");
	const operations = await loadAllGraphQLOperations(directory);
	
	return operations.map(op => ({
		...op,
		project: undefined,
	}));
}

/**
 * Extract operation name from file path
 */
function getOperationNameFromPath(filePath: string): string {
	const parts = filePath.split('/');
	const filename = parts[parts.length - 1];
	return filename.replace(/\.(graphql|gql)$/, '');
}

/**
 * Convert GraphQL variable types to Zod schema
 */
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

/**
 * Create Zod schema from GraphQL variables
 */
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

/**
 * Generate tool name for MCP
 */
export function generateToolName(operation: GraphQLConfigOperation): string {
	// Convert operation name to kebab-case
	const kebabName = operation.name
		.replace(/([A-Z])/g, "-$1")
		.toLowerCase()
		.replace(/^-/, "");
	
	// Include project name if multiple projects
	const prefix = operation.project && operation.project !== 'default' 
		? `gql-${operation.project}-` 
		: "gql-";
	
	return `${prefix}${kebabName}`;
}

/**
 * Generate tool description for MCP
 */
export function generateToolDescription(operation: GraphQLConfigOperation): string {
	const operationType = operation.type.charAt(0).toUpperCase() + operation.type.slice(1);
	const project = operation.project ? ` [${operation.project}]` : "";
	return `${operationType} GraphQL operation: ${operation.name}${project}`;
}