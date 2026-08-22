import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AllocateFundsDto } from './dto/allocate-funds.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { computeDuesAccrual, DuesService } from '../dues/dues.service';

@Injectable()
export class FinanceService {
  constructor(
    private prisma: PrismaService,
    private dues: DuesService,
  ) {}

  async getDuesRate(estateId: string) {
    return { monthlyAmount: await this.dues.getMonthlyDuesAmount(estateId) };
  }

  setDuesRate(estateId: string, monthlyAmount: number) {
    return this.dues.setMonthlyDuesAmount(estateId, monthlyAmount);
  }

  /**
   * Treasury income is derived, not stored: dues come from the ledger's
   * PAYMENT entries, levies from LevyPayment joined to Levy.amount (levies
   * paid via the resident's direct payLevy() shortcut never create a
   * Payment row, so the Payment table alone would undercount them).
   */
  private async computeTreasuryTotals(estateId: string) {
    const [duesTotal, levyPayments, allocationTotal] = await Promise.all([
      this.prisma.duesLedgerEntry.aggregate({
        where: { type: 'PAYMENT', estateId },
        _sum: { amount: true },
      }),
      this.prisma.levyPayment.findMany({
        where: { estateId },
        include: { levy: { select: { amount: true } } },
      }),
      this.prisma.projectAllocation.aggregate({ where: { estateId }, _sum: { amount: true } }),
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
  async projectBudgets(estateId: string) {
    const projects = await this.prisma.project.findMany({
      where: { estateId },
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

  async summary(estateId: string) {
    const totals = await this.computeTreasuryTotals(estateId);
    const projectBreakdown = await this.projectBudgets(estateId);
    const totalDonated = projectBreakdown.reduce((s, p) => s + p.donated, 0);
    const totalPledged = projectBreakdown.reduce((s, p) => s + p.pledged, 0);

    return { ...totals, totalDonated, totalPledged, projects: projectBreakdown };
  }

  async allocate(estateId: string, financeSecretaryId: string, dto: AllocateFundsDto) {
    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, estateId },
    });
    if (!project) throw new NotFoundException('Project not found');

    const { treasuryBalance } = await this.computeTreasuryTotals(estateId);
    if (dto.amount > treasuryBalance) {
      throw new BadRequestException(
        `Insufficient treasury balance. Available: ${treasuryBalance}.`,
      );
    }

    await this.prisma.projectAllocation.create({
      data: {
        projectId: dto.projectId,
        estateId: project.estateId,
        amount: dto.amount,
        allocatedById: financeSecretaryId,
        note: dto.note,
      },
    });
    return { message: 'Funds allocated.' };
  }

  listInvoices(estateId: string) {
    return this.prisma.invoice.findMany({
      where: { estateId },
      include: {
        project: { select: { title: true } },
        raisedBy: { select: { fullName: true } },
        reviewedBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async raiseInvoice(estateId: string, projectAdminId: string, dto: CreateInvoiceDto) {
    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, estateId },
    });
    if (!project) throw new NotFoundException('Project not found');

    return this.prisma.invoice.create({
      data: {
        projectId: dto.projectId,
        estateId: project.estateId,
        amount: dto.amount,
        description: dto.description,
        vendor: dto.vendor,
        mediaBase64: dto.mediaBase64,
        raisedById: projectAdminId,
      },
    });
  }

  async approveInvoice(estateId: string, financeSecretaryId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, estateId },
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

  async rejectInvoice(estateId: string, financeSecretaryId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, estateId },
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

  /** Per-resident dues balance and payment progress for a given fiscal year, plus estate-wide totals — the roster Finance uses to see who's paid, who hasn't, and how much that adds up to. Levies are a separate, per-purpose thing — see residentLevies(). */
  async residentDues(estateId: string, year: number) {
    const [residents, duesPayments, monthlyAmount] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: 'RESIDENT', estateId, duesLiable: true },
        select: { id: true, fullName: true, house: true, phone: true, createdAt: true },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.duesLedgerEntry.findMany({
        where: { type: 'PAYMENT', estateId },
        select: { userId: true, amount: true, createdAt: true },
      }),
      this.dues.getMonthlyDuesAmount(estateId),
    ]);

    const paymentsByUser = new Map<string, { amount: number; createdAt: Date }[]>();
    for (const payment of duesPayments) {
      const list = paymentsByUser.get(payment.userId) ?? [];
      list.push(payment);
      paymentsByUser.set(payment.userId, list);
    }

    const residentRows = residents.map((r) => {
      const accrual = computeDuesAccrual(r.createdAt, paymentsByUser.get(r.id) ?? [], monthlyAmount, year);
      return {
        id: r.id,
        fullName: r.fullName,
        house: r.house,
        phone: r.phone,
        duesBalance: accrual.balance,
        monthsPaid: accrual.monthsPaid,
        accrued: accrual.accrued,
        paid: accrual.paid,
      };
    });

    const totals = residentRows.reduce(
      (acc, r) => ({
        expected: acc.expected + r.accrued,
        collected: acc.collected + r.paid,
        outstanding: acc.outstanding + r.duesBalance,
      }),
      { expected: 0, collected: 0, outstanding: 0 },
    );

    return {
      monthlyAmount,
      totals,
      residents: residentRows.map(({ accrued, paid, ...rest }) => rest),
    };
  }

  async recordDuesPayment(estateId: string, residentId: string, amount: number, note?: string, mediaBase64?: string) {
    const resident = await this.prisma.user.findFirst({ where: { id: residentId, estateId } });
    if (!resident) throw new NotFoundException('Resident not found');
    return this.dues.recordManualDuesPayment(residentId, amount, note, mediaBase64);
  }

  /** Collection stats per one-off levy (e.g. a Christmas decoration fund) raised in a given fiscal year — distinct from recurring dues above. Each levy carries its own resident-level paid/unpaid breakdown for drill-down. */
  async residentLevies(estateId: string, year: number) {
    const [residents, levies, levyPayments] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: 'RESIDENT', estateId, duesLiable: true },
        select: { id: true, fullName: true, house: true },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.levy.findMany({ where: { year, estateId }, orderBy: { dueDate: 'asc' } }),
      this.prisma.levyPayment.findMany({ where: { estateId }, select: { userId: true, levyId: true, mediaBase64: true } }),
    ]);

    const paymentByUserAndLevy = new Map<string, { mediaBase64: string | null }>();
    for (const lp of levyPayments) {
      paymentByUserAndLevy.set(`${lp.userId}:${lp.levyId}`, { mediaBase64: lp.mediaBase64 });
    }

    const leviesWithStats = levies.map((l) => {
      const residentStatuses = residents.map((r) => {
        const payment = paymentByUserAndLevy.get(`${r.id}:${l.id}`);
        return {
          id: r.id,
          fullName: r.fullName,
          house: r.house,
          paid: payment !== undefined,
          mediaBase64: payment?.mediaBase64 ?? null,
        };
      });
      const paidCount = residentStatuses.filter((r) => r.paid).length;
      const unpaidCount = residents.length - paidCount;
      return {
        id: l.id,
        label: l.label,
        amount: l.amount,
        dueDate: l.dueDate,
        year: l.year,
        totalResidents: residents.length,
        paidCount,
        unpaidCount,
        collected: paidCount * l.amount,
        outstanding: unpaidCount * l.amount,
        residents: residentStatuses,
      };
    });

    const totals = leviesWithStats.reduce(
      (acc, l) => ({
        expected: acc.expected + l.totalResidents * l.amount,
        collected: acc.collected + l.collected,
        outstanding: acc.outstanding + l.outstanding,
      }),
      { expected: 0, collected: 0, outstanding: 0 },
    );

    return { totalResidents: residents.length, totals, levies: leviesWithStats };
  }

  createLevy(estateId: string, dto: { label: string; amount: number; dueDate: string; year: number }) {
    return this.dues.createLevy(estateId, dto);
  }

  deleteLevy(estateId: string, id: string) {
    return this.dues.deleteLevy(estateId, id);
  }

  /** Finance Secretary marking a resident's levy paid on their behalf — same off-platform reconciliation need as recordDuesPayment. */
  async recordLevyPayment(estateId: string, residentId: string, levyId: string, mediaBase64?: string) {
    const resident = await this.prisma.user.findFirst({ where: { id: residentId, estateId } });
    if (!resident) throw new NotFoundException('Resident not found');
    return this.dues.payLevy(residentId, estateId, levyId, mediaBase64);
  }
}
