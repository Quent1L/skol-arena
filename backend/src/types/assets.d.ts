/** Files imported with `with { type: "file" }`: Bun resolves them to a path. */
declare module "*.png" {
  const path: string;
  export default path;
}
