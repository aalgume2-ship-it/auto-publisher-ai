using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Web.WebView2.WinForms;

namespace QiwaAssistant;

public sealed class LocalBridge : IDisposable
{
    private readonly HttpListener _listener = new();
    private readonly WebView2 _web;
    private readonly CancellationTokenSource _cts = new();
    private Task? _loop;

    public LocalBridge(WebView2 web, int port = 37777)
    {
        _web = web;
        _listener.Prefixes.Add($"http://127.0.0.1:{port}/");
    }

    public void Start()
    {
        if (_listener.IsListening) return;
        _listener.Start();
        _loop = Task.Run(() => Loop(_cts.Token));
    }

    async Task Loop(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            HttpListenerContext ctx;
            try { ctx = await _listener.GetContextAsync(); }
            catch when (token.IsCancellationRequested) { break; }
            _ = Handle(ctx);
        }
    }

    async Task Handle(HttpListenerContext ctx)
    {
        var res = ctx.Response;
        res.Headers["Access-Control-Allow-Origin"] = "*";
        res.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
        res.Headers["Access-Control-Allow-Headers"] = "Content-Type";
        res.Headers["Access-Control-Allow-Private-Network"] = "true";
        if (ctx.Request.HttpMethod == "OPTIONS") { res.StatusCode = 204; res.Close(); return; }

        try
        {
            object payload = ctx.Request.Url?.AbsolutePath switch
            {
                "/health" => new { ok = true, page = _web.Source?.ToString() ?? "", title = await JsText("document.title") },
                "/sync" => await Snapshot(),
                "/expired" => await Filter("expired"),
                "/expiring" => await Filter("expiring"),
                "/find" => await Find(ctx.Request),
                _ => new { ok = false, error = "unknown_route" }
            };
            await Json(res, payload, 200);
        }
        catch (Exception ex)
        {
            await Json(res, new { ok = false, error = ex.Message }, 500);
        }
    }

    async Task<object> Find(HttpListenerRequest req)
    {
        var q = req.QueryString["iqama"]?.Trim() ?? "";
        if (q.Length < 6) return new { ok = false, error = "iqama_required" };
        var js = $@"(() => {{ const q={JsonSerializer.Serialize(q)}; const rows=[...document.querySelectorAll('tr,[role=row],.card,[class*=card],li')]; const r=rows.find(x=>(x.innerText||'').includes(q)); return r ? {{found:true,text:(r.innerText||'').replace(/\s+/g,' ').trim().slice(0,1000)}} : {{found:false}}; }})()";
        var raw = await Exec(js);
        return new { ok = true, result = DecodeJson(raw) };
    }

    async Task<object> Snapshot()
    {
        var js = @"(() => {
          const rows=[...document.querySelectorAll('tr,[role=row],.card,[class*=card]')];
          const out=[];
          for(const r of rows){
            const text=(r.innerText||'').replace(/\s+/g,' ').trim(); if(text.length<8) continue;
            const iqama=(text.match(/\b[12]\d{9}\b/)||[])[0]||'';
            const date=(text.match(/\b\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\b/)||[])[0]||'';
            const status=/منتهي|منتهية|expired/i.test(text)?'expired':(/ساري|سارية|valid/i.test(text)?'valid':'unknown');
            if(iqama||date||status!=='unknown') out.push({iqama,date,status,text:text.slice(0,500)});
          }
          return {title:document.title,url:location.href,items:out.slice(0,500)};
        })()";
        var raw = await Exec(js);
        return new { ok = true, result = DecodeJson(raw) };
    }

    async Task<object> Filter(string mode)
    {
        var days = mode == "expiring" ? 90 : -1;
        var js = $@"(() => {{
          const now=new Date(); now.setHours(0,0,0,0); const limit=new Date(now); limit.setDate(limit.getDate()+90);
          const rows=[...document.querySelectorAll('tr,[role=row],.card,[class*=card]')], out=[];
          for(const r of rows){{
            const text=(r.innerText||'').replace(/\s+/g,' ').trim(); if(!text) continue;
            const iqama=(text.match(/\b[12]\d{{9}}\b/)||[])[0]||'';
            const m=text.match(/\b(\d{{4}})[-\/](\d{{1,2}})[-\/](\d{{1,2}})\b/);
            let hit=false, date='';
            if(m){{ const d=new Date(+m[1],+m[2]-1,+m[3]); d.setHours(0,0,0,0); date=m[0]; hit={(mode=="expired" ? "d<now || /منتهي|منتهية|expired/i.test(text)" : "d>=now && d<=limit")}; }}
            else if({(mode=="expired" ? "/منتهي|منتهية|expired/i.test(text)" : "false")}) hit=true;
            if(hit) out.push({{iqama,date,text:text.slice(0,500)}});
          }}
          return out;
        }})()";
        var raw = await Exec(js);
        return new { ok = true, mode, result = DecodeJson(raw), days };
    }

    async Task<string> Exec(string js)
    {
        if (_web.CoreWebView2 is null) return "null";
        if (_web.InvokeRequired)
        {
            var tcs = new TaskCompletionSource<string>();
            _web.BeginInvoke(async () => {
                try { tcs.SetResult(await _web.CoreWebView2.ExecuteScriptAsync(js)); }
                catch (Exception ex) { tcs.SetException(ex); }
            });
            return await tcs.Task;
        }
        return await _web.CoreWebView2.ExecuteScriptAsync(js);
    }

    async Task<string> JsText(string expr)
    {
        var raw = await Exec(expr);
        try { return JsonSerializer.Deserialize<string>(raw) ?? ""; } catch { return raw; }
    }

    static object? DecodeJson(string raw)
    {
        try
        {
            if (raw.StartsWith("\"") && raw.EndsWith("\"")) raw = JsonSerializer.Deserialize<string>(raw) ?? "null";
            return JsonSerializer.Deserialize<object>(raw);
        }
        catch { return raw; }
    }

    static async Task Json(HttpListenerResponse res, object payload, int status)
    {
        res.StatusCode = status;
        res.ContentType = "application/json; charset=utf-8";
        var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(payload));
        res.ContentLength64 = bytes.Length;
        await res.OutputStream.WriteAsync(bytes);
        res.Close();
    }

    public void Dispose()
    {
        _cts.Cancel();
        try { _listener.Stop(); } catch { }
        _listener.Close();
    }
}
