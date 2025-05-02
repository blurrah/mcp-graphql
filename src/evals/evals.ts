//evals.ts

import { EvalConfig } from 'mcp-evals';
import { openai } from "@ai-sdk/openai";
import { grade, EvalFunction } from "mcp-evals";

const introspectSchemaEval: EvalFunction = {
    name: 'introspect-schema Evaluation',
    description: 'Evaluates the introspect-schema tool functionality',
    run: async () => {
        const result = await grade(openai("gpt-4"), "Please introspect the schema for the GraphQL endpoint and return the type definitions.");
        return JSON.parse(result);
    }
};

const queryGraphqlEval: EvalFunction = {
    name: 'query-graphql Tool Evaluation',
    description: 'Evaluates the query-graphql tool functionality',
    run: async () => {
        const result = await grade(openai("gpt-4"), "Please query the GraphQL endpoint for a list of items, then attempt a mutation to add a new item.");
        return JSON.parse(result);
    }
};

const config: EvalConfig = {
    model: openai("gpt-4"),
    evals: [introspectSchemaEval, queryGraphqlEval]
};
  
export default config;
  
export const evals = [introspectSchemaEval, queryGraphqlEval];