using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PaySlipStudio.Api.Data;
using PaySlipStudio.Api.Models;

namespace PaySlipStudio.Api.Services;

public class AuditService
{
    private readonly ApplicationDbContext _db;

    public AuditService(ApplicationDbContext db)
    {
        _db = db;
    }

    public async Task RecordAsync(
        string actorUserId,
        string actorUserName,
        string actorRole,
        string actionType,
        string entityType,
        string entityId,
        string summary,
        object? beforeValues = null,
        object? afterValues = null,
        string? ipAddress = null)
    {
        var entry = new AuditLogEntry
        {
            TimestampUtc = DateTime.UtcNow,
            ActorUserId = actorUserId ?? "system",
            ActorUserName = string.IsNullOrWhiteSpace(actorUserName) ? "System" : actorUserName,
            ActorRole = string.IsNullOrWhiteSpace(actorRole) ? "System" : actorRole,
            ActionType = actionType,
            EntityType = entityType,
            EntityId = entityId,
            Summary = summary,
            BeforeValuesJson = beforeValues != null ? JsonSerializer.Serialize(beforeValues) : null,
            AfterValuesJson = afterValues != null ? JsonSerializer.Serialize(afterValues) : null,
            IpAddress = ipAddress
        };

        _db.AuditLogEntries.Add(entry);
        await _db.SaveChangesAsync();
    }

    public async Task<List<AuditLogEntry>> QueryAsync(string? actionFilter = null, string? search = null, int limit = 200)
    {
        var query = _db.AuditLogEntries.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(actionFilter) && actionFilter != "All")
        {
            query = query.Where(x => x.ActionType.StartsWith(actionFilter));
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(x =>
                x.Summary.ToLower().Contains(term) ||
                x.ActorUserName.ToLower().Contains(term) ||
                x.EntityId.ToLower().Contains(term) ||
                x.ActionType.ToLower().Contains(term));
        }

        return await query
            .OrderByDescending(x => x.TimestampUtc)
            .Take(Math.Clamp(limit, 1, 500))
            .ToListAsync();
    }
}

