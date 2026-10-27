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
        if (!File.Exists(script)) throw new FileNotFoundException("Start-Gemini-Go.ps1 was not found beside the executable.");
        if (!File.Exists(shell)) throw new FileNotFoundException("PowerShell 7 was not found.");
        var startup = new ProcessStartInfo(shell, "-NoLogo -NoProfile -NonInteractive -File \"" + script + "\"")
        {
            WorkingDirectory = directory,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        if (startServer(startup) != 0) throw new InvalidOperationException("Gemini Go could not start. Check the logs; configuration was left unchanged.");
        openBrowser(new ProcessStartInfo("http://127.0.0.1:20831/admin/") { UseShellExecute = true });
    }

    private static int StartServer(ProcessStartInfo startup)
    {
        using (var process = new Process { StartInfo = startup })
        {
            // Drain both pipes without retaining startup output or possible credentials.
            process.OutputDataReceived += delegate { };
            process.ErrorDataReceived += delegate { };
            if (!process.Start()) throw new InvalidOperationException("The Gemini Go launcher could not start.");
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            if (!process.WaitForExit(45000))
                throw new TimeoutException("Go startup was not confirmed within 45 seconds. Check the logs before trying again.");
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
