package app

import (
	"encoding/json"
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	fhttp "github.com/bogdanfinn/fhttp"
	tls_client "github.com/bogdanfinn/tls-client"
)

func bridgeTestTools() []map[string]interface{} {
	return []map[string]interface{}{{"type": "function", "function": map[string]interface{}{"name": "binding_probe", "parameters": map[string]interface{}{"type": "object", "required": []interface{}{"tag"}, "properties": map[string]interface{}{"tag": map[string]interface{}{"type": "string"}}}}}}
}

func TestActionBridgePromptScope(t *testing.T) {
	tools := bridgeTestTools()
	messages := []map[string]interface{}{{"role": "user", "content": "Read the requested value"}}
	high := Models["gemini-4-argon-thinking"]
	prompt, latest := messagesToModelPrompt(messages, tools, "auto", high)
	if !strings.Contains(prompt, "next_action") || !strings.Contains(prompt, "binding_probe") || strings.Contains(prompt, "highest priority") || strings.Contains(prompt, "```tool_call") {
		t.Fatal("High still uses the native-tool impersonation prompt")
	}
	if latest != "Read the requested value" {
		t.Fatal("latest request changed")
	}
	for _, model := range []string{"gemini-3.1-pro", "gemini-4-argon-thinking-medium"} {
		got, _ := messagesToModelPrompt(messages, tools, "auto", Models[model])
		want, _ := messagesToPrompt(messages, tools, "auto")
		if got != want {
			t.Fatal("unrelated model prompt changed")
		}
	}
}

func TestActionBridgeDoesNotDuplicateMediaInText(t *testing.T) {
	messages := []map[string]interface{}{
		{"role": "user", "content": []interface{}{map[string]interface{}{"type": "text", "text": "Inspect attachment"}, map[string]interface{}{"type": "image_url", "image_url": map[string]interface{}{"url": "data:image/png;base64,private-media-sentinel"}}}},
		{"role": "tool", "tool_call_id": "call_media", "content": "result-after-image"},
	}
	prompt, _ := messagesToModelPrompt(messages, bridgeTestTools(), "auto", Models["gemini-4-argon-thinking"])
	if strings.Contains(prompt, "private-media-sentinel") || !strings.Contains(prompt, "Inspect attachment") || !strings.Contains(prompt, "result-after-image") || !strings.Contains(prompt, "call_media") {
		t.Fatal("media payload duplicated or later result lost")
	}
	if _, ok := messages[0]["content"].([]interface{}); !ok {
		t.Fatal("original multimodal message mutated")
	}
}

func TestActionBridgeNullableRequiredAndFlatChoice(t *testing.T) {
	tools := bridgeTestTools()
	fn := tools[0]["function"].(map[string]interface{})
	schema := fn["parameters"].(map[string]interface{})
	schema["properties"].(map[string]interface{})["tag"] = map[string]interface{}{"type": []interface{}{"string", "null"}}
	if _, calls, err := parseActionReply(`{"next_action":{"name":"binding_probe","arguments":{"tag":null}},"final_answer":null}`, tools, "required"); err != nil || len(calls) != 1 {
		t.Fatal("valid required nullable field rejected")
	}
	forced := map[string]interface{}{"type": "function", "name": "not_declared"}
	if _, _, err := parseActionReply(`{"next_action":{"name":"binding_probe","arguments":{"tag":"JARVIS"}},"final_answer":null}`, tools, forced); err == nil {
		t.Fatal("Responses forced name ignored")
	}
}

func TestActionBridgeRoundTrip(t *testing.T) {
	tools := bridgeTestTools()
	text, calls, err := parseActionReply(`{"next_action":{"name":"binding_probe","arguments":{"tag":"JARVIS"}},"final_answer":null}`, tools, "required")
	if err != nil || text != "" || len(calls) != 1 || calls[0].Function.Name != "binding_probe" || calls[0].ID == "" || calls[0].Function.Arguments != `{"tag":"JARVIS"}` {
		t.Fatalf("not a valid client function call: %v", err)
	}
	text, calls, err = parseActionReply("```json\n{\"next_action\":null,\"final_answer\":\"NONCE_1259\"}\n```", tools, "auto")
	if err != nil || text != "NONCE_1259" || len(calls) != 0 {
		t.Fatal("tool result did not terminate")
	}
}

func TestActionBridgeRejectsInvalidAction(t *testing.T) {
	tools := bridgeTestTools()
	for _, body := range []string{
		`I cannot use this tool.`,
		`{"next_action":{"name":"other","arguments":{"tag":"JARVIS"}},"final_answer":null}`,
		`{"next_action":{"name":"binding_probe","arguments":{}},"final_answer":null}`,
		`{"next_action":{"name":"binding_probe","arguments":{"tag":3}},"final_answer":null}`,
		`{"next_action":{"name":"binding_probe","arguments":"{}"},"final_answer":null}`,
		`{"next_action":{"name":"binding_probe","arguments":{"tag":"JARVIS"}},"final_answer":"done"}`,
		`{"next_action":null,"final_answer":"done","extra":1}`,
		`{"next_action":null,"next_action":null,"final_answer":"done"}`,
		`{"next_action":{"name":"binding_probe","name":"other","arguments":{"tag":"JARVIS"}},"final_answer":null}`,
		`{"next_action":null,"final_answer":"done"} {}`,
	} {
		if _, _, err := parseActionReply(body, tools, "required"); err == nil {
			t.Fatalf("accepted invalid protocol: %s", body)
		}
	}
	valid := `{"next_action":{"name":"binding_probe","arguments":{"tag":"JARVIS"}},"final_answer":null}`
	if _, _, err := parseActionReply(valid, tools, "none"); err == nil {
		t.Fatal("none accepted an action")
	}
	forced := map[string]interface{}{"type": "function", "function": map[string]interface{}{"name": "not_declared"}}
	if _, _, err := parseActionReply(valid, tools, forced); err == nil {
		t.Fatal("forced selection ignored")
	}
}

func TestActionBridgeFailureReasonDoesNotExposeContent(t *testing.T) {
	_, _, err := parseActionReply(`private-sentinel invalid`, bridgeTestTools(), "auto")
	if err == nil || err.Error() != "tool_bridge_invalid_reply:envelope_json" || strings.Contains(err.Error(), "private-sentinel") {
		t.Fatalf("missing bounded parser diagnosis: %v", err)
	}
}

func TestActionBridgeDiagnosticsKeepDuplicateNameSelection(t *testing.T) {
	tools := bridgeTestTools()
	other := bridgeTestTools()[0]
	other["function"].(map[string]interface{})["parameters"].(map[string]interface{})["required"] = []interface{}{"other"}
	tools = append([]map[string]interface{}{other}, tools...)
	_, calls, err := parseActionReply(`{"next_action":{"name":"binding_probe","arguments":{"tag":"JARVIS"}},"final_answer":null}`, tools, "auto")
	if err != nil || len(calls) != 1 {
		t.Fatal("diagnosis changed selection of an existing valid schema")
	}
}

func TestActionBridgeProtocolHasNoConflictingKeyInstruction(t *testing.T) {
	prompt, _ := messagesToModelPrompt([]map[string]interface{}{{"role": "user", "content": "markdown answer"}}, bridgeTestTools(), "none", Models["gemini-4-argon-thinking"])
	if strings.Contains(prompt, "Do not output both.") || !strings.Contains(prompt, "Always include both keys") || !strings.Contains(prompt, "unused value must be null") {
		t.Fatal("envelope instruction still conflicts with the required keys")
	}
}

func TestActionBridgeAcceptsOnlyWholeJSONFence(t *testing.T) {
	body := `{"next_action":{"name":"binding_probe","arguments":{"tag":"JARVIS"}},"final_answer":null}`
	for _, wrapped := range []string{"```JSON\r\n" + body + "\r\n```", "```json \n" + body + "\n```", "```\n" + body + "\n```"} {
		if _, calls, err := parseActionReply(wrapped, bridgeTestTools(), "required"); err != nil || len(calls) != 1 {
			t.Fatal("valid fenced JSON rejected")
		}
	}
	for _, wrapped := range []string{"prose\n```json\n" + body + "\n```", "```javascript\n" + body + "\n```", "```json\n" + body + "\n```\nextra"} {
		if _, _, err := parseActionReply(wrapped, bridgeTestTools(), "auto"); err == nil {
			t.Fatal("accepted ambiguous prose or non-JSON fence")
		}
	}
}

func TestActionBridgeRejectsExplicitModelDowngrade(t *testing.T) {
	high := Models["gemini-4-argon-thinking"]
	for _, name := range []string{"4 Argon High", " 4  Argon High ", ""} {
		if err := checkActionModel(high, bridgeTestTools(), name); err != nil {
			t.Fatal("valid family or unreported model changed behavior")
		}
	}
	if err := checkActionModel(high, bridgeTestTools(), "3.5 Flash-Lite private-sentinel"); err == nil || err.Error() != "model_downgraded" {
		t.Fatal("explicit downgrade accepted or model text leaked")
	}
	for _, name := range []string{"gemini-3.1-pro", "gemini-4-argon-thinking-medium"} {
		if err := checkActionModel(Models[name], bridgeTestTools(), "3.5 Flash-Lite"); err != nil {
			t.Fatal("unrelated model behavior changed")
		}
	}
}

type bridgeFixtureClient struct {
	tls_client.HttpClient
	raw string
}

func (c bridgeFixtureClient) Do(r *fhttp.Request) (*fhttp.Response, error) {
	body := `{"SNlM0e":"token-sentinel-123456789"}`
	if r.Method == "POST" {
		body = c.raw
	}
	return &fhttp.Response{StatusCode: 200, Header: make(fhttp.Header), Body: io.NopCloser(strings.NewReader(body))}, nil
}

func TestActionBridgeStreamingQuarantinesUnverifiedReasoning(t *testing.T) {
	getDB()
	withPoolCookie(t)
	rtMu.Lock()
	old := rtVal
	rtVal.RetryAttempts = 1
	rtMu.Unlock()
	t.Cleanup(func() { rtMu.Lock(); rtVal = old; rtMu.Unlock() })
	imp := effectiveImpersonate()
	clientCacheMu.Lock()
	previous, existed := clientCache[imp]
	clientCacheMu.Unlock()
	t.Cleanup(func() {
		clientCacheMu.Lock()
		defer clientCacheMu.Unlock()
		if existed {
			clientCache[imp] = previous
		} else {
			delete(clientCache, imp)
		}
	})
	for _, model := range []string{"3.5 Flash-Lite", "4 Argon High"} {
		candidate := make([]interface{}, 38)
		candidate[0], candidate[1] = "rc_fixture", []interface{}{`{"next_action":null,"final_answer":"fixture-final"}`}
		candidate[37] = []interface{}{[]interface{}{"reasoning-sentinel-do-not-leak-before-validation"}}
		inner := make([]interface{}, 44)
		inner[4], inner[39], inner[42], inner[43] = []interface{}{candidate}, "fbb127bbb056c959", model, true
		encoded, _ := json.Marshal(inner)
		raw, _ := json.Marshal([]interface{}{[]interface{}{"wrb.fr", nil, string(encoded)}})
		clientCacheMu.Lock()
		clientCache[imp] = bridgeFixtureClient{raw: string(raw) + "\n"}
		clientCacheMu.Unlock()
		body, _ := json.Marshal(map[string]interface{}{"model": "gemini-4-argon-thinking", "stream": true, "messages": []map[string]interface{}{{"role": "user", "content": "fixture"}}, "tools": bridgeTestTools()})
		w := httptest.NewRecorder()
		handleChatCompletions(w, httptest.NewRequest("POST", "/v1/chat/completions", strings.NewReader(string(body))))
		if model != "4 Argon High" {
			if w.Code != 502 || strings.Contains(w.Body.String(), "reasoning-sentinel") || !strings.Contains(w.Body.String(), "model_downgraded") {
				t.Fatalf("wrong model escaped quarantine: HTTP%d", w.Code)
			}
		} else if w.Code != 200 || !strings.Contains(w.Body.String(), "fixture-final") || !strings.Contains(w.Body.String(), "reasoning-sentinel") {
			t.Fatalf("verified content or buffered reasoning lost: HTTP%d", w.Code)
		}
	}
}
