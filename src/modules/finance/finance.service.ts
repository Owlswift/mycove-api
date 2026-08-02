import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AllocateFundsDto } from './dto/allocate-funds.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  /**
   * Treasury income is derived, not stored: dues come from the ledger's
   * PAYMENT entries, levies from LevyPayment joined to Levy.amount (levies
   * paid via the resident's direct payLevy() shortcut never create a
   * Payment row, so the Payment table alone would undercount them).
   */
  private async computeTreasuryTotals() {
    const [duesTotal, levyPayments, allocationTotal] = await Promise.all([
      this.prisma.duesLedgerEntry.aggregate({
        where: { type: 'PAYMENT' },
        _sum: { amount: true },
      }),
      this.prisma.levyPayment.findMany({
        include: { levy: { select: { amount: true } } },
      }),
      this.prisma.projectAllocation.aggregate({ _sum: { amount: true } }),
    ]);

    const duesCollected = duesTotal._sum.amount ?? 0;
    const levyCollected = levyPayments.reduce(
      (sum, lp) => sum + lp.levy.amount,
      0,
    );
    const totalAllocated = allocationTotal._sum.amount ?? 0;
    const totalCollected = duesCollected + levyCollected;

    return {
      duesCollected,
      levyCollected,
      totalCollected,
      totalAllocated,
      treasuryBalance: totalCollected - totalAllocated,
    };
  }

  private async remainingBudget(projectId: string): Promise<number> {
    const [allocations, approvedInvoices] = await Promise.all([
      this.prisma.projectAllocation.aggregate({
        where: { projectId },
        _sum: { amount: true },
      }),
      this.prisma.invoice.aggregate({
        where: { projectId, status: 'APPROVED' },
        _sum: { amount: true },
      }),
    ]);
    return (
      (allocations._sum.amount ?? 0) - (approvedInvoices._sum.amount ?? 0)
    );
  }

  /** Per-project allocated/spent/remaining, plus resident-facing fundraising (donated/pledged) — safe for Project Admin. */
  async projectBudgets() {
    const projects = await this.prisma.project.findMany({
      select: {
        id: true,
        title: true,
        baseRaised: true,
        allocations: { select: { amount: true } },
        invoices: { where: { status: 'APPROVED' }, select: { amount: true } },
        donations: { select: { amount: true } },
        pledges: { select: { amount: true, fulfilledAt: true } },
      },
    });

    return projects.map((p) => {
      const allocated = p.allocations.reduce((s, a) => s + a.amount, 0);
      const spent = p.invoices.reduce((s, i) => s + i.amount, 0);
      const donated =
        p.baseRaised + p.donations.reduce((s, d) => s + d.amount, 0);
      // Outstanding only — a fulfilled pledge is counted in `donated` above.
      const pledged = p.pledges
        .filter((pl) => !pl.fulfilledAt)
        .reduce((s, pl) => s + pl.amount, 0);
      return {
        id: p.id,
        title: p.title,
        allocated,
        spent,
        remaining: allocated - spent,
        donated,
        pledged,
      };
    });
  }

  async summary() {
    const totals = await this.computeTreasuryTotals();
    const projectBreakdown = await this.projectBudgets();
    const totalDonated = projectBreakdown.reduce((s, p) => s + p.donated, 0);
    const totalPledged = projectBreakdown.reduce((s, p) => s + p.pledged, 0);

    return { ...totals, totalDonated, totalPledged, projects: projectBreakdown };
  }

  async allocate(financeSecretaryId: string, dto: AllocateFundsDto) {
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
    });
    if (!project) throw new NotFoundException('Project not found');

    const { treasuryBalance } = await this.computeTreasuryTotals();
    if (dto.amount > treasuryBalance) {
      throw new BadRequestException(
        `Insufficient treasury balance. Available: ${treasuryBalance}.`,
      );
    }

    await this.prisma.projectAllocation.create({
      data: {
        projectId: dto.projectId,
        amount: dto.amount,
        allocatedById: financeSecretaryId,
        note: dto.note,
      },
    });
    return { message: 'Funds allocated.' };
  }

  listInvoices() {
    return this.prisma.invoice.findMany({
      include: {
        project: { select: { title: true } },
        raisedBy: { select: { fullName: true } },
        reviewedBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async raiseInvoice(projectAdminId: string, dto: CreateInvoiceDto) {
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
    });
    if (!project) throw new NotFoundException('Project not found');

    return this.prisma.invoice.create({
      data: {
        projectId: dto.projectId,
        amount: dto.amount,
        description: dto.description,
        vendor: dto.vendor,
        raisedById: projectAdminId,
      },
    });
  }

  async approveInvoice(financeSecretaryId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== 'PENDING') {
      throw new ConflictException('This invoice has already been reviewed.');
    }

    const remaining = await this.remainingBudget(invoice.projectId);
    if (invoice.amount > remaining) {
      throw new BadRequestException(
        `Insufficient allocated budget for this project. Remaining: ${remaining}.`,
      );
    }

    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'APPROVED',
        reviewedById: financeSecretaryId,
        reviewedAt: new Date(),
      },
    });
  }

  async rejectInvoice(financeSecretaryId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== 'PENDING') {
      throw new ConflictException('This invoice has already been reviewed.');
    }

    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'REJECTED',
        reviewedById: financeSecretaryId,
        reviewedAt: new Date(),
      },
    });
  }
}
