const IN_NODE =
  typeof process === 'object' &&
  typeof process.versions === 'object' &&
  typeof process.versions.node === 'string';

/**
 * Fetches a file from the network or filesystem
 * depending on the environment.
 */
export async function fetchFile(input: string | URL, type: string) {
  if (IN_NODE) {
    return fetchFileNode(input, type);
  }
  return fetch(input);
}

async function fetchFileNode(input: string | URL, type: string) {
  const fs = await import('node:fs');
  const { Readable } = await import('node:stream');
  const nodeStream = fs.createReadStream(input);
  const stream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
  return new Response(stream, { headers: { 'Content-Type': type } });
}
