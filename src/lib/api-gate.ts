/** Shared by the edge middleware and Node: no imports allowed here. */
export function gateMessage(method: string, path: string): string {
  return `albm-gate\n${method}\n${path}`;
}
