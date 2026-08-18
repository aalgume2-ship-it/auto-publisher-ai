using Microsoft.Web.WebView2.WinForms;
using System.Text;
using System.Text.Json;

namespace QiwaAssistant;

public class MainForm : Form
{
    readonly WebView2 web = new() { Dock = DockStyle.Fill };
    readonly TextBox output = new() { Dock = DockStyle.Fill, Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Both, Font = new Font("Segoe UI", 10), WordWrap = false };
    readonly ToolStrip tools = new() { GripStyle = ToolStripGripStyle.Hidden, RightToLeft = RightToLeft.Yes, AutoSize = true };
    readonly SplitContainer split = new() { Dock = DockStyle.Fill, Orientation = Orientation.Vertical, SplitterDistance = 1080 };
    readonly ToolStripTextBox iqamaBox = new() { Width = 125, ToolTipText = "رقم الإقامة" };
    readonly ToolStripComboBox monthsBox = new() { Width = 72, DropDownStyle = ComboBoxStyle.DropDownList };
    readonly ToolStripTextBox commandBox = new() { Width = 260, ToolTipText = "مثال: طلع المنتهية" };
    string lastExport = "";

    static readonly string[] DangerousWords = { "دفع", "ادفع", "اعتماد", "تأكيد الدفع", "pay", "submit payment", "confirm payment" };

    public MainForm()
    {
        Text = "مساعد قوى - Qiwa Assistant";
        Width = 1550; Height = 920;
        MinimumSize = new Size(1100, 700);
        RightToLeft = RightToLeft.Yes;
        RightToLeftLayout = true;

        monthsBox.Items.AddRange(new object[] { "3", "6", "9", "12" });
        monthsBox.SelectedItem = "12";

        AddButton("فتح قوى", async (_,__) => await GoQiwa());
        AddButton("رخص العمل", async (_,__) => await ClickByText(new[]{"رخص العمل","Work permits"}));
        tools.Items.Add(new ToolStripSeparator());
        AddButton("فحص الصفحة", async (_,__) => await ScanPage());
        AddButton("المنتهية", async (_,__) => await FindExpired());
        AddButton("خلال 90 يوم", async (_,__) => await FindExpiring());
        AddButton("تصدير CSV", (_,__) => ExportCsv());
        tools.Items.Add(new ToolStripSeparator());

        tools.Items.Add(new ToolStripLabel("الإقامة:")); tools.Items.Add(iqamaBox);
        AddButton("بحث", async (_,__) => await FindEmployee());
        tools.Items.Add(new ToolStripLabel("المدة:")); tools.Items.Add(monthsBox);
        AddButton("تجهيز تجديد", async (_,__) => await PrepareRenewal());
        AddButton("استخراج سداد", async (_,__) => await ExtractSadad());
        tools.Items.Add(new ToolStripSeparator());
        tools.Items.Add(new ToolStripLabel("أمر:")); tools.Items.Add(commandBox);
        AddButton("تنفيذ", async (_,__) => await ExecuteCommand());

        commandBox.KeyDown += async (_, e) => { if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; await ExecuteCommand(); } };
        iqamaBox.KeyDown += async (_, e) => { if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; await FindEmployee(); } };

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
        try
        {
            await web.EnsureCoreWebView2Async();
            web.CoreWebView2.Settings.AreDevToolsEnabled = false;
            web.CoreWebView2.Settings.IsPasswordAutosaveEnabled = false;
            web.CoreWebView2.Settings.IsGeneralAutofillEnabled = false;
            web.CoreWebView2.NavigationCompleted += (_,__) => SetStatus("تم تحميل الصفحة. إذا لم تكن مسجلًا، أكمل تسجيل الدخول/نفاذ بنفسك ثم استخدم الأدوات بالأعلى.");
            await GoQiwa();
        }
        catch (Exception ex)
        {
            SetStatus("تعذر تشغيل المتصفح المدمج. تأكد من وجود Microsoft Edge WebView2 Runtime.\r\n" + ex.Message);
        }
    }

    Task GoQiwa()
    {
        web.Source = new Uri("https://www.qiwa.sa/");
        return Task.CompletedTask;
    }

    void SetStatus(string text) => output.Text = text + "\r\n\r\nملاحظة أمان: البرنامج لا ينفذ الدفع أو الاعتماد النهائي تلقائيًا.";

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
          const rows=[...document.querySelectorAll('tr,[role=row],.card,[class*=card]')];
          const items=[];
          for(const r of rows){
            const tx=(r.innerText||'').replace(/\s+/g,' ').trim(); if(tx.length<8) continue;
            const iq=(tx.match(/\b[12]\d{9}\b/)||[])[0]||'';
            const ds=tx.match(/\b\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\b/g)||[];
            const status=/منتهي|منتهية|expired/i.test(tx)?'منتهية':(/ساري|سارية|valid/i.test(tx)?'سارية':'');
            if(iq||ds.length||status) items.push({iqama:iq,date:ds[0]||'',status,text:tx.slice(0,300)});
          }
          const unique=[]; const seen=new Set();
          for(const x of items){const k=x.iqama+'|'+x.date+'|'+x.text;if(!seen.has(k)){seen.add(k);unique.push(x)}}
          return JSON.stringify({title:document.title,url:location.href,items:unique.slice(0,500)});
        })()" );
        var decoded=Decode(raw);
        lastExport=decoded;
        try
        {
            using var doc=JsonDocument.Parse(decoded);
            var items=doc.RootElement.GetProperty("items");
            var sb=new StringBuilder();
            sb.AppendLine($"الصفحة: {doc.RootElement.GetProperty("title").GetString()}");
            sb.AppendLine($"تم العثور على {items.GetArrayLength()} سجل/صف ظاهر.\n");
            foreach(var x in items.EnumerateArray())
                sb.AppendLine($"{x.GetProperty("iqama").GetString(),-12} | {x.GetProperty("date").GetString(),-12} | {x.GetProperty("status").GetString(),-10} | {x.GetProperty("text").GetString()}");
            output.Text=sb.ToString();
        }
        catch { output.Text=decoded; }
    }

    async Task FindExpired()
    {
        var raw = await Js(@"(() => {
          const now=new Date(); now.setHours(0,0,0,0);
          const rows=[...document.querySelectorAll('tr,[role=row],.card,[class*=card]')],hits=[];
          for(const r of rows){
            const tx=(r.innerText||'').replace(/\s+/g,' ').trim(); if(!tx)continue;
            const m=tx.match(/\b(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\b/);
            let expired=/منتهي|منتهية|expired/i.test(tx);
            if(m){const d=new Date(+m[1],+m[2]-1,+m[3]);d.setHours(0,0,0,0);expired=expired||d<now}
            if(expired)hits.push(tx.slice(0,500));
          }
          return [...new Set(hits)].join('\n\n---\n\n') || 'لم أجد رخصًا منتهية في الصفحة الحالية. افتح صفحة رخص العمل/الموظفين ثم أعد المحاولة.';
        })()" );
        output.Text=Decode(raw);
    }

    async Task FindExpiring()
    {
        var raw=await Js(@"(() => {
          const now=new Date();now.setHours(0,0,0,0);const limit=new Date(now);limit.setDate(limit.getDate()+90);
          const rows=[...document.querySelectorAll('tr,[role=row],.card,[class*=card]')],hits=[];
          for(const r of rows){const tx=(r.innerText||'').replace(/\s+/g,' ').trim();const m=tx.match(/\b(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\b/);if(!m)continue;
            const d=new Date(+m[1],+m[2]-1,+m[3]);d.setHours(0,0,0,0);if(d>=now&&d<=limit)hits.push(tx.slice(0,500));}
          return [...new Set(hits)].join('\n\n---\n\n')||'لم أجد رخصًا تنتهي خلال 90 يومًا في الصفحة الحالية.';
        })()" );
        output.Text=Decode(raw);
    }

    async Task FindEmployee()
    {
        var iq=iqamaBox.Text.Trim();
        if(iq.Length<6){SetStatus("اكتب رقم الإقامة أولًا.");return;}
        var q=JsonSerializer.Serialize(iq);
        var raw=await Js($@"(() => {{const q={q};const all=[...document.querySelectorAll('tr,[role=row],.card,[class*=card],li')];const hit=all.find(x=>(x.innerText||'').includes(q));if(!hit)return 'لم أجد رقم الإقامة '+q+' في الصفحة الحالية.';hit.scrollIntoView({{behavior:'smooth',block:'center'}});hit.style.outline='4px solid #14b87a';return (hit.innerText||'').trim();}})()" );
        output.Text=Decode(raw);
    }

    async Task PrepareRenewal()
    {
        var iq=iqamaBox.Text.Trim(); var months=monthsBox.SelectedItem?.ToString()??"12";
        if(iq.Length<6){SetStatus("اكتب رقم إقامة العامل ثم اضغط تجهيز تجديد.");return;}
        var q=JsonSerializer.Serialize(iq); var m=JsonSerializer.Serialize(months);
        var raw=await Js($@"(() => {{
          const iq={q}, months={m};
          const row=[...document.querySelectorAll('tr,[role=row],.card,[class*=card]')].find(x=>(x.innerText||'').includes(iq));
          if(!row)return 'لم أجد العامل في الصفحة الحالية. افتح قائمة رخص العمل أولًا.';
          row.scrollIntoView({{behavior:'smooth',block:'center'}}); row.style.outline='4px solid #14b87a';
          const controls=[...row.querySelectorAll('button,a,[role=button]')];
          const renew=controls.find(x=>/تجديد|renew/i.test((x.innerText||'').trim()));
          if(renew) renew.click();
          setTimeout(()=>{{
            const selects=[...document.querySelectorAll('select')];
            for(const s of selects){{const opt=[...s.options].find(o=>(o.textContent||'').trim().startsWith(months));if(opt){{s.value=opt.value;s.dispatchEvent(new Event('change',{{bubbles:true}}));break;}}}}
            const radios=[...document.querySelectorAll('input[type=radio],button,[role=radio]')];
            const r=radios.find(x=>((x.innerText||x.getAttribute('aria-label')||'')+'').includes(months)); if(r)r.click();
          }},800);
          return `تم تحديد العامل ${{iq}} وتجهيز مسار التجديد لمدة ${{months}} شهرًا قدر الإمكان. راجع البيانات في قوى قبل المتابعة. لن يضغط المساعد الاعتماد أو الدفع النهائي.`;
        }})()" );
        output.Text=Decode(raw);
    }

    async Task ClickByText(string[] texts)
    {
        var json=JsonSerializer.Serialize(texts);
        var raw=await Js($@"(() => {{const targets={json};const els=[...document.querySelectorAll('a,button,[role=button]')];const e=els.find(x=>targets.some(t=>(x.innerText||'').trim().toLowerCase().includes(t.toLowerCase())));if(e){{e.click();return 'تم فتح: '+(e.innerText||'').trim();}}return 'لم أجد الزر في الصفحة الحالية.';}})()" );
        output.Text=Decode(raw);
    }

    async Task ExtractSadad()
    {
        var raw=await Js(@"(() => {
          const t=document.body?.innerText||'';const lines=t.split(/\n+/).map(x=>x.trim()).filter(Boolean);const hits=[];
          for(let i=0;i<lines.length;i++)if(/سداد|sadad|فاتورة|payment reference/i.test(lines[i]))hits.push(lines.slice(Math.max(0,i-2),Math.min(lines.length,i+4)).join(' | '));
          const pairs=[];for(const h of hits){const ns=h.match(/\b\d{6,20}\b/g)||[];for(const n of ns)pairs.push(n)}
          const nums=[...new Set(pairs)];
          return `المواضع المرتبطة بسداد:\n${[...new Set(hits)].join('\n')}\n\nأرقام محتملة لرقم سداد:\n${nums.join('\n')}\n\nطابق الرقم مع تفاصيل الطلب الظاهرة في قوى قبل الدفع.`;
        })()" );
        output.Text=Decode(raw);
    }

    async Task ExecuteCommand()
    {
        var c=commandBox.Text.Trim(); if(string.IsNullOrWhiteSpace(c))return;
        var low=c.ToLowerInvariant();
        if(DangerousWords.Any(x=>low.Contains(x.ToLowerInvariant()))) { SetStatus("لن أنفذ الدفع أو الاعتماد النهائي تلقائيًا. أقدر أوصلك إلى الخطوة التي قبله وأستخرج لك بيانات الطلب."); return; }
        var digits=new string(c.Where(char.IsDigit).ToArray()); if(digits.Length>=8) iqamaBox.Text=digits;
        if(low.Contains("منتهي")){await FindExpired();return;}
        if(low.Contains("90")||low.Contains("قريب")||low.Contains("تنتهي")){await FindExpiring();return;}
        if(low.Contains("سداد")){await ExtractSadad();return;}
        if(low.Contains("رخص")){await ClickByText(new[]{"رخص العمل","Work permits"});return;}
        if(low.Contains("جدد")||low.Contains("تجديد")){foreach(var m in new[]{"3","6","9","12"})if(low.Contains(m)){monthsBox.SelectedItem=m;break;}await PrepareRenewal();return;}
        if(digits.Length>=8){await FindEmployee();return;}
        if(low.Contains("فحص")||low.Contains("استخرج")){await ScanPage();return;}
        SetStatus("الأوامر المتاحة مثل: طلع المنتهية، الرخص خلال 90 يوم، افتح رخص العمل، ابحث 24xxxxxxxx، جدد 24xxxxxxxx 3 أشهر، استخرج رقم سداد.");
    }

    void ExportCsv()
    {
        if(string.IsNullOrWhiteSpace(lastExport)){MessageBox.Show("اضغط فحص الصفحة أولًا.","مساعد قوى");return;}
        try
        {
            using var doc=JsonDocument.Parse(lastExport);
            var sb=new StringBuilder("iqama,date,status,text\r\n");
            foreach(var x in doc.RootElement.GetProperty("items").EnumerateArray())
            {
                static string Csv(string? v)=>"\""+(v??"").Replace("\"","\"\"")+"\"";
                sb.AppendLine(string.Join(",",Csv(x.GetProperty("iqama").GetString()),Csv(x.GetProperty("date").GetString()),Csv(x.GetProperty("status").GetString()),Csv(x.GetProperty("text").GetString())));
            }
            using var d=new SaveFileDialog{Filter="CSV (*.csv)|*.csv",FileName="qiwa-permits.csv"};
            if(d.ShowDialog()==DialogResult.OK){File.WriteAllText(d.FileName,"\uFEFF"+sb.ToString(),Encoding.UTF8);MessageBox.Show("تم حفظ الملف.","مساعد قوى");}
        }
        catch(Exception ex){MessageBox.Show("تعذر التصدير: "+ex.Message,"مساعد قوى");}
    }
}
