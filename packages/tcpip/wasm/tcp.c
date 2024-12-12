#include "lwip/tcp.h"

#include <stdio.h>

#include "lwip/err.h"
#include "macros.h"

extern void accept_tcp_connection(struct tcp_pcb *listener, struct tcp_pcb *pcb);
extern void connected_tcp_connection(struct tcp_pcb *conn);
extern void closed_tcp_connection(struct tcp_pcb *conn);
extern void receive_tcp_chunk(struct tcp_pcb *conn, const uint8_t *chunk, uint16_t length);
extern void sent_tcp_chunk(struct tcp_pcb *conn, uint16_t length);

EXPORT("update_tcp_receive_buffer")
void update_tcp_receive_buffer(struct tcp_pcb *conn, uint16_t length) {
  tcp_recved(conn, length);
}

EXPORT("send_tcp_chunk")
uint16_t send_tcp_chunk(struct tcp_pcb *conn, uint8_t *chunk, uint16_t length) {
  uint16_t available_space = tcp_sndbuf(conn);

  if (available_space == 0) {
    return 0;
  }

  uint16_t bytes_to_send = length < available_space ? length : available_space;

  err_t result = tcp_write(conn, chunk, bytes_to_send, TCP_WRITE_FLAG_COPY);
  if (result != ERR_OK) {
    return 0;
  }

  return bytes_to_send;
}

EXPORT("close_tcp_connection")
err_t close_tcp_connection(struct tcp_pcb *conn) {
  return tcp_close(conn);
}

// Callback for when data is received
err_t recv_callback(void *arg, struct tcp_pcb *conn, struct pbuf *p, err_t err) {
  // TODO: review this logic (should we half-close?)
  if (p == NULL) {
    closed_tcp_connection(conn);
    return ERR_OK;
  }

  receive_tcp_chunk(conn, p->payload, p->len);
  pbuf_free(p);

  return ERR_OK;
}

// Callback for when sent data is acknowledged and new buffer space is available
err_t sent_callback(void *arg, struct tcp_pcb *conn, uint16_t len) {
  sent_tcp_chunk(conn, len);
  return ERR_OK;
}

// Callback for when a new connection is accepted
err_t accept_callback(void *arg, struct tcp_pcb *conn, err_t err) {
  struct tcp_pcb *listener = arg;

  accept_tcp_connection(listener, conn);

  // Set a receive callback to handle incoming data
  tcp_recv(conn, recv_callback);

  return ERR_OK;
}

EXPORT("create_tcp_listener")
struct tcp_pcb *create_tcp_listener(uint8_t *host, int port) {
  struct tcp_pcb *listener = tcp_new();

  if (listener == NULL) {
    return NULL;
  }

  ip4_addr_t ipaddr;
  if (host != NULL) {
    IP4_ADDR(&ipaddr, host[0], host[1], host[2], host[3]);
  } else {
    IP4_ADDR(&ipaddr, 0, 0, 0, 0);
  }

  err_t err;
  err = tcp_bind(listener, IP_ANY_TYPE, port);
  if (err != ERR_OK) {
    tcp_close(listener);
    return NULL;
  }

  listener = tcp_listen(listener);
  if (listener == NULL) {
    return NULL;
  }

  // Store the listener's handle for access in the callback
  tcp_arg(listener, listener);
  tcp_accept(listener, accept_callback);

  return listener;
}

err_t connected_callback(void *arg, struct tcp_pcb *conn, err_t err) {
  connected_tcp_connection(conn);

  // Set a receive callback to handle incoming data
  tcp_recv(conn, recv_callback);

  // Set a sent callback to handle outgoing data
  tcp_sent(conn, sent_callback);

  return ERR_OK;
}

EXPORT("create_tcp_connection")
struct tcp_pcb *create_tcp_connection(uint8_t *host, int port) {
  struct tcp_pcb *conn = tcp_new();

  if (conn == NULL) {
    return NULL;
  }

  ip4_addr_t ipaddr;
  IP4_ADDR(&ipaddr, host[0], host[1], host[2], host[3]);

  err_t err = tcp_connect(conn, &ipaddr, port, connected_callback);

  if (err != ERR_OK) {
    tcp_close(conn);
    return NULL;
  }

  return conn;
}