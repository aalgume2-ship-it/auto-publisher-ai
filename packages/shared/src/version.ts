/**
 * Contract governance (docs/Contracts.md): v1 is frozen — additive changes bump
 * MINOR, breaking changes require a V2 contract namespace, never mutation.
 */
export const CONTRACT_MAJOR = 1 as const;
export const CONTRACT_MINOR = 0 as const;
export const CONTRACT_PATCH = 0 as const;
export const CONTRACT_VERSION = `${CONTRACT_MAJOR}.${CONTRACT_MINOR}.${CONTRACT_PATCH}` as const;

/** Included in plugin manifests and SDK user agents (`aca-sdk/<sdkVersion> contract/<major>`). */
export const CONTRACT_USER_AGENT_TAG = `contract/${CONTRACT_MAJOR}` as const;
