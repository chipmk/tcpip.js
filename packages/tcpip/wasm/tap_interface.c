#include <stdlib.h>
#include <string.h>

#include "lwip/netif.h"
#include "macros.h"
#include "netif/etharp.h"

typedef struct tap_interface {
  struct netif netif;
  uint8_t mac_address[6];
  u16_t mtu;
} tap_interface;

extern void register_tap_interface(tap_interface *interface);
extern void receive_frame(tap_interface *interface, const uint8_t *frame, uint16_t length);

err_t tap_interface_output(struct netif *netif, struct pbuf *p) {
  receive_frame(netif->state, (uint8_t *)p->payload, p->tot_len);
  return 0;
}

static err_t tap_interface_init(struct netif *netif) {
  tap_interface *interface = (tap_interface *)netif->state;

  // Set MAC address
  memcpy(netif->hwaddr, interface->mac_address, sizeof(interface->mac_address));
  netif->hwaddr_len = sizeof(interface->mac_address);

  // Set MTU
  netif->mtu = interface->mtu;

  // Set interface flags
  netif->flags = NETIF_FLAG_BROADCAST | NETIF_FLAG_ETHARP | NETIF_FLAG_ETHERNET;

  // Wrap outgoing IP packets in Ethernet frames (MACs resolved via ARP)
  netif->output = etharp_output;

  // Setup callback for outgoing Ethernet frames
  netif->linkoutput = tap_interface_output;

  return ERR_OK;
}

EXPORT("create_tap_interface")
tap_interface *create_tap_interface(const uint8_t mac_address[6], const uint8_t *ip4, const uint8_t *netmask) {
  tap_interface *interface = (tap_interface *)malloc(sizeof(tap_interface));

  if (!interface) {
    return NULL;
  }

  // TODO: make MTU configurable
  interface->mtu = 1500;

  memcpy(interface->mac_address, mac_address, 6);

  ip4_addr_t ipaddr, netmask_addr;
  IP4_ADDR(&ipaddr, ip4[0], ip4[1], ip4[2], ip4[3]);
  IP4_ADDR(&netmask_addr, netmask[0], netmask[1], netmask[2], netmask[3]);

  register_tap_interface(interface);

  netif_add(&interface->netif, &ipaddr, &netmask_addr, NULL, interface, tap_interface_init, netif_input);
  netif_set_link_up(&interface->netif);
  netif_set_up(&interface->netif);

  return interface;
}

EXPORT("remove_tap_interface")
void remove_tap_interface(tap_interface *interface) {
  netif_remove(&interface->netif);
  free(interface);
}

EXPORT("send_tap_interface")
void send_tap_interface(tap_interface *interface, const uint8_t *frame, uint16_t length) {
  // Allocate a pbuf with PBUF_REF, pointing to frame buffer data
  struct pbuf *p = pbuf_alloc(PBUF_RAW, length, PBUF_REF);
  if (p != NULL) {
    p->payload = (void *)frame;

    // Pass the pbuf to lwIP for processing
    if (interface->netif.input(p, &interface->netif) != ERR_OK) {
      pbuf_free(p);
    }
  }
}