#ifndef LWIPOPTS_H
#define LWIPOPTS_H

// System and threading options
#define NO_SYS 1                // We are bare-metal/single-threaded
#define SYS_LIGHTWEIGHT_PROT 0  // Disable thread protection (assumes NO_SYS=0)
#define LWIP_SOCKET 0           // Disable socket API (assumes NO_SYS=0)
#define LWIP_NETCONN 0          // Disable Netconn API (assumes NO_SYS=0)
#define LWIP_NETIF_API 0        // Disable network interface API (assumes NO_SYS=0)

// Constants used for calculations
#define TCP_HEADER_LEN 20  // Minimum length of a TCP header (in bytes)
#define IP_HEADER_LEN 20   // Minimum length of an IP header (in bytes)
#define ETH_HEADER_LEN 14  // Minimum length of an Ethernet header (in bytes)
#define TYPICAL_PACKET_SIZE (TCP_MSS + TCP_HEADER_LEN + IP_HEADER_LEN + ETH_HEADER_LEN)

// Memory options
#define MEM_LIBC_MALLOC 1                        // Use malloc/free from the C library (vs. custom memory pools)
#define PBUF_POOL_SIZE 16                        // Number of packet buffers in the pool
#define PBUF_POOL_BUFSIZE TYPICAL_PACKET_SIZE    // Size of each pbuf in the pool (in bytes)
#define MEMP_NUM_TCP_SEG (2 * TCP_SND_QUEUELEN)  // Number of TCP segments in the pool
#define MEMP_NUM_PBUF (2 * MEMP_NUM_TCP_SEG)     // Number of pbufs in the pool

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
#define LWIP_TCP 1                                    // Enable TCP functionality
#define TCP_MSS 1460                                  // Maximum segment size
#define TCP_WND (4 * TCP_MSS)                         // TCP window size
#define TCP_SND_BUF (4 * TCP_MSS)                     // TCP send buffer size
#define TCP_SND_QUEUELEN (2 * TCP_SND_BUF / TCP_MSS)  // TCP send queue length

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
// #define LWIP_DEBUG 1                  // Enable debugging
#define PBUF_DEBUG LWIP_DBG_ON        // Enable debugging for pbufs
#define MEMP_DEBUG LWIP_DBG_ON        // Enable debugging for memory pools
#define NETIF_DEBUG LWIP_DBG_ON       // Enable debugging for network interfaces
#define ETHARP_DEBUG LWIP_DBG_ON      // Enable debugging for Ethernet ARP
#define IP_DEBUG LWIP_DBG_ON          // Enable debugging for IP
#define TCP_DEBUG LWIP_DBG_ON         // Enable debugging for TCP
#define TCP_INPUT_DEBUG LWIP_DBG_ON   // Enable debugging for TCP input
#define TCP_OUTPUT_DEBUG LWIP_DBG_ON  // Enable debugging for TCP input

#endif /* LWIPOPTS_H */