using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using PaySlipStudio.Api.Models;

namespace PaySlipStudio.Api.Data;

public class ApplicationDbContext : IdentityDbContext<ApplicationUser>
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
        : base(options)
    {
    }

    public DbSet<CompanySettings> CompanySettings => Set<CompanySettings>();
    public DbSet<PayrollPeriod> PayrollPeriods => Set<PayrollPeriod>();
    public DbSet<Employee> Employees => Set<Employee>();
    public DbSet<ImportBatch> ImportBatches => Set<ImportBatch>();
    public DbSet<PayrollRecord> PayrollRecords => Set<PayrollRecord>();
    public DbSet<PayrollComponentValue> PayrollComponentValues => Set<PayrollComponentValue>();
    public DbSet<PayslipTemplate> PayslipTemplates => Set<PayslipTemplate>();
    public DbSet<GeneratedPayslipDocument> GeneratedPayslipDocuments => Set<GeneratedPayslipDocument>();
    public DbSet<EmailTemplate> EmailTemplates => Set<EmailTemplate>();
    public DbSet<EmailDeliveryAttempt> EmailDeliveryAttempts => Set<EmailDeliveryAttempt>();
    public DbSet<AuditLogEntry> AuditLogEntries => Set<AuditLogEntry>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<PayrollPeriod>(e =>
        {
            e.HasIndex(x => new { x.Year, x.Month }).IsUnique();
        });

        builder.Entity<Employee>(e =>
        {
            e.HasIndex(x => x.EmployeeCode).IsUnique();
            e.HasIndex(x => x.FullName);
        });

        builder.Entity<PayrollRecord>(e =>
        {
            e.HasIndex(x => new { x.PayrollPeriodId, x.EmployeeId }).IsUnique();
            e.HasOne(x => x.Employee)
                .WithMany(emp => emp.PayrollRecords)
                .HasForeignKey(x => x.EmployeeId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(x => x.PayrollPeriod)
                .WithMany(p => p.PayrollRecords)
                .HasForeignKey(x => x.PayrollPeriodId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<PayrollComponentValue>(e =>
        {
            e.HasIndex(x => new { x.PayrollRecordId, x.ComponentKey });
            e.HasOne(x => x.PayrollRecord)
                .WithMany(r => r.Components)
                .HasForeignKey(x => x.PayrollRecordId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<GeneratedPayslipDocument>(e =>
        {
            e.HasIndex(x => x.PayrollRecordId);
            e.HasOne(x => x.PayrollRecord)
                .WithMany(r => r.GeneratedDocuments)
                .HasForeignKey(x => x.PayrollRecordId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<EmailDeliveryAttempt>(e =>
        {
            e.HasIndex(x => x.PayrollRecordId);
            e.HasIndex(x => x.IdempotencyKey);
            e.HasOne(x => x.PayrollRecord)
                .WithMany(r => r.EmailAttempts)
                .HasForeignKey(x => x.PayrollRecordId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<AuditLogEntry>(e =>
        {
            e.HasIndex(x => x.TimestampUtc);
            e.HasIndex(x => x.ActionType);
        });
    }
}

