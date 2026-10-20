/** JSON values as Roblox can represent them. Roblox has no `null`, so a decoded
 * JSON null arrives as `undefined` and is treated as absent. */
export type JsonPrimitive = string | number | boolean;

/** An array of JSON values. */
export type JsonArray = ReadonlyArray<JsonValue>;

/** An object with string keys and JSON values. */
export type JsonObject = { readonly [key: string]: JsonValue };

/** Any value that Roblox `HttpService` can encode as JSON. */
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;
