/** JSON values as Roblox can represent them. Roblox has no `null`, so a decoded
 * JSON null arrives as `undefined` and is treated as absent. */
export type JsonPrimitive = string | number | boolean;

export type JsonArray = ReadonlyArray<JsonValue>;

export type JsonObject = { readonly [key: string]: JsonValue };

export type JsonValue = JsonPrimitive | JsonArray | JsonObject;
