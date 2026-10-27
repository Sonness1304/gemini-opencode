using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

public static class GeminiGoWebLauncher
{
    [STAThread]
    public static int Main()
    {
        try
        {
            string shell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "PowerShell", "7", "pwsh.exe");
            Run(AppDomain.CurrentDomain.BaseDirectory, shell, StartServer, OpenBrowser);
            return 0;
        }
        catch (Exception error)
        {
            MessageBox.Show(error.Message + "\n\nLog: %LOCALAPPDATA%\\Jarvis\\gemini-web2api-go-pilot", "Gemini Go", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }

    public static void Run(string directory, string shell, Func<ProcessStartInfo, int> startServer, Action<ProcessStartInfo> openBrowser)
    {
        string script = Path.Combine(directory, "Start-Gemini-Go.ps1");
        if (!File.Exists(script)) throw new FileNotFoundException("Khong tim thay Start-Gemini-Go.ps1 canh EXE.");
        if (!File.Exists(shell)) throw new FileNotFoundException("Khong tim thay PowerShell 7.");
        var startup = new ProcessStartInfo(shell, "-NoLogo -NoProfile -NonInteractive -File \"" + script + "\"")
        {
            WorkingDirectory = directory,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        if (startServer(startup) != 0) throw new InvalidOperationException("Khong bat duoc Gemini Go. Kiem tra log; cau hinh duoc giu nguyen.");
        openBrowser(new ProcessStartInfo("http://127.0.0.1:20831/admin/") { UseShellExecute = true });
    }

    private static int StartServer(ProcessStartInfo startup)
    {
        using (var process = new Process { StartInfo = startup })
        {
            // Drain both pipes without retaining startup output or possible credentials.
            process.OutputDataReceived += delegate { };
            process.ErrorDataReceived += delegate { };
            if (!process.Start()) throw new InvalidOperationException("Khong chay duoc launcher Gemini Go.");
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            if (!process.WaitForExit(45000))
                throw new TimeoutException("Chua xac nhan Go khoi dong sau 45 giay. Kiem tra log truoc khi thu lai.");
            // A background server can inherit the pipes after the startup shell exits.
            process.CancelOutputRead();
            process.CancelErrorRead();
            return process.ExitCode;
        }
    }

    private static void OpenBrowser(ProcessStartInfo browser)
    {
        using (Process launched = Process.Start(browser)) { }
    }
}
