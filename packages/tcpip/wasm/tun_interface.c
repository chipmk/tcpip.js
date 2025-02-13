#include <stdlib.h>
#include <string.h>

#include "lwip/netif.h"
#include "macros.h"

extern void register_tun_interface(struct netif *netif);
extern void receive_packet(struct netif *netif, const uint8_t *packet, uint16_t length);

err_t tun_interface_output(struct netif *netif, struct pbuf *p, const ip4_addr_t *ipaddr) {
  receive_packet(netif, (uint8_t *)p->payload, p->tot_len);
  return 0;
}

static err_t tun_interface_init(struct netif *netif) {
  // Setup callback for outgoing IP packets
  netif->output = tun_interface_output;

  return ERR_OK;
}

EXPORT("create_tun_interface")
struct netif *create_tun_interface(const uint8_t ip4[4], const uint8_t netmask[4]) {
  struct netif *netif = (struct netif *)malloc(sizeof(struct netif));

  if (!netif) {
    return NULL;
  }

  ip4_addr_t *ip4_addr = NULL;
  ip4_addr_t *netmask_addr = NULL;

  if (ip4) {
    ip4_addr = malloc(sizeof(ip4_addr_t));
    IP4_ADDR(ip4_addr, ip4[0], ip4[1], ip4[2], ip4[3]);
  }

  if (netmask) {
    netmask_addr = malloc(sizeof(ip4_addr_t));
    IP4_ADDR(netmask_addr, netmask[0], netmask[1], netmask[2], netmask[3]);
  }

  register_tun_interface(netif);

  netif_add(netif, ip4_addr, netmask_addr, NULL, NULL, tun_interface_init, netif_input);
  netif_set_link_up(netif);
  netif_set_up(netif);

  return netif;
}

EXPORT("remove_tun_interface")
void remove_tun_interface(struct netif *netif) {
  netif_remove(netif);
  free(netif);
}

EXPORT("send_tun_interface")
void send_tun_interface(struct netif *netif, const uint8_t *packet, uint16_t length) {
  // Allocate a pbuf with PBUF_REF, pointing to packet buffer data
  struct pbuf *p = pbuf_alloc(PBUF_RAW, length, PBUF_REF);
  if (p != NULL) {
    p->payload = (void *)packet;

    // Pass the pbuf to lwIP for processing
    if (netif->input(p, netif) != ERR_OK) {
      pbuf_free(p);
    }
  }
}