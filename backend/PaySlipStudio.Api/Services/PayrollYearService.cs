using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using PaySlipStudio.Api.Data;
using PaySlipStudio.Api.Models;

namespace PaySlipStudio.Api.Services;

public record PayrollYearsDto(
    int ActiveYear,
    int ActiveMonth,
    List<int> AvailableYears,
    List<int> ImportCandidateYears,
    List<PayrollYearSummaryDto> Summaries
);

public record PayrollYearSummaryDto(
    int Year,
    int MonthsWithRecords,
    int TotalEmployees,
    decimal TotalNetPayroll
);

public interface IPayrollYearService
{
    Task<PayrollYearsDto> GetAvailableYearsAsync(bool forceRefresh = false);
    void InvalidateCache();
}

public class PayrollYearService : IPayrollYearService
{
    private readonly ApplicationDbContext _db;
    private readonly ILogger<PayrollYearService> _logger;

    private static volatile PayrollYearsDto? _cachedYears;
    private static DateTime _cacheExpiresAtUtc = DateTime.MinValue;
    private static readonly object _cacheLock = new();

    public PayrollYearService(ApplicationDbContext db, ILogger<PayrollYearService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public void InvalidateCache()
    {
        lock (_cacheLock)
        {
            _cachedYears = null;
            _cacheExpiresAtUtc = DateTime.MinValue;
        }
        _logger.LogInformation("PayrollYearService cache invalidated.");
    }

    public async Task<PayrollYearsDto> GetAvailableYearsAsync(bool forceRefresh = false)
    {
        if (!forceRefresh && _cachedYears != null && DateTime.UtcNow < _cacheExpiresAtUtc)
        {
            return _cachedYears;
        }

        try
        {
            var settings = await _db.CompanySettings.AsNoTracking().FirstOrDefaultAsync() ?? new CompanySettings();
            int activeYear = settings.ActivePayrollYear > 0 ? settings.ActivePayrollYear : DateTime.UtcNow.Year;
            int activeMonth = (settings.ActivePayrollMonth >= 1 && settings.ActivePayrollMonth <= 12) 
                ? settings.ActivePayrollMonth 
                : DateTime.UtcNow.Month;

            // 1. Years from database PayrollPeriods that have actual records
            var periodsWithData = await _db.PayrollPeriods
                .AsNoTracking()
                .Include(p => p.PayrollRecords)
                .Where(p => p.PayrollRecords.Any() || p.Year > 0)
                .ToListAsync();

            // 2. Years from committed ImportBatches
            var batches = await _db.ImportBatches
                .AsNoTracking()
                .Where(b => b.Status == "Committed")
                .ToListAsync();

            var yearsSet = new HashSet<int> { 2025, 2026, 2027 };

            // Always add active year
            if (activeYear > 0)
            {
                yearsSet.Add(activeYear);
            }

            foreach (var p in periodsWithData)
            {
                if (p.Year >= 2000 && p.Year <= 2100)
                {
                    yearsSet.Add(p.Year);
                }
            }

            foreach (var b in batches)
            {
                if (b.PayrollYear.HasValue && b.PayrollYear.Value >= 2000 && b.PayrollYear.Value <= 2100)
                {
                    yearsSet.Add(b.PayrollYear.Value);
                }
            }

            // If empty, seed current year
            if (yearsSet.Count == 0)
            {
                yearsSet.Add(DateTime.UtcNow.Year);
            }

            var availableYears = yearsSet.OrderByDescending(y => y).ToList();

            // 3. Compute summaries for each available year
            var summaries = new List<PayrollYearSummaryDto>();
            foreach (var y in availableYears)
            {
                var yearPeriods = periodsWithData.Where(p => p.Year == y).ToList();
                int monthsWithRecords = yearPeriods.Count(p => p.PayrollRecords.Any());
                int totalEmployees = yearPeriods.Sum(p => p.PayrollRecords.Count);
                decimal totalNet = yearPeriods.Sum(p => p.PayrollRecords.Sum(r => (r.OverrideNetSalary ?? r.ImportedNetSalary) ?? 0m));

                summaries.Add(new PayrollYearSummaryDto(y, monthsWithRecords, totalEmployees, totalNet));
            }

            // 4. Candidate years for import selection (covers existing years + upcoming/historical years)
            int maxYear = Math.Max(DateTime.UtcNow.Year + 5, availableYears.Max() + 2);
            int minYear = Math.Min(2020, availableYears.Min() - 1);

            var candidateYears = new List<int>();
            for (int yr = maxYear; yr >= minYear; yr--)
            {
                candidateYears.Add(yr);
            }

            var dto = new PayrollYearsDto(
                ActiveYear: activeYear,
                ActiveMonth: activeMonth,
                AvailableYears: availableYears,
                ImportCandidateYears: candidateYears,
                Summaries: summaries
            );

            lock (_cacheLock)
            {
                _cachedYears = dto;
                _cacheExpiresAtUtc = DateTime.UtcNow.AddMinutes(2); // Short cache for performance with freshness
            }

            return dto;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to resolve dynamic payroll years. Falling back to defaults.");
            int currentYear = DateTime.UtcNow.Year;
            var fallback = new PayrollYearsDto(
                ActiveYear: currentYear,
                ActiveMonth: DateTime.UtcNow.Month,
                AvailableYears: new List<int> { currentYear, currentYear - 1 },
                ImportCandidateYears: Enumerable.Range(currentYear - 5, 10).Reverse().ToList(),
                Summaries: new List<PayrollYearSummaryDto>()
            );
            return fallback;
        }
    }
}
