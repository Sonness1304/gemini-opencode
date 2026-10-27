import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

test('session launcher checks both bindings without generation or credential output', {skip:process.platform!=='win32'},()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gemini-session-test-'));
 const source=path.resolve('scripts/test-gemini-session.ps1');
 const harness=path.join(dir,'test.ps1');
 fs.writeFileSync(harness,String.raw`
param($Source)
$ErrorActionPreference='Stop'
$script:case='ready';$script:checks=0;$script:status=''
function Invoke-RestMethod {param($Uri,$TimeoutSec,$Headers,$Method)
 if ($Uri -match '/apikey$') {return @{key='secret-sentinel'}}
 if ($Uri -match '/jarvis/session$') {
  if ($Headers.Authorization -ne 'Bearer secret-sentinel') {throw 'Missing key'}
  if ($script:case -eq 'missing') {return @{items=@()}}
  return @{items=@(@{id=6;status='enabled'},@{id=7;status='enabled'})}
 }
 if ($Uri -match '/cookies/[67]/check$' -and $Method -eq 'Post') {
  $script:checks++
  if ($script:case -eq 'timeout') {throw 'timeout'}
  return @{ok=($script:case -ne 'dead')}
 }
 throw 'Unexpected endpoint'
}
function Set-Content {param($LiteralPath,$Encoding,[Parameter(ValueFromPipeline=$true)]$Value) process{$script:status=$Value}}
foreach($caseName in @('ready','dead','missing','timeout')) {
 $script:case=$caseName;$script:checks=0
 $output=(. $Source | Out-String)
 $expected=@{ready='READY';dead='LOGIN_REQUIRED';missing='BRIDGE_REQUIRED';timeout='CHECK_UNCONFIRMED'}[$caseName]
 if ($script:status -ne $expected) {throw "wrong status $caseName actual=$($script:status) checks=$($script:checks) error=$($Error[0].Exception.Message)"}
 if ($caseName -in @('ready','dead') -and $script:checks -ne 2) {throw 'both accounts must be checked'}
 if ($output.Contains('secret-sentinel')) {throw 'secret output'}
}
Write-Output '4 session scenarios PASS'
`);
 try {assert.match(execFileSync('pwsh',['-NoProfile','-NonInteractive','-File',harness,source],{encoding:'utf8'}),/4 session scenarios PASS/);}
 finally {fs.rmSync(dir,{recursive:true,force:true});}
});
