package router

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestTrustedProxyIP(t *testing.T) {
	tests := []struct {
		name           string
		trusted        []string
		remoteAddress  string
		forwardedFor   string
		wantRemoteAddr string
	}{
		{
			name:           "untrusted peer cannot spoof forwarding headers",
			remoteAddress:  "203.0.113.10:54321",
			forwardedFor:   "198.51.100.7",
			wantRemoteAddr: "203.0.113.10:54321",
		},
		{
			name:           "trusted chain resolves first untrusted client",
			trusted:        []string{"10.0.0.0/8"},
			remoteAddress:  "10.0.0.2:54321",
			forwardedFor:   "198.51.100.7, 10.0.0.3",
			wantRemoteAddr: "198.51.100.7",
		},
		{
			name:           "malformed chain safely keeps peer",
			trusted:        []string{"10.0.0.0/8"},
			remoteAddress:  "10.0.0.2:54321",
			forwardedFor:   "not-an-ip",
			wantRemoteAddr: "10.0.0.2:54321",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var gotRemoteAddress string
			handler := trustedProxyIP(test.trusted, nil)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				gotRemoteAddress = r.RemoteAddr
				w.WriteHeader(http.StatusNoContent)
			}))
			request := httptest.NewRequest(http.MethodGet, "/", nil)
			request.RemoteAddr = test.remoteAddress
			request.Header.Set("X-Forwarded-For", test.forwardedFor)

			handler.ServeHTTP(httptest.NewRecorder(), request)

			if gotRemoteAddress != test.wantRemoteAddr {
				t.Fatalf("RemoteAddr = %q, want %q", gotRemoteAddress, test.wantRemoteAddr)
			}
		})
	}
}
