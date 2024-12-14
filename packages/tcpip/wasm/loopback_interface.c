#include <stdlib.h>

#include "lwip/ip.h"
#include "lwip/netif.h"
#include "macros.h"

typedef struct loopback_interface {
  struct netif netif;
} loopback_interface;

extern void register_loopback_interface(loopback_interface *interface);

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
loopback_interface *create_loopback_interface(const uint8_t *ip4, const uint8_t *netmask) {
  loopback_interface *interface = (loopback_interface *)malloc(sizeof(loopback_interface));

  if (!interface) {
    return NULL;
  }

  ip4_addr_t ipaddr, netmask_addr;
  IP4_ADDR(&ipaddr, ip4[0], ip4[1], ip4[2], ip4[3]);
  IP4_ADDR(&netmask_addr, netmask[0], netmask[1], netmask[2], netmask[3]);

  register_loopback_interface(interface);

  netif_add(&interface->netif, &ipaddr, &netmask_addr, NULL, interface, netif_loopif_init, ip_input);

  netif_set_up(&interface->netif);

  return interface;
}

EXPORT("remove_loopback_interface")
void remove_loopback_interface(loopback_interface *interface) {
  netif_remove(&interface->netif);
  free(interface);
}