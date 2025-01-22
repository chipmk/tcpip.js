#include "lwip/udp.h"

#include <stdbool.h>
#include <stdio.h>

#include "lwip/err.h"
#include "macros.h"

extern void receive_udp_datagram(struct udp_pcb *conn, const uint8_t *addr, uint16_t port, const uint8_t *datagram, uint16_t length);

EXPORT("send_udp_datagram")
err_t send_udp_datagram(struct udp_pcb *conn, const uint8_t *addr, uint16_t port, uint8_t *datagram, uint16_t length) {
  struct pbuf *p = pbuf_alloc(PBUF_TRANSPORT, length, PBUF_RAM);
  if (p == NULL) {
    return ERR_MEM;
  }

  ip4_addr_t ipaddr;
  IP4_ADDR(&ipaddr, addr[0], addr[1], addr[2], addr[3]);

  pbuf_take(p, datagram, length);
  err_t code = udp_sendto(conn, p, &ipaddr, port);
  pbuf_free(p);

  return code;
}

EXPORT("close_udp_connection")
void close_udp_connection(struct udp_pcb *conn) {
  udp_remove(conn);
}

// Callback for when data is received
void recv_udp_callback(void *arg, struct udp_pcb *conn, struct pbuf *p, const struct ip4_addr *addr, uint16_t port) {
  if (p == NULL) {
    return;
  }

  receive_udp_datagram(conn, (const uint8_t *)&addr->addr, port, p->payload, p->len);
  pbuf_free(p);
}

EXPORT("open_udp_connection")
struct udp_pcb *open_udp_connection(uint8_t *host, int port, bool allow_broadcast) {
  struct udp_pcb *conn = udp_new();

  if (conn == NULL) {
    return NULL;
  }

  if (allow_broadcast) {
    ip_set_option(conn, SOF_BROADCAST);
  }

  ip4_addr_t ipaddr;
  if (host != NULL) {
    IP4_ADDR(&ipaddr, host[0], host[1], host[2], host[3]);
  } else {
    IP4_ADDR(&ipaddr, 0, 0, 0, 0);
  }

  // print ip addr
  char *ipaddr_str = ipaddr_ntoa(&ipaddr);

  err_t err;
  err = udp_bind(conn, &ipaddr, port);
  if (err != ERR_OK) {
    udp_remove(conn);
    return NULL;
  }

  udp_recv(conn, recv_udp_callback, NULL);
  return conn;
}
