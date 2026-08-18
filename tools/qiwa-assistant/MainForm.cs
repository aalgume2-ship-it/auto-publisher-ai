using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Text.Json;

namespace QiwaAssistant;

public class MainForm : Form
{
    readonly WebView2 web = new() { Dock = DockStyle.Fill };
    readonly TextBox output = new() { Dock = DockStyle.Fill, Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical, Font = new Font("Segoe UI", 10) };
    readonly ToolStrip tools = new() { GripStyle = ToolStripGripStyle.Hidden, RightToLeft = RightToLeft.Yes };
    readonly SplitContainer split = new() { Dock = DockStyle.Fill, Orientation = Orientation.Vertical, SplitterDistance = 1050 };

    public MainForm()
    {
        Text = "مساعد قوى";
        Width = 1500; Height = 900;
        RightToLeft = RightToLeft.Yes;
        RightToLeftLayout = true;

        AddButton("فتح قوى", async (_,__) => await GoQiwa());
        AddButton("فحص الصفحة", async (_,__) => await ScanPage());
        AddButton("الرخص المنتهية", async (_,__) => await FindExpired());
        AddButton("قريبة الانتهاء", async (_,__) => await FindExpiring());
        AddButton("رخص العمل", async (_,__) => await ClickByText(new[]{"رخص العمل","Work permits"}));
        AddButton("استخراج رقم سداد", async (_,__) => await ExtractSadad());
        AddButton("نسخ النتائج", (_,__) => { Clipboard.SetText(output.Text); });

        split.Panel1.Controls.Add(web);
        split.Panel2.Controls.Add(output);
        Controls.Add(split);
        Controls.Add(tools);
        tools.Dock = DockStyle.Top;
        Shown += async (_,__) => await Init();
    }

    void AddButton(string text, EventHandler handler)
    {
        var b = new ToolStripButton(text) { DisplayStyle = ToolStripItemDisplayStyle.Text, AutoSize = true };
        b.Click += handler; tools.Items.Add(b);
    }

    async Task Init()
    {
        await web.EnsureCoreWebView2Async();
        web.CoreWebView2.Settings.AreDevToolsEnabled = false;
        web.CoreWebView2.Settings.IsPasswordAutosaveEnabled = false;
        web.CoreWebView2.Settings.IsGeneralAutofillEnabled = false;
        web.CoreWebView2.NavigationCompleted += (_,__) => output.Text = "جاهز. سجل دخولك في قوى عبر نفاذ، ثم استخدم الأزرار بالأعلى.\r\nلن يقوم البرنامج بالضغط على الدفع أو الاعتماد النهائي.";
        await GoQiwa();
    }

    Task GoQiwa()
    {
        web.Source = new Uri("https://www.qiwa.sa/");
        return Task.CompletedTask;
    }

    async Task<string> Js(string script)
    {
        if (web.CoreWebView2 is null) return "";
        return await web.CoreWebView2.ExecuteScriptAsync(script);
    }

    static string Decode(string raw)
    {
        try { return JsonSerializer.Deserialize<string>(raw) ?? raw; } catch { return raw.Trim('"'); }
    }

    async Task ScanPage()
    {
        var raw = await Js(@"(() => {
          const t = document.body?.innerText || '';
          const iq = [...new Set(t.match(/\b[12]\d{9}\b/g)||[])];
          const dates = [...new Set(t.match(/\b\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\b/g)||[])];
          const sadad = [...new Set(t.match(/(?:سداد|SADAD)[^\d]{0,20}(\d{6,20})/gi)||[])];
          return `العنوان: ${document.title}\nالرابط: ${location.href}\n\nأرقام إقامة/هوية ظاهرة (${iq.length}):\n${iq.join('\n')}\n\nتواريخ ظاهرة (${dates.length}):\n${dates.join('\n')}\n\nإشارات سداد:\n${sadad.join('\n')}`;
        })()" );
        output.Text = Decode(raw);
    }

    async Task FindExpired()
    {
        var raw = await Js(@"(() => {
          const now = new Date();
          const rows = [...document.querySelectorAll('tr,[role=row],.card')];
          const hits=[];
          for (const r of rows){
            const tx=(r.innerText||'').trim(); if(!tx) continue;
            const m=tx.match(/\b(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\b/);
            if(m){ const d=new Date(+m[1],+m[2]-1,+m[3]); if(d<now) hits.push(tx); }
            else if(/منتهي|منتهية|expired/i.test(tx)) hits.push(tx);
          }
          return hits.length?hits.join('\n\n---\n\n'):'لم أجد صفوفًا منتهية في الصفحة الحالية. افتح صفحة رخص العمل أو الموظفين ثم أعد الفحص.';
        })()" );
        output.Text = Decode(raw);
    }

    async Task FindExpiring()
    {
        var raw = await Js(@"(() => {
          const now=new Date(), limit=new Date(); limit.setDate(limit.getDate()+90);
          const rows=[...document.querySelectorAll('tr,[role=row],.card')], hits=[];
          for(const r of rows){ const tx=(r.innerText||'').trim(); const m=tx.match(/\b(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\b/); if(!m) continue;
            const d=new Date(+m[1],+m[2]-1,+m[3]); if(d>=now && d<=limit) hits.push(tx); }
          return hits.length?hits.join('\n\n---\n\n'):'لم أجد رخصًا تنتهي خلال 90 يومًا في الصفحة الحالية.';
        })()" );
        output.Text = Decode(raw);
    }

    async Task ClickByText(string[] texts)
    {
        var json = JsonSerializer.Serialize(texts);
        var raw = await Js($@"(() => {{ const targets={json}; const els=[...document.querySelectorAll('a,button,[role=button]')];
          const e=els.find(x=>targets.some(t=>(x.innerText||'').trim().toLowerCase().includes(t.toLowerCase()))); if(e){{e.click();return 'تم فتح: '+(e.innerText||'').trim();}} return 'لم أجد الزر في الصفحة الحالية.'; }})()" );
        output.Text = Decode(raw);
    }

    async Task ExtractSadad()
    {
        var raw = await Js(@"(() => {
          const t=document.body?.innerText||'';
          const lines=t.split(/\n+/).map(x=>x.trim()).filter(Boolean);
          const hits=[];
          for(let i=0;i<lines.length;i++) if(/سداد|sadad/i.test(lines[i])) hits.push(lines.slice(Math.max(0,i-1),Math.min(lines.length,i+3)).join(' | '));
          const nums=[...new Set(t.match(/\b\d{8,20}\b/g)||[])];
          return `نتائج مرتبطة بسداد:\n${hits.join('\n')}\n\nأرقام طويلة ظاهرة قد تتضمن رقم سداد:\n${nums.join('\n')}\n\nتحقق من الرقم داخل تفاصيل الطلب قبل الدفع.`;
        })()" );
        output.Text = Decode(raw);
    }
}
