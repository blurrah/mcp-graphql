import type { AppConfig, EndpointConfig } from "./config.js";

/**
 * Registry for managing multiple GraphQL endpoints.
 * Resolves endpoint names to their configurations.
 */
export class EndpointRegistry {
	private readonly endpointsByName: Map<string, EndpointConfig>;
	private readonly defaultName: string;

	constructor(config: AppConfig) {
		this.endpointsByName = new Map();

		for (const endpoint of config.endpoints) {
			if (this.endpointsByName.has(endpoint.name)) {
				throw new Error(
					`Duplicate endpoint name: "${endpoint.name}"`,
				);
			}
			this.endpointsByName.set(endpoint.name, endpoint);
		}

		// Default endpoint: explicit config, or first endpoint
		if (config.defaultEndpoint) {
			if (!this.endpointsByName.has(config.defaultEndpoint)) {
				throw new Error(
					`Default endpoint "${config.defaultEndpoint}" not found in configured endpoints`,
				);
			}
			this.defaultName = config.defaultEndpoint;
		} else {
			this.defaultName = config.endpoints[0].name;
		}
	}

	/**
	 * Resolve an endpoint by name. If no name is provided, returns the default endpoint.
	 * Throws if the named endpoint is not found.
	 */
	resolve(name?: string): EndpointConfig {
		if (!name) {
			return this.getDefault();
		}

		const endpoint = this.endpointsByName.get(name);
		if (!endpoint) {
			const available = this.names().join(", ");
			throw new Error(
				`Endpoint "${name}" not found. Available endpoints: ${available}`,
			);
		}
		return endpoint;
	}

	/**
	 * Returns all configured endpoints.
	 */
	list(): EndpointConfig[] {
		return Array.from(this.endpointsByName.values());
	}

	/**
	 * Returns the default endpoint configuration.
	 */
	getDefault(): EndpointConfig {
		const endpoint = this.endpointsByName.get(this.defaultName);
		if (!endpoint) {
			throw new Error("No default endpoint configured");
		}
		return endpoint;
	}

	/**
	 * Returns all endpoint names.
	 */
	names(): string[] {
		return Array.from(this.endpointsByName.keys());
	}
}
