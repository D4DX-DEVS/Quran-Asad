import dns from 'node:dns';

import { config } from './config.js';

// `mongodb+srv://` needs an SRV lookup, and some home/ISP resolvers refuse SRV
// queries outright (ECONNREFUSED). Set DNS_SERVERS to route those lookups
// somewhere that answers, e.g. DNS_SERVERS=8.8.8.8,1.1.1.1. Unset in
// production, where the platform's resolver handles SRV fine.
if (config.dnsServers.length > 0) {
  dns.setServers(config.dnsServers);
}
