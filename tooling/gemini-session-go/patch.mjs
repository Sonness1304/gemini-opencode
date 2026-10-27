import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const source=path.resolve(process.argv[2]??'');
const app=path.join(source,'internal','app');
const repo=fileURLToPath(new URL('../../',import.meta.url));
const manifest=JSON.parse(fs.readFileSync(new URL('./source-hashes.json',import.meta.url),'utf8'));
const actualFiles=fs.readdirSync(source,{recursive:true,withFileTypes:true}).filter(x=>x.isFile()).map(x=>path.relative(source,path.join(x.parentPath,x.name)).replaceAll('\\','/')).sort();
assert.deepEqual(actualFiles,Object.keys(manifest).sort(),'source tree differs from pinned archive');
for(const [name,hash] of Object.entries(manifest)) assert.equal(createHash('sha256').update(fs.readFileSync(path.join(source,name))).digest('hex'),hash,`source hash mismatch: ${name}`);
const changed=new Map();
function edit(name,oldText,newText,count=1){
 let text=changed.get(name)??fs.readFileSync(path.join(app,name),'utf8').replaceAll('\r\n','\n');
 assert.equal(text.split(oldText).length-1,count,`unexpected pinned source: ${name}: ${oldText.slice(0,90)}`);
 text=text.replaceAll(oldText,newText);changed.set(name,text);
}
edit('cookie_pool.go','type CookieAccount struct {','type CookieAccount struct {\n Binding accountBinding');
edit('cookie_pool.go','out = append(out, a)','a.Binding=bindingForAccount(a.ID)\n\t\tout = append(out, a)');
edit('cookie_pool.go','return &a\n}', 'a.Binding=bindingForAccount(a.ID)\n return &a\n}');
edit('cookie_pool.go','if skip[a.ID] {','a.Binding=bindingForAccount(a.ID)\n if bindingsEnabled() && !a.Binding.bound() {continue}\n if skip[a.ID] {');
edit('cookie_pool.go','getXSRF(a.Cookie, proxyURL)','getXSRF(a.Cookie, proxyURL,a.Binding)');
edit('cookie_pool.go','func checkAccountCookie(a CookieAccount) CookieCheck {','func checkAccountCookie(a CookieAccount) CookieCheck {\n bindingSessionMu.RLock();defer bindingSessionMu.RUnlock();if fresh:=accountByID(a.ID);fresh!=nil{a=*fresh}');
edit('cookie_pool.go','func updateAccountCookie(id int64, cookie string) {','func updateAccountCookie(id int64, cookie string) {\n if updateBoundCookie(id,cookie) {return}');
edit('db.go','dbw = &dbx{conn}','dbw = &dbx{conn}\n if _,err:=conn.Exec(bindingSchema);err!=nil {panic("binding schema unavailable")}');
edit('app.go','mux.HandleFunc("/admin/api/cookies",','mux.HandleFunc("/admin/api/jarvis/session", handleJarvisBindings)\n\t\tmux.HandleFunc("/admin/api/cookies",');
edit('admin_cookies.go','"id":           a.ID,','"id":           a.ID,\n "binding": a.Binding,');

// Binding travels as a typed value; raw cookies are never decorated with metadata.
for(const fn of ['getXSRF','getUploadTokens','fetchAppPage','fetchAppTokens']){
 edit('xsrf.go',`func ${fn}(cookie, proxyURL string)`,`func ${fn}(cookie, proxyURL string, bindings ...accountBinding)`);
}
edit('xsrf.go','key := cookieKey(cookie)','b:=selectedBinding(bindings)\n key := bindingTokenKey(cookie,proxyURL,b)',2);
edit('xsrf.go','ok && time.Since(e.fetched) < xsrfTTL','ok && !b.bound() && time.Since(e.fetched) < xsrfTTL',2);
edit('xsrf.go','delete(xsrfCache, cookieKey(cookie))','xsrfCache = map[string]xsrfEntry{}');
edit('xsrf.go','fetchAppTokens(cookie, proxyURL)','fetchAppTokens(cookie, proxyURL,bindings...)',2);
edit('xsrf.go','const pageURL = "https://gemini.google.com/app"','b:=selectedBinding(bindings)\n if !b.valid() {return nil,fmt.Errorf("binding_invalid")}\n pageURL := bindingPageURL(b)');
edit('xsrf.go','body, err := fetchAppPage(cookie, proxyURL)','body, err := fetchAppPage(cookie, proxyURL,bindings...)');
edit('xsrf.go','e := xsrfEntry{fetched: time.Now()}','if err:=validateBindingIdentity(body,selectedBinding(bindings));err!=nil{return xsrfEntry{},err}\n e := xsrfEntry{fetched: time.Now()}');

edit('gemini.go','func buildGeminiHeaders(cookieStr, sapisid, hexID string)','func buildGeminiHeaders(cookieStr, sapisid, hexID string, bindings ...accountBinding)');
edit('gemini.go','return h\n}', 'b:=selectedBinding(bindings)\n if b.bound() {h["X-Goog-AuthUser"]=fmt.Sprint(b.AuthUser);h["Referer"]=bindingPageURL(b)}\n return h\n}');
edit('gemini.go','var acct *CookieAccount','var binding accountBinding\n var acct *CookieAccount');
edit('gemini.go','var files []fileRef','if err:=checkArgonContext(prompt,mc);err!=nil{return &StreamResult{},err}\n defer holdBindingSession()()\n var files []fileRef');
edit('gemini.go','func probeGemini(prompt, proxyURL string) ProbeResult {','func probeGemini(prompt, proxyURL string) ProbeResult {\n defer holdBindingSession()()');
edit('gemini.go','tok, err := getXSRF(acct.Cookie, proxyURL)','binding=acct.Binding\n tok, err := getXSRF(acct.Cookie, proxyURL,binding)');
edit('gemini.go','// 取不到 SNlM0e', 'if strings.HasPrefix(err.Error(),"binding_") {return attrib(err)}\n if binding.bound() {return attrib(fmt.Errorf("binding_session_refresh_required"))}\n // 取不到 SNlM0e');
edit('gemini.go','getXSRF(fresh.Cookie, proxyURL)','getXSRF(fresh.Cookie, proxyURL,fresh.Binding)');
edit('gemini.go','uploadBytes(cookieStr, proxyURL, u.Data, u.Name)','uploadBytes(cookieStr, proxyURL, u.Data, u.Name,binding)');
edit('gemini.go','prepareContextFile(prompt, latest, budget, cookieStr, proxyURL)','prepareContextFile(prompt, latest, budget, cookieStr, proxyURL,binding)');
edit('gemini.go','buildGeminiHeaders(cookieStr, sapisid, mc.HexID)','buildGeminiHeaders(cookieStr, sapisid, mc.HexID,binding)',2);
edit('gemini.go','getXSRF(cookieStr, proxyURL)','getXSRF(cookieStr, proxyURL,binding)',2);
edit('gemini.go','go deleteConversation(cid, cookieStr, sapisid, xsrfToken, proxyURL)','if binding.bound(){deleteConversation(cid,cookieStr,sapisid,xsrfToken,proxyURL,binding)}else{go deleteConversation(cid,cookieStr,sapisid,xsrfToken,proxyURL)}');
edit('gemini.go','fetchMediaArtifacts(mc.Tool, res.Raw, cid, cookieStr, sapisid, xsrfToken, proxyURL, mc.Mime)','fetchMediaArtifacts(mc.Tool, res.Raw, cid, cookieStr, sapisid, xsrfToken, proxyURL, mc.Mime,binding)',0);
// Locate this multiline call without guessing its result-variable name.
{
 let text=changed.get('gemini.go');
 const lines=text.split('\n');let found=0;
 for(let i=0;i<lines.length;i++)if(lines[i].includes('fetchMediaArtifacts(')){
  let end=i;while(!lines[end].includes('proxyURL, mime)'))end++;
  lines[end]=lines[end].replace(')',',binding)');found++;
 }
 assert.equal(found,1,'media binding caller');changed.set('gemini.go',lines.join('\n'));
}
edit('gemini.go','cookieStr, sapisid := loadCookie()','cookieStr, sapisid,binding := loadBoundCookie()');
edit('gemini.go','if tok, e := getXSRF(cookieStr, proxyURL,binding); e == nil && tok != "" {','if bindingsEnabled() && !binding.bound(){res.Status="binding_unavailable";res.Diagnostic="No eligible bound account";return res}\n if tok,e:=getXSRF(cookieStr,proxyURL,binding);e!=nil && binding.bound(){res.Status="binding_unavailable";res.Diagnostic="Selected account identity/session unavailable";return res}else if e==nil && tok!="" {');
edit('gemini.go','func anonFirstEligible(mc ModelConfig, hasAttachment bool) bool {','func anonFirstEligible(mc ModelConfig, hasAttachment bool) bool {\n if bindingsEnabled(){return false}');
edit('gemini.go','// 通过限流器拿一个 slot','if bindingsEnabled() && (acct==nil || !acct.Binding.bound()){return attrib(fmt.Errorf("binding_no_eligible_account"))}\n // 通过限流器拿一个 slot');
edit('gemini.go','buildGeminiHeaders(cookieStr, sapisid, probeModel.HexID)','buildGeminiHeaders(cookieStr, sapisid, probeModel.HexID,binding)');
edit('gemini.go','func doGeminiRequest(endpoint, body string, headers map[string]string, proxyURL string,','func doGeminiRequest(endpoint, body string, headers map[string]string, proxyURL string,');
// Set authuser on all Gemini RPC URLs from the already-selected outbound header.
edit('gemini.go','sendAt := time.Now()','endpoint=bindingEndpointFromHeaders(endpoint,headers)\n sendAt := time.Now()');
edit('gemini.go','// 复用主流程同款 client','endpoint=bindingEndpoint(endpoint,binding)\n // 复用主流程同款 client');

edit('client.go','func loadCookie() (cookie, sapisid string) {','func loadCookie() (cookie, sapisid string) {\n cookie,sapisid,_=loadBoundCookie();return\n}\nfunc loadBoundCookie() (cookie,sapisid string,binding accountBinding) {');
edit('client.go','return a.Cookie, extractSAPISID(a.Cookie)','return a.Cookie, extractSAPISID(a.Cookie),a.Binding');
edit('client.go','return "", ""','return "", "",accountBinding{}');
edit('upload.go','filename string) (string, error)','filename string, bindings ...accountBinding) (string, error)');
edit('upload.go','getUploadTokens(cookie, proxyURL)','getUploadTokens(cookie, proxyURL,bindings...)');
edit('upload.go','with := func(extra map[string]string)', 'b:=selectedBinding(bindings)\n if b.bound(){base["X-Goog-AuthUser"]=fmt.Sprint(b.AuthUser);base["Referer"]=bindingPageURL(b)}\n with := func(extra map[string]string)');
edit('upload.go','int, map[string]string, []byte, error) {','int, map[string]string, []byte, error) {\n url=bindingEndpointFromHeaders(url,headers)');
edit('context_file.go','cookie, proxyURL string) (','cookie, proxyURL string, bindings ...accountBinding) (');
edit('context_file.go','uploadBytes(cookie, proxyURL, []byte(prompt), contextFileName)','uploadBytes(cookie, proxyURL, []byte(prompt), contextFileName,bindings...)');

edit('conversation.go','type convState struct {','type convState struct {\n binding accountBinding');
edit('conversation.go','p, slotOK, slotErr := acquireSlot(conv.proxyID)','defer holdBindingSession()()\n if bindingsEnabled() && !conv.binding.bound(){return &StreamResult{},fmt.Errorf("binding_no_eligible_account")}\n p, slotOK, slotErr := acquireSlot(conv.proxyID)');
edit('conversation.go','conv.accountID = a.ID','conv.accountID = a.ID\n conv.binding=a.Binding');
edit('conversation.go','getXSRF(conv.cookie, proxyURL)','getXSRF(conv.cookie, proxyURL,conv.binding)');
edit('conversation.go','buildGeminiHeaders(conv.cookie, conv.sapisid, mc.HexID)','buildGeminiHeaders(conv.cookie, conv.sapisid, mc.HexID,conv.binding)');

// Argon High plans client actions as JSON, without impersonating native web tools.
edit('server.go','messagesToPrompt(messages, tools, req["tool_choice"])','messagesToModelPrompt(messages, tools, req["tool_choice"],modelCfg)',2);
edit('server.go','prompt, latest := messagesToModelPrompt(messages, tools, req["tool_choice"],modelCfg)','',2);
edit('server.go','images, err := collectImages(messages, "")','prompt, latest := messagesToModelPrompt(messages, tools, req["tool_choice"],modelCfg)\n if rejectArgonContext(w,prompt,modelCfg){return}\n images, err := collectImages(messages, "")',2);
edit('server.go','images []pendingUpload, onDelta, onReasoning func(string)) (string, []ToolCall, *StreamResult, error) {','images []pendingUpload, onDelta, onReasoning func(string),choices ...interface{}) (string, []ToolCall, *StreamResult, error) {\n var choice interface{};if len(choices)>0{choice=choices[0]}\n if actionBridgeEnabled(mc,tools){onDelta=nil;onReasoning=nil}');
edit('server.go','callGemini(prompt, latest, modelCfg, tools, images, onDelta, onReasoning)','callGemini(prompt, latest, modelCfg, tools, images, onDelta, onReasoning,req["tool_choice"])');
edit('server.go','callGemini(prompt, latest, modelCfg, tools, images, onDelta, nil)','callGemini(prompt, latest, modelCfg, tools, images, onDelta, nil,req["tool_choice"])');
edit('server.go','var toolCalls []ToolCall\n\tif len(tools) > 0 {','if actionBridgeEnabled(mc,tools){text,calls,e:=parseActionReply(text,tools,choice);return text,calls,res,e}\n var toolCalls []ToolCall\n\tif len(tools) > 0 {');
edit('server.go','text := extractResponseText(res.Raw)','if err:=checkActionModel(mc,tools,res.UpstreamModel);err!=nil{return "",nil,res,err}\n text := extractResponseText(res.Raw)');
edit('conversation.go','parentKey := convParentKey(messages)','if actionBridgeEnabled(mc,tools){prompt,latest:=messagesToModelPrompt(messages,tools,toolChoice,mc);return callGemini(prompt,latest,mc,tools,nil,onDelta,onReasoning,toolChoice)}\n parentKey := convParentKey(messages)');

for(const name of ['fetchMediaArtifacts','fetchImageArtifacts','fetchDownloadArtifacts','pollHistoryRaw','deleteConversation']){
 let text=changed.get('media.go')??fs.readFileSync(path.join(app,'media.go'),'utf8').replaceAll('\r\n','\n');
 const pattern=new RegExp(`(func ${name}\\([\\s\\S]*?)(\\) (?:\\(|\\{))`);
 assert.ok(pattern.test(text),`media function ${name}`);text=text.replace(pattern,'$1, bindings ...accountBinding$2');changed.set('media.go',text);
}
// Only these internal calls have binding; downloads retain account-scoped URLs and restricted cookies.
for(const name of ['fetchImageArtifacts','fetchDownloadArtifacts','pollHistoryRaw']){
 let text=changed.get('media.go');const pattern=new RegExp(`(?<!func )${name}\\(([^\\n]*?)\\)`,'g');let n=0;
 text=text.replace(pattern,(_,args)=>{n++;return `${name}(${args},bindings...)`});assert.ok(n>0,name);changed.set('media.go',text);
}
edit('media.go','buildGeminiHeaders(cookie, sapisid, "")','buildGeminiHeaders(cookie, sapisid, "",bindings...)',2);

// Rotation is session-wide and waits for in-flight v1 requests before refreshing both rows.
edit('rotate.go','func rotateAccount(a CookieAccount) (time.Duration, []string, error) {','func rotateAccount(a CookieAccount) (time.Duration, []string, error) {\n if a.Binding.bound(){bindingSessionMu.Lock();defer bindingSessionMu.Unlock();if fresh:=accountByID(a.ID);fresh!=nil{a=*fresh}}');
edit('rotate.go','tryRotate1PSIDTS(a.ID, cookie, proxyURL)','tryRotate1PSIDTS(rotationAccountID(a), cookie, proxyURL)');
edit('rotate.go','if a.Status != "enabled" {','if a.Binding.bound() && a.ID!=primaryBindingID() {continue}\n if a.Status != "enabled" {');

// Apply only after every pinned anchor has been checked.
for(const [name,text] of changed)fs.writeFileSync(path.join(app,name),text);
for(const name of fs.readdirSync(path.join(repo,'scripts/gemini-session-go')).filter(x=>x.endsWith('.go')))fs.copyFileSync(path.join(repo,'scripts/gemini-session-go',name),path.join(app,name));
console.log(JSON.stringify({patched:[...changed.keys()],sourcePin:'64b2d2c549c37b91f4c3dcbacaa720f604eb69e1'}));
