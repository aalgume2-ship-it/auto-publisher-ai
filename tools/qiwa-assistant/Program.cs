using System.Reflection;
using Microsoft.Web.WebView2.WinForms;

namespace QiwaAssistant;

internal static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        var form = new MainForm();
        LocalBridge? bridge = null;
        form.Shown += (_,__) =>
        {
            try
            {
                var field = typeof(MainForm).GetField("web", BindingFlags.Instance | BindingFlags.NonPublic);
                if (field?.GetValue(form) is WebView2 web)
                {
                    bridge = new LocalBridge(web);
                    bridge.Start();
                }
            }
            catch { }
        };
        form.FormClosed += (_,__) => bridge?.Dispose();
        Application.Run(form);
    }
}
