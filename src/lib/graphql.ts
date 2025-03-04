// Contains Schema parsing and transformation logic

import { getIntrospectionQuery } from "graphql";

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
  }
}
