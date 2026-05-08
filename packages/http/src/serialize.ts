const encoder = new TextEncoder();

export type SerializableHttpBody =
  | ReadableStream<Uint8Array>
  | {
      stream: ReadableStream<Uint8Array>;
      length?: number;
    }
  | null;

const statusTexts = new Map<number, string>([
  [200, 'OK'],
  [201, 'Created'],
  [202, 'Accepted'],
  [203, 'Non-Authoritative Information'],
  [204, 'No Content'],
  [205, 'Reset Content'],
  [206, 'Partial Content'],
  [300, 'Multiple Choices'],
  [301, 'Moved Permanently'],
  [302, 'Found'],
  [303, 'See Other'],
  [304, 'Not Modified'],
  [307, 'Temporary Redirect'],
  [308, 'Permanent Redirect'],
  [400, 'Bad Request'],
  [401, 'Unauthorized'],
  [403, 'Forbidden'],
  [404, 'Not Found'],
  [405, 'Method Not Allowed'],
  [408, 'Request Timeout'],
  [409, 'Conflict'],
  [410, 'Gone'],
  [413, 'Content Too Large'],
  [414, 'URI Too Long'],
  [415, 'Unsupported Media Type'],
  [418, "I'm a Teapot"],
  [422, 'Unprocessable Content'],
  [425, 'Too Early'],
  [429, 'Too Many Requests'],
  [500, 'Internal Server Error'],
  [501, 'Not Implemented'],
  [502, 'Bad Gateway'],
  [503, 'Service Unavailable'],
  [504, 'Gateway Timeout'],
]);

function encode(text: string) {
  return encoder.encode(text);
}

function hasHeader(headers: Headers, name: string) {
  return headers.has(name);
}

function headerIncludes(headers: Headers, name: string, value: string) {
  return (
    headers
      .get(name)
      ?.split(',')
      .some((part) => part.trim().toLowerCase() === value) ?? false
  );
}

function appendHeaderLines(
  lines: string[],
  headers: Iterable<[string, string]>
) {
  for (const [name, value] of headers) {
    lines.push(`${name}: ${value}`);
  }
}

function bodyStream(body: SerializableHttpBody) {
  if (!body) {
    return null;
  }
  return body instanceof ReadableStream ? body : body.stream;
}

function bodyLength(body: SerializableHttpBody) {
  if (!body || body instanceof ReadableStream) {
    return undefined;
  }
  return body.length;
}

function requestHeaders(
  request: Request,
  hasBody: boolean,
  knownLength?: number
) {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  const lines: [string, string][] = [...headers];

  if (!hasHeader(headers, 'host')) {
    lines.push(['host', url.host]);
  }

  if (!hasHeader(headers, 'connection')) {
    lines.push(['connection', 'close']);
  }

  if (
    hasBody &&
    !hasHeader(headers, 'content-length') &&
    !hasHeader(headers, 'transfer-encoding')
  ) {
    if (knownLength !== undefined) {
      lines.push(['content-length', String(knownLength)]);
    } else {
      lines.push(['transfer-encoding', 'chunked']);
    }
  }

  return lines;
}

function responseHeaders(response: Response, hasBody: boolean) {
  const headers = new Headers(response.headers);
  const lines: [string, string][] = [...headers];

  if (!hasHeader(headers, 'connection')) {
    lines.push(['connection', 'close']);
  }

  if (
    hasBody &&
    !hasHeader(headers, 'content-length') &&
    !hasHeader(headers, 'transfer-encoding')
  ) {
    lines.push(['transfer-encoding', 'chunked']);
  }

  return lines;
}

function statusText(response: Response) {
  if (response.statusText) {
    return response.statusText;
  }

  return statusTexts.get(response.status) ?? 'unknown';
}

export function statusAllowsBody(status: number) {
  return (
    status !== 204 &&
    status !== 205 &&
    status !== 304 &&
    (status < 100 || status >= 200)
  );
}

function hasResponseBody(response: Response) {
  return !!response.body && statusAllowsBody(response.status);
}

function shouldChunkBody(
  headers: Headers,
  hasBody: boolean,
  knownLength?: number
) {
  return (
    hasBody &&
    knownLength === undefined &&
    !hasHeader(headers, 'content-length') &&
    (!hasHeader(headers, 'transfer-encoding') ||
      headerIncludes(headers, 'transfer-encoding', 'chunked'))
  );
}

function chunk(chunk: Uint8Array) {
  const head = encode(`${chunk.length.toString(16)}\r\n`);
  const tail = encode('\r\n');
  const result = new Uint8Array(head.length + chunk.length + tail.length);
  result.set(head);
  result.set(chunk, head.length);
  result.set(tail, head.length + chunk.length);
  return result;
}

async function pipeBody(
  controller: ReadableStreamDefaultController<Uint8Array>,
  body: ReadableStream<Uint8Array> | null,
  chunked: boolean
) {
  if (!body) {
    controller.close();
    return;
  }

  const reader = body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (value.length === 0) {
        continue;
      }

      controller.enqueue(chunked ? chunk(value) : value);
    }

    if (chunked) {
      controller.enqueue(encode('0\r\n\r\n'));
    }
    controller.close();
  } catch (error) {
    controller.error(error);
  } finally {
    reader.releaseLock();
  }
}

export function requestTarget(url: URL) {
  return `${url.pathname || '/'}${url.search}`;
}

export function serializeHttpRequest(
  request: Request,
  body: SerializableHttpBody = request.body
) {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const url = new URL(request.url);
      const stream = bodyStream(body);
      const length = bodyLength(body);
      const headers = requestHeaders(request, !!stream, length);

      const lines = [`${request.method} ${requestTarget(url)} HTTP/1.1`];
      appendHeaderLines(lines, headers);

      controller.enqueue(encode(`${lines.join('\r\n')}\r\n\r\n`));
      await pipeBody(
        controller,
        stream,
        shouldChunkBody(new Headers(request.headers), !!stream, length)
      );
    },
  });
}

export function serializeHttpResponse(response: Response) {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const hasBody = hasResponseBody(response);
      const headers = responseHeaders(response, hasBody);

      const lines = [`HTTP/1.1 ${response.status} ${statusText(response)}`];
      appendHeaderLines(lines, headers);

      controller.enqueue(encode(`${lines.join('\r\n')}\r\n\r\n`));
      await pipeBody(
        controller,
        hasBody ? response.body : null,
        shouldChunkBody(new Headers(response.headers), hasBody)
      );
    },
  });
}
