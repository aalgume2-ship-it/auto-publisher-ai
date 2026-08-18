using System.Text.Json;

namespace QiwaAssistant;

public record ScheduledEmployee(string Name, string Iqama, DateTime ExpiryDate, int LeadDays, DateTime ActionDate, string Status = "scheduled");

public sealed class ScheduleStore
{
    readonly string filePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "QiwaAssistant", "schedule.json");
    readonly object gate = new();

    public List<ScheduledEmployee> Load()
    {
        lock (gate)
        {
            try
            {
                if (!File.Exists(filePath)) return new();
                return JsonSerializer.Deserialize<List<ScheduledEmployee>>(File.ReadAllText(filePath)) ?? new();
            }
            catch { return new(); }
        }
    }

    public void Save(IEnumerable<ScheduledEmployee> items)
    {
        lock (gate)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(filePath)!);
            File.WriteAllText(filePath, JsonSerializer.Serialize(items, new JsonSerializerOptions { WriteIndented = true }));
        }
    }

    public int ImportCsv(string csv, int leadDays)
    {
        var lines = csv.Replace("\r", "").Split('\n', StringSplitOptions.RemoveEmptyEntries);
        if (lines.Length < 2) return 0;
        var headers = SplitCsv(lines[0]);
        int idxName = Find(headers, "الاسم", "name", "employee");
        int idxIqama = Find(headers, "رقم الإقامة", "الاقامة", "الإقامة", "iqama", "iqama number");
        int idxExpiry = Find(headers, "تاريخ انتهاء الإقامة", "انتهاء الإقامة", "تاريخ انتهاء الرخصة", "permit_expiry", "expiry", "expiry date");
        if (idxIqama < 0 || idxExpiry < 0) return 0;

        var map = Load().ToDictionary(x => x.Iqama, StringComparer.OrdinalIgnoreCase);
        var count = 0;
        for (int i = 1; i < lines.Length; i++)
        {
            var cols = SplitCsv(lines[i]);
            if (idxIqama >= cols.Count || idxExpiry >= cols.Count) continue;
            var iqama = cols[idxIqama].Trim();
            var name = idxName >= 0 && idxName < cols.Count ? cols[idxName].Trim() : iqama;
            if (string.IsNullOrWhiteSpace(iqama) || !TryParseDate(cols[idxExpiry], out var expiry)) continue;
            var lead = Math.Max(0, leadDays);
            var action = expiry.Date.AddDays(-lead);
            map[iqama] = new ScheduledEmployee(name, iqama, expiry.Date, lead, action, action.Date <= DateTime.Today ? "due" : "scheduled");
            count++;
        }
        Save(map.Values.OrderBy(x => x.ActionDate));
        return count;
    }

    public List<ScheduledEmployee> Due(DateTime? date = null)
    {
        var d = (date ?? DateTime.Now).Date;
        return Load().Where(x => x.ActionDate.Date <= d && x.Status != "done").OrderBy(x => x.ActionDate).ToList();
    }

    public List<ScheduledEmployee> Month(int year, int month) => Load()
        .Where(x => x.ActionDate.Year == year && x.ActionDate.Month == month)
        .OrderBy(x => x.ActionDate).ToList();

    public void UpdateLeadDays(int leadDays)
    {
        var lead = Math.Max(0, leadDays);
        Save(Load().Select(x => x with { LeadDays = lead, ActionDate = x.ExpiryDate.Date.AddDays(-lead), Status = x.ExpiryDate.Date.AddDays(-lead) <= DateTime.Today ? "due" : "scheduled" }));
    }

    static int Find(List<string> headers, params string[] names)
    {
        for (int i = 0; i < headers.Count; i++)
            if (names.Any(n => headers[i].Trim().Equals(n, StringComparison.OrdinalIgnoreCase))) return i;
        return -1;
    }

    static bool TryParseDate(string value, out DateTime date)
    {
        value = value.Trim();
        var formats = new[] { "yyyy-MM-dd", "yyyy/MM/dd", "dd/MM/yyyy", "d/M/yyyy", "dd-MM-yyyy", "d-M-yyyy" };
        return DateTime.TryParseExact(value, formats, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out date)
            || DateTime.TryParse(value, out date);
    }

    static List<string> SplitCsv(string line)
    {
        var result = new List<string>(); var cur = new System.Text.StringBuilder(); bool quoted = false;
        for (int i = 0; i < line.Length; i++)
        {
            var c = line[i];
            if (c == '"') { if (quoted && i + 1 < line.Length && line[i + 1] == '"') { cur.Append('"'); i++; } else quoted = !quoted; }
            else if (c == ',' && !quoted) { result.Add(cur.ToString()); cur.Clear(); }
            else cur.Append(c);
        }
        result.Add(cur.ToString()); return result;
    }
}
