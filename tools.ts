import type { StandardSchemaV1 } from "@standard-schema/spec";
import { z } from "zod";

export interface Tool<
  Args extends undefined | StandardSchemaV1 = undefined | StandardSchemaV1
> {
  name: string;
  description: string;
  args?: Args;
  run: Args extends StandardSchemaV1
    ? (args: StandardSchemaV1.InferOutput<Args>) => Promise<unknown>
    : () => Promise<unknown>;
}

// Thanks opencontrol
export function tool<Args extends undefined | StandardSchemaV1>(
  input: Tool<Args>
) {
  return input;
}

export const tools = [
  tool({
    name: "query-graphql",
    description: "Query a GraphQL endpoint",
    args: z.object({
      query: z.string(),
      variables: z.string().optional(),
    }),
    run: async (args) => {
      // Handle GQL fetch
      return "foo";
    },
  }),
  tool({
    name: "show-schema",
    description: "Show the schema of the GraphQL endpoint",
    run: async () => {
      return "foo";
    },
  }),
];
