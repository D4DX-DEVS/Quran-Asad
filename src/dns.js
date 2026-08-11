import dns from 'node:dns';

// `mongodb+srv://` needs an SRV lookup, and some home/ISP resolvers refuse SRV
// queries outright (ECONNREFUSED). Set DNS_SERVERS to route those lookups
// somewhere that answers, e.g. DNS_SERVERS=8.8.8.8,1.1.1.1. Unset in
// production, where the platform's resolver handles SRV fine.
if (process.env.DNS_SERVERS) {
  dns.setServers(process.env.DNS_SERVERS.split(',').map((s) => s.trim()));
}
