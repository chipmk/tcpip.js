#ifndef LWIPOPTS_H
#define LWIPOPTS_H

#define NO_SYS 1
#define SYS_LIGHTWEIGHT_PROT 0

#define LWIP_NETIF_LOOPBACK 1
#define LWIP_HAVE_LOOPIF 1

#define LWIP_ARP 1

#define IP_FORWARD 1

#define LWIP_IPV4 1
#define LWIP_ICMP 1

#define LWIP_SOCKET 0
#define LWIP_NETCONN 0
#define LWIP_NETIF_API 0

#define LWIP_TCP 1

#endif /* LWIPOPTS_H */