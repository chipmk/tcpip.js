#include <stdlib.h>
#include <string.h>

#include "lwip/netif.h"
#include "macros.h"
#include "netif/bridgeif.h"

EXPORT("create_bridge_interface")
struct netif *create_bridge_interface(const uint8_t mac_address[6], const uint8_t ip4[4], const uint8_t netmask[4], struct netif *ports[], uint8_t ports_num) {
  struct netif *netif = (struct netif *)malloc(sizeof(struct netif));

  if (!netif) {
    return NULL;
  }

  ip4_addr_t *ipaddr = NULL;
  ip4_addr_t *netmask_addr = NULL;

  if (ip4) {
    ipaddr = malloc(sizeof(ip4_addr_t));
    IP4_ADDR(ipaddr, ip4[0], ip4[1], ip4[2], ip4[3]);
  }

  if (netmask) {
    netmask_addr = malloc(sizeof(ip4_addr_t));
    IP4_ADDR(netmask_addr, netmask[0], netmask[1], netmask[2], netmask[3]);
  }

  bridgeif_initdata_t bridge_init = BRIDGEIF_INITDATA2(
      ports_num,
      1024,
      16,
      mac_address[0],
      mac_address[1],
      mac_address[2],
      mac_address[3],
      mac_address[4],
      mac_address[5]);

  netif_add(netif,
            ipaddr,
            netmask_addr,
            NULL,
            &bridge_init,
            bridgeif_init,
            netif_input);

  netif_set_link_up(netif);
  netif_set_up(netif);

  for (uint8_t i = 0; i < ports_num; i++) {
    bridgeif_add_port(netif, ports[i]);
  }

  return netif;
}

EXPORT("remove_bridge_interface")
void remove_bridge_interface(struct netif *netif) {
  netif_remove(netif);
  free(netif);
}
