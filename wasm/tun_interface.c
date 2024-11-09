#include <stdlib.h>
#include <string.h>

#include "lwip/netif.h"
#include "macros.h"

typedef struct tun_interface {
  struct netif netif;
} tun_interface;

extern void register_tun_interface(tun_interface *interface);
extern void receive_packet(tun_interface *interface, const uint8_t *packet, uint16_t length);

err_t tun_interface_output(struct netif *netif, struct pbuf *p, const ip4_addr_t *ipaddr) {
  receive_packet(netif->state, (uint8_t *)p->payload, p->tot_len);
  return 0;
}

static err_t tun_interface_init(struct netif *netif) {
  // Setup callback for outgoing IP packets
  netif->output = tun_interface_output;

  return ERR_OK;
}

EXPORT("create_tun_interface")
tun_interface *create_tun_interface(const uint8_t *ip4, const uint8_t *netmask) {
  tun_interface *interface = (tun_interface *)malloc(sizeof(tun_interface));

  if (!interface) {
    return NULL;
  }

  ip4_addr_t ipaddr, netmask_addr;
  IP4_ADDR(&ipaddr, ip4[0], ip4[1], ip4[2], ip4[3]);
  IP4_ADDR(&netmask_addr, netmask[0], netmask[1], netmask[2], netmask[3]);

  register_tun_interface(interface);

  netif_add(&interface->netif, &ipaddr, &netmask_addr, NULL, interface, tun_interface_init, netif_input);
  netif_set_up(&interface->netif);

  return interface;
}

EXPORT("send_tun_interface")
void send_tun_interface(tun_interface *interface, const uint8_t *packet, uint16_t length) {
  // Allocate a pbuf with PBUF_REF, pointing to packet buffer data
  struct pbuf *p = pbuf_alloc(PBUF_RAW, length, PBUF_REF);
  if (p != NULL) {
    p->payload = (void *)packet;

    // Pass the pbuf to lwIP for processing
    if (interface->netif.input(p, &interface->netif) != ERR_OK) {
      pbuf_free(p);
    }
  }
}