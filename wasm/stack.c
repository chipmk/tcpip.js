#include <stdlib.h>
#include <string.h>

#include "lwip/init.h"
#include "lwip/netif.h"
#include "netif/etharp.h"

#define EXPORT_NAME(name) __attribute__((export_name(name)))

typedef struct tap_interface {
  struct netif netif;
  uint8_t mac_address[6];
  u16_t mtu;
} tap_interface;

extern void receive_frame(tap_interface *interface, const uint8_t *frame, u16_t length);

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

EXPORT_NAME("create_tap_interface")
tap_interface *create_tap_interface(const uint8_t mac_address[6], const uint8_t *ip4, const uint8_t *netmask) {
  tap_interface *interface = (tap_interface *)malloc(sizeof(tap_interface));

  if (!interface) {
    return NULL;
  }

  memcpy(interface->mac_address, mac_address, 6);

  // Add interface to lwIP
  ip4_addr_t ipaddr, netmask_addr, gw;
  IP4_ADDR(&ipaddr, ip4[0], ip4[1], ip4[2], ip4[3]);
  IP4_ADDR(&netmask_addr, netmask[0], netmask[1], netmask[2], netmask[3]);
  IP4_ADDR(&gw, 0, 0, 0, 0);  // Assuming none for now

  netif_add(&interface->netif, &ipaddr, &netmask_addr, &gw, interface, tap_interface_init, netif_input);
  netif_set_link_up(&interface->netif);
  netif_set_up(&interface->netif);

  return interface;
}

EXPORT_NAME("inject_tap_interface")
void inject_tap_interface(tap_interface *interface, const uint8_t *frame, u16_t length) {
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

int main() {
  lwip_init();
}