/**
 * Compatibility entry point of the "Canales" source.
 *
 * The implementation lives in `streams.ts`; this module only re-exports it so
 * the two copies cannot drift apart again (they did, and every fix landed in
 * a file the app no longer imported).
 */
export * from "./streams";
