/**
 * Parse and merge headers from various sources
 * @param configHeaders - Default headers from configuration
 * @param inputHeaders - Headers provided by the user (string or object)
 * @returns Merged headers object
 */
export function parseAndMergeHeaders(
  configHeaders: Record<string, string>,
  inputHeaders?: string | Record<string, string>
): Record<string, string> {
  // Parse headers if they're provided as a string
  let parsedHeaders: Record<string, string> = {};
  
  if (typeof inputHeaders === 'string') {
    try {
      parsedHeaders = JSON.parse(inputHeaders);
    } catch (e) {
      throw new Error(`Invalid headers JSON: ${e}`);
    }
  } else if (inputHeaders) {
    parsedHeaders = inputHeaders;
  }
  
  // Merge with config headers (config headers are overridden by input headers)
  return { ...configHeaders, ...parsedHeaders };
}
