/**
 * Helper module for handling deprecation warnings
 */

/**
 * Check for deprecated command line arguments and output warnings
 */
export function checkDeprecatedArguments(): void {
	const deprecatedArgs = [
		"--endpoint",
		"--headers",
		"--enable-mutations",
		"--name",
		"--schema",
	];
	const usedDeprecatedArgs = deprecatedArgs.filter((arg) =>
		process.argv.includes(arg),
	);

	if (usedDeprecatedArgs.length > 0) {
		console.error(
			`WARNING: Deprecated command line arguments detected: ${usedDeprecatedArgs.join(", ")}`,
		);
		console.error(
			"As of version 1.0.0, command line arguments have been replaced with environment variables.",
		);
		console.error("Please use environment variables instead. For example:");
		console.error(
			"  Instead of: npx mcp-graphql --endpoint http://example.com/graphql",
		);
		console.error("  Use: ENDPOINT=http://example.com/graphql npx mcp-graphql");
		console.error("");
	}
}
