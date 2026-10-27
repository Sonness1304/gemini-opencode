import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('Windows web launcher opens admin only after successful startup, with safe process settings', { skip: process.platform !== 'win32' }, () => {
  const source = fileURLToPath(new URL('../scripts/gemini-go-web-launcher.cs', import.meta.url));
  const compiler = path.join(process.env.WINDIR, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini launcher test '));
  try {
    const harness = path.join(dir, 'Tests.cs');
    const binary = path.join(dir, 'Tests.exe');
    const copiedSource = path.join(dir, 'Launcher.cs');
    fs.copyFileSync(source, copiedSource);
    fs.writeFileSync(harness, String.raw`
using System;
using System.Diagnostics;
using System.IO;
class LauncherTests {
  static void Check(bool value, string message) { if (!value) throw new Exception(message); }
  static int Main(string[] args) {
    if (args[0] == "--linger") { System.Threading.Thread.Sleep(5000); return 0; }
    if (args[0] == "--spawn") {
      var child = Process.Start(new ProcessStartInfo(System.Reflection.Assembly.GetExecutingAssembly().Location, "--linger") { UseShellExecute=false, CreateNoWindow=true });
      File.WriteAllText(args[1], child.Id.ToString()); return 0;
    }
    string dir = args[0];
    string shell = Path.Combine(dir, "pwsh.exe");
    string script = Path.Combine(dir, "Start-Gemini-Go.ps1");
    File.WriteAllText(shell, "fixture"); File.WriteAllText(script, "fixture");
    int stage = 0;
    GeminiGoWebLauncher.Run(dir, shell, delegate(ProcessStartInfo p) {
      Check(stage++ == 0, "startup first");
      Check(p.FileName == shell && p.WorkingDirectory == dir, "absolute paths");
      Check(p.Arguments == "-NoLogo -NoProfile -NonInteractive -File \"" + script + "\"", "quoted script path");
      Check(!p.UseShellExecute && p.CreateNoWindow && p.RedirectStandardOutput && p.RedirectStandardError, "hidden subprocess");
      return 0;
    }, delegate(ProcessStartInfo p) {
      Check(stage++ == 1, "browser follows startup");
      Check(p.UseShellExecute && p.FileName == "http://127.0.0.1:20831/admin/", "fixed local admin URL");
    });
    Check(stage == 2, "success complete");
    bool opened = false, rejected = false;
    try { GeminiGoWebLauncher.Run(dir, shell, p => 9, p => opened = true); }
    catch (InvalidOperationException error) { rejected = true; Check(error.Message == "Gemini Go could not start. Check the logs; configuration was left unchanged.", "English startup error"); }
    Check(rejected && !opened, "startup failure must not open browser");
    rejected = false;
    try { GeminiGoWebLauncher.Run(dir, shell, delegate(ProcessStartInfo p) { throw new TimeoutException(); }, p => opened = true); }
    catch (TimeoutException) { rejected = true; }
    Check(rejected && !opened, "unknown startup must not open browser");
    File.Delete(script); rejected = false;
    try { GeminiGoWebLauncher.Run(dir, shell, p => { throw new Exception("must not run"); }, p => opened = true); }
    catch (FileNotFoundException error) { rejected = true; Check(error.Message == "Start-Gemini-Go.ps1 was not found beside the executable.", "English missing-script error"); }
    Check(rejected && !opened, "missing launcher rejected before execution");
    string self = System.Reflection.Assembly.GetExecutingAssembly().Location;
    string pidFile = Path.Combine(dir, "fixture-child.pid");
    try {
      var timer = Stopwatch.StartNew();
      var method = typeof(GeminiGoWebLauncher).GetMethod("StartServer", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);
      int code = (int)method.Invoke(null, new object[] { new ProcessStartInfo(self, "--spawn \"" + pidFile + "\"") { UseShellExecute=false, CreateNoWindow=true, RedirectStandardOutput=true, RedirectStandardError=true } });
      Check(code == 0 && timer.ElapsedMilliseconds < 2000, "startup must not wait for inherited pipes held by background child");
    } finally {
      if (File.Exists(pidFile)) {
        using (var child = Process.GetProcessById(Int32.Parse(File.ReadAllText(pidFile)))) {
          Check(child.MainModule.FileName == self, "test child ownership"); child.Kill(); child.WaitForExit();
        }
      }
    }
    Console.WriteLine("5 launcher scenarios PASS"); return 0;
  }
}
`);
    execFileSync(compiler, ['/nologo', '/target:exe', '/main:LauncherTests', '/r:System.Windows.Forms.dll', '/out:' + binary, copiedSource, harness], { encoding: 'utf8' });
    assert.match(execFileSync(binary, [dir], { encoding: 'utf8' }), /5 launcher scenarios PASS/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
