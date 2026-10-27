package app

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

type accountBinding struct {
	AuthUser      int    `json:"authUser"`
	ExpectedEmail string `json:"expectedEmail"`
}

func selectedBinding(bindings []accountBinding) accountBinding {
	if len(bindings) == 0 {
		return accountBinding{}
	}
	return bindings[0]
}
func (b accountBinding) bound() bool { return b.ExpectedEmail != "" }
func (b accountBinding) valid() bool {
	return b.AuthUser >= 0 && b.AuthUser <= 99 && (!b.bound() || (len(b.ExpectedEmail) <= 254 && strings.Count(b.ExpectedEmail, "@") == 1 && !strings.ContainsAny(b.ExpectedEmail, "\r\n\x00")))
}
func bindingPageURL(b accountBinding) string {
	if !b.bound() {
		return "https://gemini.google.com/app"
	}
	return "https://gemini.google.com/u/" + strconv.Itoa(b.AuthUser) + "/app"
}
func bindingEndpoint(endpoint string, b accountBinding) string {
	if !b.bound() && b.AuthUser == 0 {
		return endpoint
	}
	u, err := url.Parse(endpoint)
	if err != nil || u.Scheme != "https" || u.Host != "gemini.google.com" {
		return endpoint
	}
	q := u.Query()
	q.Set("authuser", strconv.Itoa(b.AuthUser))
	u.RawQuery = q.Encode()
	return u.String()
}
func bindingTokenKey(cookie, proxy string, b accountBinding) string {
	sum := sha256.Sum256([]byte(cookie + "\x00" + proxy + "\x00" + strconv.Itoa(b.AuthUser) + "\x00" + b.ExpectedEmail))
	return hex.EncodeToString(sum[:])
}
func bindingEndpointFromHeaders(endpoint string, headers map[string]string) string {
	index, err := strconv.Atoi(headers["X-Goog-AuthUser"])
	if err != nil || index < 0 || index > 99 {
		return endpoint
	}
	return bindingEndpoint(endpoint, accountBinding{AuthUser: index})
}

var selectedEmailPattern = regexp.MustCompile(`"oPEP7c"\s*:\s*("(?:[^"\\]|\\.)*")`)

func validateBindingIdentity(body []byte, b accountBinding) error {
	if !b.valid() {
		return fmt.Errorf("binding_invalid")
	}
	if !b.bound() {
		return nil
	}
	matches := selectedEmailPattern.FindAllSubmatch(body, -1)
	if len(matches) != 1 {
		return fmt.Errorf("binding_identity_unverified")
	}
	var email string
	if json.Unmarshal(matches[0][1], &email) != nil || !strings.EqualFold(email, b.ExpectedEmail) {
		return fmt.Errorf("binding_identity_mismatch")
	}
	return nil
}
