package app

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestSharedBindingInstall(t *testing.T) {
	getDB()
	cleanup := func() {
		getDB().Exec(`DELETE FROM accounts WHERE id IN (SELECT account_id FROM jarvis_bindings)`)
		getDB().Exec(`DELETE FROM jarvis_bindings`)
		getDB().Exec(`DELETE FROM jarvis_binding_operations`)
	}
	cleanup()
	t.Cleanup(cleanup)
	bs := []accountBinding{{3, "a@example.com"}, {9, "b@example.com"}}
	var before int
	getDB().QueryRow(`SELECT COUNT(*) FROM accounts`).Scan(&before)
	bad := func(string, accountBinding) error { return errors.New("binding_identity_mismatch") }
	if _, err := installSharedBindings("fixture-op-failed", "SAPISID=sentinel", bs, bad); err == nil {
		t.Fatal("bad session imported")
	}
	var count int
	getDB().QueryRow(`SELECT COUNT(*) FROM accounts`).Scan(&count)
	if count != before {
		t.Fatal("failed validation mutated accounts")
	}
	good := func(string, accountBinding) error { return nil }
	ids, err := installSharedBindings("fixture-op-1", "SAPISID=sentinel", bs, good)
	if err != nil {
		t.Fatal(err)
	}
	again, err := installSharedBindings("fixture-op-1", "SAPISID=sentinel", bs, good)
	if err != nil || ids[0] != again[0] || ids[1] != again[1] {
		t.Fatal("operation replay duplicated rows")
	}
	if _, err := installSharedBindings("fixture-op-1", "SAPISID=changed", bs, good); err == nil {
		t.Fatal("same operation accepted changed credentials")
	}
	if accountByID(ids[0]).Binding.AuthUser != 3 || accountByID(ids[1]).Binding.AuthUser != 9 {
		t.Fatal("binding lost during DB read")
	}
	if _, err = installSharedBindings("fixture-op-2", "SAPISID=new", bs, good); err != nil {
		t.Fatal(err)
	}
	getDB().QueryRow(`SELECT COUNT(*) FROM accounts`).Scan(&count)
	if count != before+2 {
		t.Fatal("reimport created duplicates")
	}
	legacy, _ := accountAdd("legacy", "SAPISID=legacy", "")
	t.Cleanup(func() { accountDelete(legacy) })
	for i := 0; i < 4; i++ {
		a, ok := pickCookieAccount()
		if !ok || !a.Binding.bound() {
			t.Fatal("unbound account selected")
		}
	}
	updateAccountCookie(ids[0], "SAPISID=new; SIDCC=rotated")
	if accountByID(ids[1]).Cookie != "SAPISID=new; SIDCC=rotated" {
		t.Fatal("shared rotation not synchronized")
	}
	if _, err := installSharedBindings("fixture-op-2", "SAPISID=new", bs, good); err != nil {
		t.Fatal(err)
	}
	if accountByID(ids[0]).Cookie != "SAPISID=new; SIDCC=rotated" {
		t.Fatal("replayed import reverted rotated session")
	}
	getDB().Exec(`UPDATE accounts SET status='disabled',fail_count=1 WHERE id=?`, ids[0])
	if primaryBindingID() != ids[1] {
		t.Fatal("disabled primary prevented enabled sibling refresh")
	}
	if rotationAccountID(*accountByID(ids[1])) != ids[0] {
		t.Fatal("enabled representative change reset shared rotation timer")
	}
	if _, err := installSharedBindings("fixture-op-3", "SAPISID=new", bs, good); err != nil {
		t.Fatal(err)
	}
	if accountByID(ids[0]).Status != "disabled" {
		t.Fatal("reimport enabled manually disabled account")
	}
	getDB().Exec(`UPDATE accounts SET status='disabled' WHERE id=?`, ids[1])
	if _, err := streamGenerate("private-sentinel", "private-sentinel", Models["gemini-3.1-pro"], nil, nil); err == nil || !strings.Contains(err.Error(), "binding_no_eligible_account") {
		t.Fatal("missing bound account permitted content fallback")
	}
}

type bindingRoundTripper func(*http.Request) (*http.Response, error)

func (f bindingRoundTripper) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestBindingFreshIdentityPreflight(t *testing.T) {
	proxy := "http://binding-fixture.invalid:1234"
	calls := 0
	client := &http.Client{Transport: bindingRoundTripper(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.Method != "GET" || r.URL.String() != "https://gemini.google.com/u/3/app" {
			t.Fatal("preflight sent content or wrong selector")
		}
		body := `<script>WIZ_global_data={"oPEP7c":"wrong@example.com","SNlM0e":"token-sentinel-12345"};</script>`
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})}
	stdlibClientCache.Store(proxy, client)
	t.Cleanup(func() { stdlibClientCache.Delete(proxy) })
	b := accountBinding{3, "a@example.com"}
	xsrfMu.Lock()
	xsrfCache[bindingTokenKey("SAPISID=fixture", proxy, b)] = xsrfEntry{token: "cached-token", fetched: time.Now()}
	xsrfMu.Unlock()
	if _, err := getXSRF("SAPISID=fixture", proxy, b); err == nil || err.Error() != "binding_identity_mismatch" {
		t.Fatal("cached token bypassed identity mismatch")
	}
	if calls != 1 {
		t.Fatal("fresh selected identity not fetched")
	}
}

func TestBindingHTTPBoundary(t *testing.T) {
	oldKey := getAPIKey()
	apiKeyRuntime.Store("fixture-api-key")
	t.Cleanup(func() { apiKeyRuntime.Store(oldKey) })
	cases := []struct {
		name, remote, origin, key, body string
		want                            int
	}{
		{"remote", "192.0.2.1:99", "", "fixture-api-key", "{}", 403},
		{"cross origin", "127.0.0.1:99", "https://example.com", "fixture-api-key", "{}", 403},
		{"missing key", "127.0.0.1:99", "", "", "{}", 401},
		{"trailing JSON", "127.0.0.1:99", "", "fixture-api-key", "{} {}", 400},
		{"unknown field", "127.0.0.1:99", "", "fixture-api-key", `{"unexpected":"secret-sentinel"}`, 400},
		{"oversize", "127.0.0.1:99", "", "fixture-api-key", strings.Repeat("x", 49153), 413},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:20831/admin/api/jarvis/session", strings.NewReader(c.body))
			r.RemoteAddr = c.remote
			r.Header.Set("Origin", c.origin)
			r.Header.Set("Authorization", "Bearer "+c.key)
			r.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			handleJarvisBindings(w, r)
			if w.Code != c.want {
				t.Fatalf("status %d want %d", w.Code, c.want)
			}
			if strings.Contains(w.Body.String(), "secret-sentinel") || strings.Contains(w.Body.String(), "fixture-api-key") {
				t.Fatal("secret reflected")
			}
		})
	}
}

func TestBindingSessionMutationWaitsForContent(t *testing.T) {
	entered, release, finished := make(chan struct{}), make(chan struct{}), make(chan struct{})
	go func() {
		releaseSession := holdBindingSession()
		close(entered)
		<-release
		releaseSession()
		close(finished)
	}()
	<-entered
	if bindingSessionMu.TryLock() {
		bindingSessionMu.Unlock()
		close(release)
		t.Fatal("mutation allowed during content request")
	}
	close(release)
	select {
	case <-finished:
	case <-time.After(time.Second):
		t.Fatal("request did not release session lock")
	}
	if !bindingSessionMu.TryLock() {
		t.Fatal("mutation still locked after content request")
	}
	bindingSessionMu.Unlock()
}

func TestBindingHeadersAndInvalidation(t *testing.T) {
	h := buildGeminiHeaders("SAPISID=fixture", "fixture", "model", accountBinding{3, "a@example.com"})
	if h["X-Goog-AuthUser"] != "3" || h["Referer"] != "https://gemini.google.com/u/3/app" {
		t.Fatal("wrong account headers")
	}
	if !strings.Contains(bindingEndpointFromHeaders("https://gemini.google.com/rpc?rt=c", h), "authuser=3") {
		t.Fatal("RPC missing selector")
	}
	xsrfMu.Lock()
	xsrfCache[bindingTokenKey("SAPISID=fixture", "proxy", accountBinding{3, "a@example.com"})] = xsrfEntry{token: "fixture", fetched: time.Now()}
	xsrfMu.Unlock()
	invalidateXSRF("SAPISID=fixture")
	xsrfMu.Lock()
	remaining := len(xsrfCache)
	xsrfMu.Unlock()
	if remaining != 0 {
		t.Fatal("invalidated token remained cached")
	}
}
