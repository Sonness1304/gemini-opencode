package app

import (
	"strings"
	"testing"
)

func TestBindingIdentity(t *testing.T) {
	b := accountBinding{AuthUser: 3, ExpectedEmail: "a@example.com"}
	for _, body := range []string{`{"oPEP7c":"other@example.com"}`, `{"accounts":["a@example.com"]}`, `{"oPEP7c":"a@example.com","oPEP7c":"other@example.com"}`} {
		if validateBindingIdentity([]byte(body), b) == nil {
			t.Fatal("wrong, missing or ambiguous selected identity accepted")
		}
	}
	if err := validateBindingIdentity([]byte(`{"oPEP7c":"a@example.com"}`), b); err != nil {
		t.Fatal(err)
	}
	if err := validateBindingIdentity([]byte(`{"oPEP7c":"a@example.com"}`), accountBinding{AuthUser: -1, ExpectedEmail: "a@example.com"}); err == nil {
		t.Fatal("invalid index accepted")
	}
}

func TestBindingTargetsAndCache(t *testing.T) {
	a := accountBinding{AuthUser: 3, ExpectedEmail: "a@example.com"}
	b := accountBinding{AuthUser: 9, ExpectedEmail: "b@example.com"}
	if bindingPageURL(a) != "https://gemini.google.com/u/3/app" {
		t.Fatal("wrong selected page")
	}
	if bindingEndpoint("https://gemini.google.com/_/BardChatUi/data/batchexecute?x=1", b) != "https://gemini.google.com/_/BardChatUi/data/batchexecute?authuser=9&x=1" {
		t.Fatal("missing RPC selector")
	}
	if bindingTokenKey("SID=SECRET", "", a) == bindingTokenKey("SID=SECRET", "", b) {
		t.Fatal("shared jar mixes tokens")
	}
	if bindingTokenKey("SID=SECRET", "proxy", a) == bindingTokenKey("SID=SECRET", "", a) {
		t.Fatal("egress mixes tokens")
	}
	if strings.Contains(bindingTokenKey("SID=SECRET", "", a), "SECRET") {
		t.Fatal("cache key leaks credential")
	}
	if bindingPageURL(accountBinding{}) != "https://gemini.google.com/app" {
		t.Fatal("legacy page changed")
	}
}
