/**
 * This file tells TypeScript to trust the vis-network module,
 * even though it doesn't have its own official type declarations.
 * This resolves the "Could not find a declaration file" error.
 */
declare module 'vis-network/dist/vis-network.esm.min.js';