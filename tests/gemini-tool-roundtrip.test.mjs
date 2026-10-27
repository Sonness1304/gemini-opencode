import test from 'node:test';
import assert from 'node:assert/strict';
import {runToolRoundTrip,decodeToolReply} from '../scripts/pilot-gemini-tool-roundtrip.mjs';
import * as pilot from '../scripts/pilot-gemini-tool-roundtrip.mjs';

const first=()=>({choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:null,tool_calls:[{id:'call_fixture',type:'function',function:{name:'binding_probe',arguments:'{"tag":"JARVIS"}'}}]}}]});
test('roundtrip requires a real call before supplying a secret-free random result',async()=>{
 let stage=0;
 const result=await runToolRoundTrip(async payload=>{
  if(stage++===0){assert.ok(!JSON.stringify(payload).includes('fixture-nonce'));return first();}
  assert.equal(payload.messages.at(-1).tool_call_id,'call_fixture');assert.equal(payload.messages.at(-1).content,'fixture-nonce');
  return {choices:[{finish_reason:'stop',message:{content:'fixture-nonce'}}]};
 },{nonce:()=> 'fixture-nonce'});
 assert.equal(result.status,'PASS');assert.equal(stage,2);
});
test('model text or incorrect final result cannot pass as a tool roundtrip',async()=>{
 await assert.rejects(runToolRoundTrip(async()=>({choices:[{finish_reason:'stop',message:{content:'I have read it'}}]})),/FIRST_TURN_NOT_TOOL_CALL/);
 let stage=0;await assert.rejects(runToolRoundTrip(async()=>stage++===0?first():{choices:[{finish_reason:'stop',message:{content:'invented'}}]},{nonce:()=> 'actual'}),/TOOL_RESULT_NOT_USED/);
});
test('SSE assembles function arguments and requires a complete stream',()=>{
 const raw=[{choices:[{delta:{tool_calls:[{index:0,id:'call_fixture',function:{name:'binding_probe',arguments:'{"tag":'}}]}}]},{choices:[{delta:{tool_calls:[{index:0,function:{arguments:'"JARVIS"}'}}]},finish_reason:'tool_calls'}]}].map(x=>'data: '+JSON.stringify(x)+'\n\n').join('');
 const decoded=decodeToolReply(raw+'data: [DONE]\n\n',true);assert.equal(decoded.choices[0].message.tool_calls[0].function.arguments,'{"tag":"JARVIS"}');
 assert.throws(()=>decodeToolReply(raw,true),/STREAM_NOT_FINISHED/);
 assert.throws(()=>decodeToolReply('data: {"error":{"message":"fixture"}}\n\n',true),/STREAM_ERROR/);
});

test('failure metadata never contains raw model text from assertions or JSON errors',()=>{
 assert.equal(typeof pilot.toolPilotErrorCode,'function');
 const errors=[new assert.AssertionError({actual:'PRIVATE_MODEL_SENTINEL',expected:'expected',operator:'strictEqual'}),new SyntaxError('Unexpected JSON token PRIVATE_MODEL_SENTINEL'),new Error('network PRIVATE_MODEL_SENTINEL')];
 for(const error of errors)assert.ok(!JSON.stringify({error:pilot.toolPilotErrorCode(error)}).includes('PRIVATE_MODEL_SENTINEL'));
});
