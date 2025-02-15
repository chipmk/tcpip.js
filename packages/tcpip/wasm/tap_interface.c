#include <stdlib.h>
#include <string.h>

#include "lwip/netif.h"
#include "macros.h"
#include "netif/etharp.h"

extern void register_tap_interface(struct netif *netif);
extern void receive_frame(struct netif *netif, const uint8_t *frame, uint16_t length);

err_t tap_interface_output(struct netif *netif, struct pbuf *p) {
  receive_frame(netif, (uint8_t *)p->payload, p->tot_len);
  return 0;
}

static err_t tap_interface_init(struct netif *netif) {
  // Set interface flags
  netif->flags = NETIF_FLAG_BROADCAST | NETIF_FLAG_ETHARP | NETIF_FLAG_ETHERNET;

  // Wrap outgoing IP packets in Ethernet frames (MACs resolved via ARP)
  netif->output = etharp_output;

  // Setup callback for outgoing Ethernet frames
  netif->linkoutput = tap_interface_output;

  return ERR_OK;
}

EXPORT("create_tap_interface")
struct netif *create_tap_interface(const uint8_t mac_address[6], const uint8_t ip4[4], const uint8_t netmask[4]) {
  struct netif *netif = (struct netif *)malloc(sizeof(struct netif));

  if (!netif) {
    return NULL;
  }

  // Set MAC address
  memcpy(netif->hwaddr, mac_address, 6);
  netif->hwaddr_len = 6;

  // Set MTU
  // TODO: Make this configurable
  netif->mtu = 1500;

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

  register_tap_interface(netif);

  netif_add(netif, ip4_addr, netmask_addr, NULL, NULL, tap_interface_init, netif_input);
  netif_set_link_up(netif);
  netif_set_up(netif);

  return netif;
}

EXPORT("remove_tap_interface")
void remove_tap_interface(struct netif *netif) {
  netif_remove(netif);
  free(netif);
}

EXPORT("send_tap_interface")
err_t send_tap_interface(struct netif *netif, const uint8_t *frame, uint16_t length) {
  // Allocate a pbuf with PBUF_REF, pointing to frame buffer data
  struct pbuf *p = pbuf_alloc(PBUF_RAW, length, PBUF_REF);

  if (p == NULL) {
    return ERR_MEM;
  }

  p->payload = (void *)frame;

  err_t err = netif->input(p, netif);

  // Pass the pbuf to lwIP for processing
  if (err != ERR_OK) {
    pbuf_free(p);
  }

  return err;
}
