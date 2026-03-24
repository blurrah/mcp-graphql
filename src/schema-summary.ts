import {
  buildSchema,
  isObjectType,
  isInputObjectType,
  isEnumType,
  isUnionType,
  isInterfaceType,
  isScalarType,
  type GraphQLArgument,
  type GraphQLField,
  type GraphQLNamedType,
  type GraphQLSchema,
} from "graphql";

const BUILT_IN_SCALARS = new Set(["String", "Int", "Float", "Boolean", "ID"]);

function isUserType(type: GraphQLNamedType): boolean {
  const name = type.name;
  if (name.startsWith("__")) return false;
  if (BUILT_IN_SCALARS.has(name)) return false;
  return true;
}

function formatArgs(args: readonly GraphQLArgument[]): string {
  if (args.length === 0) return "";
  const parts = args.map((a) => `${a.name}: ${a.type.toString()}`);
  return `(${parts.join(", ")})`;
}

function formatField(field: GraphQLField<unknown, unknown>): string {
  const args = formatArgs(field.args);
  const deprecation = field.deprecationReason
    ? ` — ${field.deprecationReason}`
    : "";
  const isDeprecated = field.deprecationReason != null;
  const prefix = isDeprecated ? "**[deprecated]** " : "";
  return `${prefix}${field.name}${args}: ${field.type.toString()}${deprecation}`;
}

function getFieldsArray(
  type: GraphQLNamedType,
): GraphQLField<unknown, unknown>[] {
  if (isObjectType(type) || isInterfaceType(type) || isInputObjectType(type)) {
    return Object.values(type.getFields());
  }
  return [];
}

function formatRootTypeSection(
  schema: GraphQLSchema,
  typeName: string,
  label: string,
): string | null {
  const type = schema.getType(typeName);
  if (!type || !isObjectType(type)) return null;

  const fields = Object.values(type.getFields());
  if (fields.length === 0) return null;

  const lines: string[] = [];
  lines.push(`### ${label} (${fields.length} fields)`);
  for (const field of fields) {
    lines.push(`- ${formatField(field)}`);
  }
  return lines.join("\n");
}

/**
 * Generate a compact summary of a GraphQL schema from SDL.
 */
export function generateSchemaSummary(
  sdl: string,
  endpointName?: string,
): string {
  let schema: GraphQLSchema;
  try {
    schema = buildSchema(sdl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `**Error parsing schema**: ${message}`;
  }

  const typeMap = schema.getTypeMap();
  const userTypes = Object.values(typeMap).filter(isUserType);

  let totalFields = 0;
  for (const type of userTypes) {
    totalFields += getFieldsArray(type).length;
  }

  const heading = endpointName
    ? `## Schema Summary for '${endpointName}'`
    : "## Schema Summary";

  const lines: string[] = [
    heading,
    `**Types**: ${userTypes.length} | **Fields**: ${totalFields}`,
    "",
  ];

  // Root types
  const queryTypeName = schema.getQueryType()?.name ?? "Query";
  const mutationTypeName = schema.getMutationType()?.name ?? "Mutation";
  const subscriptionTypeName =
    schema.getSubscriptionType()?.name ?? "Subscription";

  const querySection = formatRootTypeSection(schema, queryTypeName, "Query");
  if (querySection) {
    lines.push(querySection);
    lines.push("");
  }

  const mutationSection = formatRootTypeSection(
    schema,
    mutationTypeName,
    "Mutation",
  );
  if (mutationSection) {
    lines.push(mutationSection);
    lines.push("");
  }

  const subscriptionSection = formatRootTypeSection(
    schema,
    subscriptionTypeName,
    "Subscription",
  );
  if (subscriptionSection) {
    lines.push(subscriptionSection);
    lines.push("");
  }

  // Object types sorted by field count (exclude root types)
  const rootNames = new Set([
    queryTypeName,
    mutationTypeName,
    subscriptionTypeName,
  ]);
  const objectTypes = userTypes
    .filter((t) => isObjectType(t) && !rootNames.has(t.name))
    .map((t) => ({
      name: t.name,
      fieldCount: getFieldsArray(t).length,
    }))
    .sort((a, b) => b.fieldCount - a.fieldCount);

  if (objectTypes.length > 0) {
    lines.push("### Object Types (sorted by field count)");
    for (const t of objectTypes) {
      lines.push(`- ${t.name} (${t.fieldCount} fields)`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

/**
 * Generate detailed info for specific type names.
 */
export function generateTypeDetail(sdl: string, typeNames: string[]): string {
  let schema: GraphQLSchema;
  try {
    schema = buildSchema(sdl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `**Error parsing schema**: ${message}`;
  }

  const sections: string[] = [];

  for (const name of typeNames) {
    const type = schema.getType(name);
    if (!type) {
      sections.push(`## Type: ${name}\n_Type not found_`);
      continue;
    }

    const lines: string[] = [`## Type: ${name}`];

    if (isObjectType(type) || isInterfaceType(type) || isInputObjectType(type)) {
      const fields = Object.values(type.getFields());
      for (const field of fields) {
        lines.push(`- ${formatField(field)}`);
      }
    } else if (isEnumType(type)) {
      for (const val of type.getValues()) {
        const dep = val.deprecationReason != null
          ? ` **[deprecated]** — ${val.deprecationReason}`
          : "";
        lines.push(`- ${val.name}${dep}`);
      }
    } else if (isUnionType(type)) {
      const members = type.getTypes().map((t) => t.name);
      lines.push(`Union of: ${members.join(" | ")}`);
    } else if (isScalarType(type)) {
      lines.push(`_Custom scalar_`);
    }

    sections.push(lines.join("\n"));
  }

  return sections.join("\n\n").trimEnd();
}

/**
 * Count user-defined types (exclude built-in scalars and __* introspection types).
 */
export function countUserTypes(sdl: string): { types: number; fields: number } {
  let schema: GraphQLSchema;
  try {
    schema = buildSchema(sdl);
  } catch {
    return { types: 0, fields: 0 };
  }

  const typeMap = schema.getTypeMap();
  const userTypes = Object.values(typeMap).filter(isUserType);

  let fields = 0;
  for (const type of userTypes) {
    fields += getFieldsArray(type).length;
  }

  return { types: userTypes.length, fields };
}
