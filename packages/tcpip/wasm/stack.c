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

// Initialize the lwIP stack
//
// We compile as a WASI reactor module (ie. a lib) which has no main() function
// Instead we set up a constructor function which is called when the module is loaded
//
// Under the hood, reactor modules call _initialize() as the entry point which
// wasi-libc implements, and in turn calls __wasm_call_ctors() to run constructors
// See https://github.com/WebAssembly/wasi-libc/blob/main/libc-bottom-half/crt/crt1-reactor.c
__attribute__((constructor)) void initialize() {
  lwip_init();
}