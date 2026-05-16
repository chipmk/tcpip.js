#include "lwip/inet_chksum.h"
#include "lwip/ip4.h"
#include "lwip/pbuf.h"
#include "lwip/prot/icmp.h"
#include "lwip/raw.h"

#include <stdlib.h>
#include <string.h>

#include "macros.h"

extern uint8_t receive_icmp_echo_reply(struct raw_pcb *socket, const uint8_t *addr, uint16_t identifier, uint16_t sequence_number, const uint8_t *payload, uint16_t length);

static uint8_t recv_icmp_callback(void *arg, struct raw_pcb *socket, struct pbuf *p, const ip_addr_t *addr) {
  LWIP_UNUSED_ARG(arg);

  if (!IP_IS_V4(addr)) {
    return 0;
  }

  if (p->tot_len < IP_HLEN + sizeof(struct icmp_echo_hdr)) {
    return 0;
  }

  struct ip_hdr iphdr;
  pbuf_copy_partial(p, &iphdr, sizeof(iphdr), 0);
  uint16_t ip_header_length = IPH_HL_BYTES(&iphdr);

  if (p->tot_len < ip_header_length + sizeof(struct icmp_echo_hdr)) {
    return 0;
  }

  struct icmp_echo_hdr echo;
  pbuf_copy_partial(p, &echo, sizeof(echo), ip_header_length);

  if (echo.type != ICMP_ER || echo.code != 0) {
    return 0;
  }

  uint16_t payload_length = p->tot_len - ip_header_length - sizeof(struct icmp_echo_hdr);
  uint8_t *payload = NULL;

  if (payload_length > 0) {
    payload = malloc(payload_length);
    if (payload == NULL) {
      return 0;
    }

    pbuf_copy_partial(p, payload, payload_length, ip_header_length + sizeof(struct icmp_echo_hdr));
  }

  uint8_t eaten = receive_icmp_echo_reply(
    socket,
    (const uint8_t *)&ip_2_ip4(addr)->addr,
    lwip_ntohs(echo.id),
    lwip_ntohs(echo.seqno),
    payload,
    payload_length
  );

  free(payload);

  if (eaten) {
    pbuf_free(p);
    return 1;
  }

  return 0;
}

EXPORT("open_icmp_socket")
struct raw_pcb *open_icmp_socket() {
  struct raw_pcb *socket = raw_new(IP_PROTO_ICMP);

  if (socket == NULL) {
    return NULL;
  }

  raw_recv(socket, recv_icmp_callback, NULL);
  return socket;
}

EXPORT("close_icmp_socket")
void close_icmp_socket(struct raw_pcb *socket) {
  raw_remove(socket);
}

EXPORT("send_icmp_echo_request")
err_t send_icmp_echo_request(struct raw_pcb *socket, const uint8_t *addr, uint16_t identifier, uint16_t sequence_number, uint8_t *payload, uint16_t length) {
  ip4_addr_t ipaddr;
  IP4_ADDR(&ipaddr, addr[0], addr[1], addr[2], addr[3]);

  struct pbuf *p = pbuf_alloc(PBUF_IP, sizeof(struct icmp_echo_hdr) + length, PBUF_RAM);
  if (p == NULL) {
    return ERR_MEM;
  }

  struct icmp_echo_hdr *echo = (struct icmp_echo_hdr *)p->payload;
  echo->type = ICMP_ECHO;
  echo->code = 0;
  echo->chksum = 0;
  echo->id = lwip_htons(identifier);
  echo->seqno = lwip_htons(sequence_number);

  if (length > 0) {
    uint8_t *echo_payload = ((uint8_t *)p->payload) + sizeof(struct icmp_echo_hdr);
    MEMCPY(echo_payload, payload, length);
  }

  echo->chksum = inet_chksum(p->payload, p->len);

  err_t code = raw_sendto(socket, p, &ipaddr);
  pbuf_free(p);
  return code;
}
