package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestArgonContextBudgetUsesConfiguredUTF8Bytes(t *testing.T) {
	rtMu.Lock()
	old := rtVal
	rtVal.MaxPromptBytes = 128000
	rtMu.Unlock()
	t.Cleanup(func() { rtMu.Lock(); rtVal = old; rtMu.Unlock() })
	for _, name := range []string{"gemini-4-argon", "gemini-4-argon-thinking-medium", "gemini-4-argon-thinking"} {
		if err := checkArgonContext(strings.Repeat("x", 128000), Models[name]); err != nil {
			t.Fatal("boundary rejected")
		}
		if err := checkArgonContext(strings.Repeat("x", 128001), Models[name]); err == nil {
			t.Fatal("oversized context allowed attachment fallback")
		}
		if err := checkArgonContext(strings.Repeat("\u1ebf", 43000), Models[name]); err == nil {
			t.Fatal("counted characters rather than UTF8 bytes")
		}
	}
	if err := checkArgonContext(strings.Repeat("x", 128001), Models["gemini-3.1-pro"]); err != nil {
		t.Fatal("unrelated model behavior changed")
	}
}

func TestArgonLongContextIs400BeforeStreamingOrUpstream(t *testing.T) {
	getDB()
	withPoolCookie(t)
	rtMu.Lock()
	old := rtVal
	rtVal.MaxPromptBytes = 128000
	rtMu.Unlock()
	t.Cleanup(func() { rtMu.Lock(); rtVal = old; rtMu.Unlock() })
	for _, stream := range []bool{false, true} {
		for _, endpoint := range []string{"chat", "responses"} {
			body := map[string]interface{}{"model": "gemini-4-argon-thinking", "stream": stream}
			if endpoint == "chat" {
				body["messages"] = []map[string]interface{}{{"role": "user", "content": strings.Repeat("x", 347351)}}
			} else {
				body["input"] = strings.Repeat("x", 347351)
			}
			encoded, _ := json.Marshal(body)
			r := httptest.NewRequest("POST", "http://localhost/v1/"+endpoint, strings.NewReader(string(encoded)))
			w := httptest.NewRecorder()
			if endpoint == "chat" {
				handleChatCompletions(w, r)
			} else {
				handleResponses(w, r)
			}
			if w.Code != 400 || !strings.Contains(w.Body.String(), `"context_length_exceeded"`) || strings.Contains(w.Body.String(), "data:") {
				t.Fatalf("%s stream%v: expected preflight400, got %d", endpoint, stream, w.Code)
			}
			if strings.Contains(w.Body.String(), strings.Repeat("x", 100)) {
				t.Fatal("input leaked in error")
			}
		}
	}
}

func TestArgonContextPreflightRunsBeforeAttachmentFetch(t *testing.T) {
	getDB()
	withPoolCookie(t)
	rtMu.Lock()
	old := rtVal
	rtVal.MaxPromptBytes = 128000
	rtMu.Unlock()
	t.Cleanup(func() { rtMu.Lock(); rtVal = old; rtMu.Unlock() })
	hits := 0
	source := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		w.Header().Set("Content-Type", "image/png")
		w.Write([]byte("not-an-image"))
	}))
	defer source.Close()
	body := map[string]interface{}{"model": "gemini-4-argon-thinking", "messages": []map[string]interface{}{{"role": "user", "content": []map[string]interface{}{{"type": "text", "text": strings.Repeat("x", 347351)}, {"type": "image_url", "image_url": map[string]interface{}{"url": source.URL + "/image.png"}}}}}}
	encoded, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	handleChatCompletions(w, httptest.NewRequest("POST", "http://localhost/v1/chat/completions", strings.NewReader(string(encoded))))
	if hits != 0 || !strings.Contains(w.Body.String(), `"context_length_exceeded"`) {
		t.Fatal("attachment processed before context preflight")
	}
}
