#ifndef LWIPOPTS_H
#define LWIPOPTS_H

// System and threading options
#define NO_SYS 1                // We are bare-metal/single-threaded
#define SYS_LIGHTWEIGHT_PROT 0  // Disable thread protection (assumes NO_SYS=0)
#define LWIP_SOCKET 0           // Disable socket API (assumes NO_SYS=0)
#define LWIP_NETCONN 0          // Disable Netconn API (assumes NO_SYS=0)
#define LWIP_NETIF_API 0        // Disable network interface API (assumes NO_SYS=0)

// Memory options
#define MEM_LIBC_MALLOC 1      // Use malloc/free from the C library (vs. custom memory pools)
#define PBUF_POOL_SIZE 16      // Number of packet buffers in the pool
#define PBUF_POOL_BUFSIZE 256  // Size of each pbuf in the pool (in bytes)

// Application layer options
#define LWIP_RAW 0  // Disable application layer sending raw packets

// Loopback options
#define LWIP_NETIF_LOOPBACK 1  // Enable loopback logic (applies to every interface)
#define LWIP_HAVE_LOOPIF 0     // Don't add a default loopback interface

// Ethernet options
#define LWIP_ARP 1  // Enable Address Resolution Protocol (ARP)

// IP options
#define LWIP_IPV4 1   // Enable IPv4 support
#define IP_FORWARD 1  // Enable IP forwarding

// Internet Control Message Protocol (ICMP) options
#define LWIP_ICMP 1  // Enable ICMP (ping)

// TCP options
#define LWIP_TCP 1  // Enable TCP functionality

// Checksum options (packet integrity)
#define CHECKSUM_GEN_IP 1      // Generate checksums for IP packets
#define CHECKSUM_GEN_UDP 1     // Generate checksums for UDP packets
#define CHECKSUM_GEN_TCP 1     // Generate checksums for TCP segments
#define CHECKSUM_GEN_ICMP 1    // Generate checksums for ICMP segments
#define CHECKSUM_CHECK_IP 1    // Check checksums for incoming IP packets
#define CHECKSUM_CHECK_UDP 1   // Check checksums for incoming UDP packets
#define CHECKSUM_CHECK_TCP 1   // Check checksums for incoming TCP segments
#define CHECKSUM_CHECK_ICMP 1  // Check checksums for incoming ICMP segments

// Debugging options
#define LWIP_DEBUG 0        // Enable debugging
#define PBUF_DEBUG 0        // Enable debugging for pbufs
#define NETIF_DEBUG 0       // Enable debugging for network interfaces
#define ETHARP_DEBUG 0      // Enable debugging for Ethernet ARP
#define IP_DEBUG 0          // Enable debugging for IP
#define TCP_DEBUG 0         // Enable debugging for TCP
#define TCP_INPUT_DEBUG 0   // Enable debugging for TCP input
#define TCP_OUTPUT_DEBUG 0  // Enable debugging for TCP input

#endif /* LWIPOPTS_H */