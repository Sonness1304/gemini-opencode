package app

import (
	"crypto/subtle"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

const bindingSchema = `CREATE TABLE IF NOT EXISTS jarvis_bindings (account_id INTEGER PRIMARY KEY,auth_user INTEGER NOT NULL,expected_email TEXT NOT NULL UNIQUE,operation_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jarvis_binding_operations(operation_id TEXT PRIMARY KEY,digest TEXT NOT NULL,account_ids TEXT NOT NULL)`

var bindingSessionMu sync.RWMutex
var bindingCookieMu sync.Mutex

func bindingForAccount(id int64) accountBinding {
	var b accountBinding
	err := getDB().QueryRow(`SELECT auth_user,expected_email FROM jarvis_bindings WHERE account_id=?`, id).Scan(&b.AuthUser, &b.ExpectedEmail)
	if err != nil && err != sql.ErrNoRows {
		return accountBinding{-1, "invalid"}
	}
	return b
}
func bindingsEnabled() bool {
	var n int
	if getDB().QueryRow(`SELECT COUNT(*) FROM jarvis_bindings`).Scan(&n) != nil {
		return true
	}
	return n > 0
}
func primaryBindingID() int64 {
	var id int64
	getDB().QueryRow(`SELECT MIN(b.account_id) FROM jarvis_bindings b JOIN accounts a ON a.id=b.account_id WHERE a.status='enabled'`).Scan(&id)
	return id
}
func rotationAccountID(a CookieAccount) int64 {
	if a.Binding.bound() {
		var id int64
		getDB().QueryRow(`SELECT MIN(account_id) FROM jarvis_bindings`).Scan(&id)
		return id
	}
	return a.ID
}

// Shared-cookie refresh is one session operation; never refresh one bound row in isolation.
func updateBoundCookie(id int64, cookie string) bool {
	if !bindingForAccount(id).bound() {
		return false
	}
	bindingCookieMu.Lock()
	defer bindingCookieMu.Unlock()
	var current string
	if getDB().QueryRow(`SELECT cookie FROM accounts WHERE id=?`, id).Scan(&current) != nil {
		return true
	}
	if cookieIdentity(current) != cookieIdentity(cookie) {
		return true
	}
	if _, err := getDB().Exec(`UPDATE accounts SET cookie=? WHERE id IN(SELECT account_id FROM jarvis_bindings)`, cookie); err != nil {
		return true
	}
	xsrfMu.Lock()
	xsrfCache = map[string]xsrfEntry{}
	xsrfMu.Unlock()
	return true
}

func installSharedBindings(op, cookie string, bs []accountBinding, verify func(string, accountBinding) error) ([]int64, error) {
	if len(op) < 8 || len(op) > 80 || len(cookie) == 0 || len(cookie) > 32768 || len(bs) != 2 || verify == nil || strings.ContainsAny(cookie, "\r\n\x00") || extractSAPISID(cookie) == "" {
		return nil, fmt.Errorf("binding_invalid")
	}
	for _, b := range bs {
		if !b.valid() || !b.bound() {
			return nil, fmt.Errorf("binding_invalid")
		}
	}
	if strings.EqualFold(bs[0].ExpectedEmail, bs[1].ExpectedEmail) || bs[0].AuthUser == bs[1].AuthUser {
		return nil, fmt.Errorf("binding_duplicate_identity")
	}
	bindingSessionMu.Lock()
	defer bindingSessionMu.Unlock()
	payload, _ := json.Marshal(bs)
	digest := bindingTokenKey(cookie, string(payload), accountBinding{})
	var previousDigest, previousIDs string
	replayErr := getDB().QueryRow(`SELECT digest,account_ids FROM jarvis_binding_operations WHERE operation_id=?`, op).Scan(&previousDigest, &previousIDs)
	if replayErr == nil {
		if previousDigest != digest {
			return nil, fmt.Errorf("binding_operation_conflict")
		}
		var ids []int64
		if json.Unmarshal([]byte(previousIDs), &ids) != nil || len(ids) != 2 {
			return nil, fmt.Errorf("binding_store_failed")
		}
		for _, id := range ids {
			var currentOp string
			if getDB().QueryRow(`SELECT operation_id FROM jarvis_bindings WHERE account_id=?`, id).Scan(&currentOp) != nil || currentOp != op {
				return nil, fmt.Errorf("binding_operation_superseded")
			}
		}
		return ids, nil
	}
	if replayErr != sql.ErrNoRows {
		return nil, fmt.Errorf("binding_store_unavailable")
	}
	// Validate both before any account is created or enabled.
	for _, b := range bs {
		if err := verify(cookie, b); err != nil {
			return nil, err
		}
	}
	tx, err := db.Begin()
	if err != nil {
		return nil, fmt.Errorf("binding_store_unavailable")
	}
	defer tx.Rollback()
	ids := make([]int64, 0, 2)
	for _, b := range bs {
		var id int64
		var oldOp, oldEmail string
		var oldIndex int
		err = tx.QueryRow(`SELECT account_id,auth_user,expected_email,operation_id FROM jarvis_bindings WHERE expected_email=?`, b.ExpectedEmail).Scan(&id, &oldIndex, &oldEmail, &oldOp)
		if err == sql.ErrNoRows {
			var count int
			tx.QueryRow(`SELECT COUNT(*) FROM jarvis_bindings`).Scan(&count)
			if count >= 2 {
				return nil, fmt.Errorf("binding_identity_not_enrolled")
			}
			res, e := tx.Exec(`INSERT INTO accounts(label,cookie,status,note,created_at) VALUES(?,?,'enabled','Jarvis bound shared session',?)`, b.ExpectedEmail, cookie, time.Now().Unix())
			if e != nil {
				return nil, fmt.Errorf("binding_store_failed")
			}
			id, e = res.LastInsertId()
			if e != nil {
				return nil, fmt.Errorf("binding_store_failed")
			}
			if _, e = tx.Exec(`INSERT INTO jarvis_bindings(account_id,auth_user,expected_email,operation_id) VALUES(?,?,?,?)`, id, b.AuthUser, b.ExpectedEmail, op); e != nil {
				return nil, fmt.Errorf("binding_store_failed")
			}
		} else if err != nil {
			return nil, fmt.Errorf("binding_store_failed")
		} else {
			if oldOp == op && oldIndex != b.AuthUser {
				return nil, fmt.Errorf("binding_operation_conflict")
			}
			if _, err = tx.Exec(`UPDATE accounts SET cookie=?,fail_count=0,last_error='',last_ok_at=? WHERE id=?`, cookie, time.Now().Unix(), id); err != nil {
				return nil, fmt.Errorf("binding_store_failed")
			}
			if _, err = tx.Exec(`UPDATE jarvis_bindings SET auth_user=?,operation_id=? WHERE account_id=?`, b.AuthUser, op, id); err != nil {
				return nil, fmt.Errorf("binding_store_failed")
			}
		}
		ids = append(ids, id)
	}
	encodedIDs, _ := json.Marshal(ids)
	if _, err = tx.Exec(`INSERT INTO jarvis_binding_operations(operation_id,digest,account_ids) VALUES(?,?,?)`, op, digest, string(encodedIDs)); err != nil {
		return nil, fmt.Errorf("binding_store_failed")
	}
	if err = tx.Commit(); err != nil {
		return nil, fmt.Errorf("binding_commit_unknown")
	}
	xsrfMu.Lock()
	xsrfCache = map[string]xsrfEntry{}
	xsrfMu.Unlock()
	return ids, nil
}

func holdBindingSession() func() {
	bindingSessionMu.RLock()
	return bindingSessionMu.RUnlock
}

func handleJarvisBindings(w http.ResponseWriter, r *http.Request) {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil || net.ParseIP(host) == nil || !net.ParseIP(host).IsLoopback() {
		writeJSON(w, 403, map[string]string{"error": "loopback_required"})
		return
	}
	origin := r.Header.Get("Origin")
	if origin != "" && origin != "http://127.0.0.1:20831" && origin != "http://localhost:20831" {
		writeJSON(w, 403, map[string]string{"error": "origin_denied"})
		return
	}
	key := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	expectedKey := getAPIKey()
	if expectedKey == "" || subtle.ConstantTimeCompare([]byte(key), []byte(expectedKey)) != 1 {
		writeJSON(w, 401, map[string]string{"error": "unauthorized"})
		return
	}
	if r.Method == http.MethodGet {
		type view struct {
			ID          int64          `json:"id"`
			Label       string         `json:"label"`
			Binding     accountBinding `json:"binding"`
			Status      string         `json:"status"`
			OperationID string         `json:"operationId"`
		}
		views := []view{}
		for _, a := range accountList() {
			if a.Binding.bound() {
				var op string
				getDB().QueryRow(`SELECT operation_id FROM jarvis_bindings WHERE account_id=?`, a.ID).Scan(&op)
				views = append(views, view{a.ID, a.Label, a.Binding, a.Status, op})
			}
		}
		writeJSON(w, 200, map[string]interface{}{"items": views})
		return
	}
	if r.Method != http.MethodPost || !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		writeJSON(w, 400, map[string]string{"error": "invalid_request"})
		return
	}
	body, e := io.ReadAll(http.MaxBytesReader(w, r.Body, 49152))
	if e != nil {
		writeJSON(w, 413, map[string]string{"error": "body_too_large"})
		return
	}
	var p struct {
		OperationID string           `json:"operationId"`
		Cookie      string           `json:"cookie"`
		Bindings    []accountBinding `json:"bindings"`
	}
	decoder := json.NewDecoder(strings.NewReader(string(body)))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&p) != nil || decoder.Decode(new(interface{})) != io.EOF {
		writeJSON(w, 400, map[string]string{"error": "invalid_request"})
		return
	}
	ids, e := installSharedBindings(p.OperationID, p.Cookie, p.Bindings, func(cookie string, b accountBinding) error { _, err := fetchAppTokens(cookie, "", b); return err })
	if e != nil {
		code := "binding_session_unavailable"
		if strings.HasPrefix(e.Error(), "binding_") {
			code = e.Error()
		}
		writeJSON(w, 409, map[string]string{"error": code})
		return
	}
	writeJSON(w, 200, map[string]interface{}{"ids": ids, "verified": true})
}
