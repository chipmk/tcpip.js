#include <stdlib.h>

#include "lwip/ip.h"
#include "lwip/netif.h"
#include "macros.h"

extern void register_loopback_interface(struct netif *interface);

static err_t netif_loop_output_ipv4(struct netif *netif, struct pbuf *p, const ip4_addr_t *addr) {
  LWIP_UNUSED_ARG(addr);
  return netif_loop_output(netif, p);
}

static err_t netif_loopif_init(struct netif *netif) {
  netif->name[0] = 'l';
  netif->name[1] = 'o';
  netif->output = netif_loop_output_ipv4;
  NETIF_SET_CHECKSUM_CTRL(netif, NETIF_CHECKSUM_DISABLE_ALL);
  return ERR_OK;
}

EXPORT("create_loopback_interface")
struct netif *create_loopback_interface(const uint8_t ip4[4], const uint8_t netmask[4]) {
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

  register_loopback_interface(netif);

  netif_add(netif, ip4_addr, netmask_addr, NULL, NULL, netif_loopif_init, ip_input);

  netif_set_link_up(netif);
  netif_set_up(netif);

  return netif;
}

EXPORT("remove_loopback_interface")
void remove_loopback_interface(struct netif *netif) {
  netif_remove(netif);
  free(netif);
}