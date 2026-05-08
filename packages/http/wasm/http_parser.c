#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include "llhttp.h"

#define EXPORT(name) __attribute__((export_name(name)))

#define HTTP_REQUEST_TYPE 0
#define HTTP_RESPONSE_TYPE 1

extern void parsed_http_headers(
    void *handle,
    int parser_type,
    const char *method,
    int method_length,
    const char *url,
    int url_length,
    int status_code,
    const char *status,
    int status_length,
    int http_major,
    int http_minor,
    const char *headers,
    int headers_length,
    int should_keep_alive,
    int upgrade);

extern void parsed_http_body(void *handle, const char *chunk, int chunk_length);
extern void completed_http_message(void *handle);
extern void failed_http_parse(void *handle, int code, const char *reason);

typedef struct {
  llhttp_t parser;
  llhttp_settings_t settings;
  int parser_type;
  char *method;
  size_t method_length;
  char *url;
  size_t url_length;
  char *status;
  size_t status_length;
  char *header_field;
  size_t header_field_length;
  char *header_value;
  size_t header_value_length;
  char *headers;
  size_t headers_length;
} http_parser_wrapper_t;

static int append_bytes(char **target, size_t *target_length, const char *at, size_t length) {
  char *next = realloc(*target, *target_length + length);
  if (next == NULL) {
    return -1;
  }

  memcpy(next + *target_length, at, length);
  *target = next;
  *target_length += length;
  return 0;
}

static void clear_buffer(char **target, size_t *target_length) {
  free(*target);
  *target = NULL;
  *target_length = 0;
}

static int append_header(http_parser_wrapper_t *wrapper) {
  if (wrapper->header_field_length == 0) {
    return 0;
  }

  size_t added_length = wrapper->header_field_length + 1 + wrapper->header_value_length + 1;
  char *next = realloc(wrapper->headers, wrapper->headers_length + added_length);
  if (next == NULL) {
    return -1;
  }

  wrapper->headers = next;
  memcpy(wrapper->headers + wrapper->headers_length, wrapper->header_field, wrapper->header_field_length);
  wrapper->headers_length += wrapper->header_field_length;
  wrapper->headers[wrapper->headers_length++] = ':';
  memcpy(wrapper->headers + wrapper->headers_length, wrapper->header_value, wrapper->header_value_length);
  wrapper->headers_length += wrapper->header_value_length;
  wrapper->headers[wrapper->headers_length++] = '\0';

  clear_buffer(&wrapper->header_field, &wrapper->header_field_length);
  clear_buffer(&wrapper->header_value, &wrapper->header_value_length);
  return 0;
}

static int on_message_begin(llhttp_t *parser) {
  http_parser_wrapper_t *wrapper = parser->data;
  clear_buffer(&wrapper->method, &wrapper->method_length);
  clear_buffer(&wrapper->url, &wrapper->url_length);
  clear_buffer(&wrapper->status, &wrapper->status_length);
  clear_buffer(&wrapper->header_field, &wrapper->header_field_length);
  clear_buffer(&wrapper->header_value, &wrapper->header_value_length);
  clear_buffer(&wrapper->headers, &wrapper->headers_length);
  return 0;
}

static int on_method(llhttp_t *parser, const char *at, size_t length) {
  http_parser_wrapper_t *wrapper = parser->data;
  return append_bytes(&wrapper->method, &wrapper->method_length, at, length);
}

static int on_url(llhttp_t *parser, const char *at, size_t length) {
  http_parser_wrapper_t *wrapper = parser->data;
  return append_bytes(&wrapper->url, &wrapper->url_length, at, length);
}

static int on_status(llhttp_t *parser, const char *at, size_t length) {
  http_parser_wrapper_t *wrapper = parser->data;
  return append_bytes(&wrapper->status, &wrapper->status_length, at, length);
}

static int on_header_field(llhttp_t *parser, const char *at, size_t length) {
  http_parser_wrapper_t *wrapper = parser->data;
  if (wrapper->header_value_length > 0 && append_header(wrapper) != 0) {
    return -1;
  }
  return append_bytes(&wrapper->header_field, &wrapper->header_field_length, at, length);
}

static int on_header_value(llhttp_t *parser, const char *at, size_t length) {
  http_parser_wrapper_t *wrapper = parser->data;
  return append_bytes(&wrapper->header_value, &wrapper->header_value_length, at, length);
}

static int on_headers_complete(llhttp_t *parser) {
  http_parser_wrapper_t *wrapper = parser->data;
  if (append_header(wrapper) != 0) {
    return -1;
  }

  parsed_http_headers(
      wrapper,
      wrapper->parser_type,
      wrapper->method,
      (int)wrapper->method_length,
      wrapper->url,
      (int)wrapper->url_length,
      llhttp_get_status_code(parser),
      wrapper->status,
      (int)wrapper->status_length,
      llhttp_get_http_major(parser),
      llhttp_get_http_minor(parser),
      wrapper->headers,
      (int)wrapper->headers_length,
      llhttp_should_keep_alive(parser),
      llhttp_get_upgrade(parser));

  return 0;
}

static int on_body(llhttp_t *parser, const char *at, size_t length) {
  http_parser_wrapper_t *wrapper = parser->data;
  parsed_http_body(wrapper, at, (int)length);
  return 0;
}

static int on_message_complete(llhttp_t *parser) {
  http_parser_wrapper_t *wrapper = parser->data;
  completed_http_message(wrapper);
  return 0;
}

EXPORT("create_http_parser")
http_parser_wrapper_t *create_http_parser(int type) {
  http_parser_wrapper_t *wrapper = calloc(1, sizeof(http_parser_wrapper_t));
  if (wrapper == NULL) {
    return NULL;
  }

  wrapper->parser_type = type;
  llhttp_settings_init(&wrapper->settings);
  wrapper->settings.on_message_begin = on_message_begin;
  wrapper->settings.on_method = on_method;
  wrapper->settings.on_url = on_url;
  wrapper->settings.on_status = on_status;
  wrapper->settings.on_header_field = on_header_field;
  wrapper->settings.on_header_value = on_header_value;
  wrapper->settings.on_headers_complete = on_headers_complete;
  wrapper->settings.on_body = on_body;
  wrapper->settings.on_message_complete = on_message_complete;

  llhttp_init(
      &wrapper->parser,
      type == HTTP_REQUEST_TYPE ? HTTP_REQUEST : HTTP_RESPONSE,
      &wrapper->settings);
  wrapper->parser.data = wrapper;
  return wrapper;
}

EXPORT("execute_http_parser")
int execute_http_parser(http_parser_wrapper_t *wrapper, const char *data, size_t length) {
  llhttp_errno_t err = llhttp_execute(&wrapper->parser, data, length);
  if (err != HPE_OK) {
    failed_http_parse(wrapper, err, llhttp_get_error_reason(&wrapper->parser));
  }
  return err;
}

EXPORT("finish_http_parser")
int finish_http_parser(http_parser_wrapper_t *wrapper) {
  llhttp_errno_t err = llhttp_finish(&wrapper->parser);
  if (err != HPE_OK) {
    failed_http_parse(wrapper, err, llhttp_get_error_reason(&wrapper->parser));
  }
  return err;
}

EXPORT("free_http_parser")
void free_http_parser(http_parser_wrapper_t *wrapper) {
  if (wrapper == NULL) {
    return;
  }

  clear_buffer(&wrapper->method, &wrapper->method_length);
  clear_buffer(&wrapper->url, &wrapper->url_length);
  clear_buffer(&wrapper->status, &wrapper->status_length);
  clear_buffer(&wrapper->header_field, &wrapper->header_field_length);
  clear_buffer(&wrapper->header_value, &wrapper->header_value_length);
  clear_buffer(&wrapper->headers, &wrapper->headers_length);
  free(wrapper);
}
