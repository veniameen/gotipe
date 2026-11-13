package middleware

import (
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"strings"
)

// ClientAddresses names the client of a request for rate limits, request logs and
// the audit log. X-Forwarded-For and X-Real-IP are honoured only when the socket
// peer is a trusted proxy: any other sender could pick its own address and with it
// its own login rate-limit bucket. The zero value trusts no proxy.
type ClientAddresses struct {
	trusted []netip.Prefix
}

// TrustProxies returns a resolver that accepts forwarded client addresses from peers
// inside the given prefixes (TRUSTED_PROXIES).
func TrustProxies(prefixes []netip.Prefix) ClientAddresses {
	return ClientAddresses{trusted: append([]netip.Prefix(nil), prefixes...)}
}

// Of returns the client IP address. Behind trusted proxies it is the nearest
// untrusted hop of X-Forwarded-For (read right to left), else X-Real-IP. A
// malformed forwarded value falls back to the peer, never to a client choice.
func (c ClientAddresses) Of(r *http.Request) string {
	peer, ok := parseHop(r.RemoteAddr)
	if !ok {
		return peerHost(r.RemoteAddr)
	}
	if !c.trusts(peer) {
		return peer.String()
	}
	if forwarded := r.Header.Values("X-Forwarded-For"); len(forwarded) > 0 {
		if client, ok := c.forwardedClient(forwarded); ok {
			return client.String()
		}
		return peer.String()
	}
	if client, ok := parseHop(r.Header.Get("X-Real-IP")); ok {
		return client.String()
	}
	return peer.String()
}

// LogValue lists the trusted proxy prefixes for the startup log.
func (c ClientAddresses) LogValue() slog.Value {
	if len(c.trusted) == 0 {
		return slog.StringValue("none")
	}
	prefixes := make([]string, len(c.trusted))
	for i, prefix := range c.trusted {
		prefixes[i] = prefix.String()
	}
	return slog.StringValue(strings.Join(prefixes, ","))
}

// ignoresForwarding reports a request that names a client in X-Forwarded-For or
// X-Real-IP although its peer is not a trusted proxy. Behind a reverse proxy this
// is the signature of a TRUSTED_PROXIES that does not match the proxy's address.
func (c ClientAddresses) ignoresForwarding(r *http.Request) bool {
	peer, ok := parseHop(r.RemoteAddr)
	if !ok || c.trusts(peer) {
		return false
	}
	return len(r.Header.Values("X-Forwarded-For")) > 0 || r.Header.Get("X-Real-IP") != ""
}

func (c ClientAddresses) trusts(addr netip.Addr) bool {
	for _, prefix := range c.trusted {
		if prefix.Contains(addr) {
			return true
		}
	}
	return false
}

func (c ClientAddresses) forwardedClient(headers []string) (netip.Addr, bool) {
	var hops []string
	for _, header := range headers {
		hops = append(hops, strings.Split(header, ",")...)
	}
	var origin netip.Addr
	for i := len(hops) - 1; i >= 0; i-- {
		addr, ok := parseHop(hops[i])
		if !ok {
			return netip.Addr{}, false
		}
		if !c.trusts(addr) {
			return addr, true
		}
		origin = addr
	}
	// Every hop is a trusted proxy: the leftmost one originated the request.
	return origin, origin.IsValid()
}

// parseHop accepts an address with or without a port ("192.0.2.1",
// "[2001:db8::1]:443"). IPv4-mapped IPv6 addresses compare as IPv4.
func parseHop(value string) (netip.Addr, bool) {
	value = strings.TrimSpace(value)
	addr, err := netip.ParseAddr(value)
	if err != nil {
		addrPort, portErr := netip.ParseAddrPort(value)
		if portErr != nil {
			return netip.Addr{}, false
		}
		addr = addrPort.Addr()
	}
	if addr.Zone() != "" {
		return netip.Addr{}, false
	}
	return addr.Unmap(), true
}

func peerHost(remoteAddr string) string {
	if host, _, err := net.SplitHostPort(remoteAddr); err == nil {
		return host
	}
	return remoteAddr
}

// rateLimitClient groups IPv6 clients by /64, the block one subscriber is usually
// given, so a client cannot rotate addresses inside its own network to evade a limit.
func rateLimitClient(address string) string {
	addr, err := netip.ParseAddr(address)
	if err != nil || !addr.Is6() {
		return address
	}
	prefix, err := addr.Prefix(64)
	if err != nil {
		return address
	}
	return prefix.String()
}
