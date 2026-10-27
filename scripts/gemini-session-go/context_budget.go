package app

import (
	"fmt"
	"net/http"
)

type argonContextError struct{ Bytes, Budget int }

func (e *argonContextError) Error() string {
	return fmt.Sprintf("Argon web context is %d UTF-8 bytes, over the configured %d-byte inline transport budget. Summarize prior turns or start a fresh session with a short checkpoint and read only needed file sections. Oversized history is not uploaded or truncated. A client-advertised token window does not increase this web transport budget.", e.Bytes, e.Budget)
}

func checkArgonContext(prompt string, mc ModelConfig) error {
	budget := rtCfg().MaxPromptBytes
	if mc.HexID == hexArgon4 && mc.Tool == 0 && budget > 0 && len(prompt) > budget {
		return &argonContextError{len(prompt), budget}
	}
	return nil
}

func rejectArgonContext(w http.ResponseWriter, prompt string, mc ModelConfig) bool {
	if err := checkArgonContext(prompt, mc); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{"error": map[string]string{"message": err.Error(), "type": "invalid_request_error", "code": "context_length_exceeded"}})
		return true
	}
	return false
}
