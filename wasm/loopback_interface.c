#include <stdlib.h>

#include "lwip/netif.h"
#include "macros.h"

typedef struct loopback_interface {
  struct netif netif;
} loopback_interface;

extern void register_loopback_interface(loopback_interface *interface);

EXPORT("create_loopback_interface")
loopback_interface *create_loopback_interface(const uint8_t *ip4, const uint8_t *netmask) {
  loopback_interface *interface = (loopback_interface *)malloc(sizeof(loopback_interface));

  if (!interface) {
    return NULL;
  }

  // Add interface to lwIP
  ip4_addr_t ipaddr, netmask_addr, gw;
  IP4_ADDR(&ipaddr, ip4[0], ip4[1], ip4[2], ip4[3]);
  IP4_ADDR(&netmask_addr, netmask[0], netmask[1], netmask[2], netmask[3]);

  register_loopback_interface(interface);

  netif_add(&interface->netif, &ipaddr, &netmask_addr, NULL, interface, NULL, NULL);
  netif_set_up(&interface->netif);

  return interface;
}
