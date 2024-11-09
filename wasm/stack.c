#include "lwip/init.h"
#include "lwip/netif.h"
#include "lwip/timeouts.h"
#include "macros.h"

EXPORT("process_queued_packets")
void process_queued_packets() {
  // Loop through each netif and process queued
  // inbound packets (eg. loopback packets)
  struct netif *netif;
  NETIF_FOREACH(netif) {
    netif_poll(netif);
  }
}

EXPORT("process_timeouts")
void process_timeouts() {
  // Check for expired timeouts
  sys_check_timeouts();
}

int main() {
  lwip_init();
}