#include "lwip/netif.h"
#include "macros.h"

EXPORT("get_interface_mac_address")
uint8_t *get_interface_mac_address(struct netif *netif) {
  return (uint8_t *)&netif->hwaddr;
}

EXPORT("get_interface_ip4_address")
uint8_t *get_interface_ip4_address(struct netif *netif) {
  if (!IP_IS_V4(&netif->ip_addr)) {
    return NULL;
  }
  return (uint8_t *)&ip_2_ip4(&netif->ip_addr)->addr;
}

EXPORT("get_interface_ip4_netmask")
uint8_t *get_interface_ip4_netmask(struct netif *netif) {
  if (!IP_IS_V4(&netif->netmask)) {
    return NULL;
  }
  return (uint8_t *)&ip_2_ip4(&netif->netmask)->addr;
}
