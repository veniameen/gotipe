package config

import (
	"errors"
	"net/netip"
)

// parseTrustedProxies reads TRUSTED_PROXIES entries: IP addresses or CIDR ranges of
// reverse proxies allowed to name the client in X-Forwarded-For / X-Real-IP.
// Trusting every address would let any client pick its own rate-limit bucket.
func parseTrustedProxies(values []string) ([]netip.Prefix, error) {
	var prefixes []netip.Prefix
	for _, value := range values {
		prefix, err := netip.ParsePrefix(value)
		if err != nil {
			addr, addrErr := netip.ParseAddr(value)
			if addrErr != nil || addr.Zone() != "" {
				return nil, errors.New("must list IP addresses or CIDR ranges")
			}
			prefix = netip.PrefixFrom(addr, addr.BitLen())
		}
		if addr := prefix.Addr(); addr.Is4In6() && prefix.Bits() >= 96 {
			prefix = netip.PrefixFrom(addr.Unmap(), prefix.Bits()-96)
		}
		if prefix.Bits() == 0 {
			return nil, errors.New("must not trust every address")
		}
		prefixes = append(prefixes, prefix.Masked())
	}
	return prefixes, nil
}
