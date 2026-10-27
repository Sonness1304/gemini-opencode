import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export function toolPilotErrorCode(error){
 if(error?.code==='ERR_ASSERTION')return 'VALIDATION_FAILED';
 if(error?.name==='SyntaxError')return 'INVALID_JSON';
 if(['TimeoutError','AbortError'].includes(error?.name))return 'REQUEST_TIMEOUT';
 if(/^HTTP_[1-5][0-9]{2}$/.test(error?.message??''))return error.message;
 if(error?.message==='STREAM_ERROR')return 'STREAM_ERROR';
 return 'REQUEST_FAILED';
}

export function decodeToolReply(raw,stream=false){
 if(!stream)return JSON.parse(raw);
 let content='',finish=null,usage=null,done=false;const calls=new Map();
 for(const line of raw.split(/\r?\n/)){
  if(!line.startsWith('data:'))continue;
  const data=line.slice(5).trim();if(data==='[DONE]'){done=true;continue;}
  const event=JSON.parse(data);if(event.error)throw new Error('STREAM_ERROR');if(event.usage)usage=event.usage;
  const choice=event.choices?.[0];if(!choice)continue;
  if(choice.finish_reason)finish=choice.finish_reason;
  content+=choice.delta?.content??'';
  for(const call of choice.delta?.tool_calls??[]){
   const value=calls.get(call.index)??{type:'function',id:'',function:{name:'',arguments:''}};
   if(call.id)value.id=call.id;
   value.function.name+=call.function?.name??'';value.function.arguments+=call.function?.arguments??'';
   calls.set(call.index,value);
  }
 }
 assert.ok(done,'STREAM_NOT_FINISHED');
 return {choices:[{finish_reason:finish,message:{role:'assistant',content,tool_calls:[...calls.values()]}}],usage};
}

export async function runToolRoundTrip(send,{model='gemini-4-argon-thinking',stream=false,nonce=()=>randomBytes(16).toString('hex')}={}){
 const tools=[{type:'function',function:{name:'binding_probe',description:'Returns a new random nonce from the local test application.',parameters:{type:'object',properties:{tag:{type:'string'}},required:['tag'],additionalProperties:false}}}];
 const messages=[{role:'user',content:'Read the nonce using binding_probe with tag JARVIS, then reply with ONLY the returned nonce. Do not invent the value or repeat a completed call.'}];
 const first=await send({model,messages,tools,tool_choice:{type:'function',function:{name:'binding_probe'}},stream,stream_options:stream?{include_usage:true}:undefined});
 const choice=first.choices?.[0];const calls=choice?.message?.tool_calls;
 assert.equal(choice?.finish_reason,'tool_calls','FIRST_TURN_NOT_TOOL_CALL');
 assert.ok(Array.isArray(calls)&&calls.length===1,'EXPECTED_ONE_TOOL_CALL');
 const call=calls[0];assert.ok(call.id,'TOOL_CALL_ID_MISSING');assert.equal(call.function?.name,'binding_probe');assert.deepEqual(JSON.parse(call.function.arguments),{tag:'JARVIS'});
 assert.ok(!choice.message.content,'RAW_ACTION_PLAN_LEAKED');
 // Generate after the model commits to an action: the first prompt cannot contain the answer.
 const result=nonce();assert.ok(!JSON.stringify(messages).includes(result),'NONCE_ALREADY_IN_PROMPT');
 messages.push({role:'assistant',content:null,tool_calls:calls},{role:'tool',tool_call_id:call.id,name:'binding_probe',content:result});
 const second=await send({model,messages,tools,tool_choice:'auto',stream,stream_options:stream?{include_usage:true}:undefined});
 const final=second.choices?.[0];assert.equal(final?.finish_reason,'stop','DID_NOT_STOP_AFTER_RESULT');
 assert.equal((final.message?.tool_calls??[]).length,0,'TOOL_REPEATED');assert.equal(final.message?.content?.trim(),result,'TOOL_RESULT_NOT_USED');
 return {status:'PASS',model,stream,toolCalls:1,nonceMatched:true,usage:[first.usage??null,second.usage??null]};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const via=process.argv[2]??'go';assert.ok(['go','9router'].includes(via));const stream=process.argv.includes('--stream');
 const base=via==='go'?'http://127.0.0.1:20831':'http://127.0.0.1:20128';
 const key=via==='go'?process.env.GEMINI_TOOL_PILOT_KEY:process.env.JARVIS_GATEWAY_KEY;assert.ok(key,'MISSING_PROCESS_KEY');
 const model=(via==='go'?'':'jgopilot/')+'gemini-4-argon-thinking';const timings=[];
 try{
  const result=await runToolRoundTrip(async payload=>{
   const started=Date.now();const response=await fetch(base+'/v1/chat/completions',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(250000)});
   if(!response.ok)throw new Error('HTTP_'+response.status);
   const raw=await response.text();timings.push(Date.now()-started);return decodeToolReply(raw,stream);
  },{model,stream});
  console.log(JSON.stringify({via,...result,timingsMs:timings}));
 }catch(error){console.log(JSON.stringify({via,model,stream,status:'FAILED',error:toolPilotErrorCode(error),timingsMs:timings}));process.exitCode=1;}
}
