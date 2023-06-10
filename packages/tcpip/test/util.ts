let ports = 8000;

/**
 * Each test needs a different port, since they can run in parallel.
 */
export function getPort() {
  return ports++;
}
