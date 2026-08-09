package router

import (
	"log"
	"net"
	"net/http"
	"net/netip"
	"strings"
)

func trustedProxyIP(rawPrefixes []string, logger *log.Logger) func(http.Handler) http.Handler {
	prefixes := make([]netip.Prefix, 0, len(rawPrefixes))
	for _, raw := range rawPrefixes {
		prefix, err := parsePrefix(raw)
		if err != nil {
			if logger != nil {
				logger.Printf("ignoring invalid trusted proxy %q: %v", raw, err)
			}
			continue
		}
		prefixes = append(prefixes, prefix)
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			peer, ok := parseAddress(r.RemoteAddr)
			if ok && addressInPrefixes(peer, prefixes) {
				if forwarded := forwardedClientIP(r, prefixes); forwarded.IsValid() {
					r.RemoteAddr = forwarded.String()
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

func forwardedClientIP(r *http.Request, trusted []netip.Prefix) netip.Addr {
	values := r.Header.Values("X-Forwarded-For")
	var leftmost netip.Addr
	for valueIndex := len(values) - 1; valueIndex >= 0; valueIndex-- {
		parts := strings.Split(values[valueIndex], ",")
		for partIndex := len(parts) - 1; partIndex >= 0; partIndex-- {
			address, err := netip.ParseAddr(strings.TrimSpace(parts[partIndex]))
			if err != nil {
				return netip.Addr{}
			}
			address = address.Unmap()
			leftmost = address
			if !addressInPrefixes(address, trusted) {
				return address
			}
		}
	}
	if leftmost.IsValid() {
		return leftmost
	}

	address, err := netip.ParseAddr(strings.TrimSpace(r.Header.Get("X-Real-IP")))
	if err != nil {
		return netip.Addr{}
	}
	return address.Unmap()
}

func parsePrefix(raw string) (netip.Prefix, error) {
	raw = strings.TrimSpace(raw)
	if prefix, err := netip.ParsePrefix(raw); err == nil {
		return prefix.Masked(), nil
	}
	address, err := netip.ParseAddr(raw)
	if err != nil {
		return netip.Prefix{}, err
	}
	address = address.Unmap()
	return netip.PrefixFrom(address, address.BitLen()), nil
}

func parseAddress(remoteAddress string) (netip.Addr, bool) {
	host := clientAddress(remoteAddress)
	address, err := netip.ParseAddr(host)
	if err != nil {
		return netip.Addr{}, false
	}
	return address.Unmap(), true
}

func clientAddress(remoteAddress string) string {
	host, _, err := net.SplitHostPort(remoteAddress)
	if err == nil {
		return host
	}
	return strings.Trim(remoteAddress, "[]")
}

func addressInPrefixes(address netip.Addr, prefixes []netip.Prefix) bool {
	for _, prefix := range prefixes {
		if prefix.Contains(address) {
			return true
		}
	}
	return false
}
