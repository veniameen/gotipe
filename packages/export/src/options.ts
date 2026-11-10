/** Reject unsupported options before asset access or compiler initialization. */
export function validateOptionNames(
  options: object | undefined,
  supported: readonly string[],
): void {
  if (options === undefined) return;
  if (options === null || typeof options !== "object" || Array.isArray(options))
    throw new TypeError("Export options must be an object");
  for (const name of Object.keys(options)) {
    if (!supported.includes(name)) throw new TypeError(`Unsupported export option: ${name}`);
  }
}
