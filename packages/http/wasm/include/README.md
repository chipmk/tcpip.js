# llhttp sources

The Makefile downloads llhttp into `packages/http/llhttp`, matching the Makefile-managed lwIP checkout used by `packages/tcpip`.

The build uses the specified release branch which contains generated C sources and headers:

- `llhttp/include/llhttp.h`
- `llhttp/src/llhttp.c`
- `llhttp/src/api.c`
- `llhttp/src/http.c`

The wrapper exports a small tcpip-style handle API to TypeScript.
