import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PledgeDto } from './dto/pledge.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProgressDto } from './dto/update-progress.dto';
import { CreateReportDto } from './dto/create-report.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async list(estateId: string) {
    const projects = await this.prisma.project.findMany({
      where: { estateId },
      include: { reports: { orderBy: { createdAt: 'asc' } } },
    });
    return projects.map((p) => ({
      ...this.summarize(p),
      mediaBase64: this.latestMedia(p, p.reports),
      reports: p.reports.map((r) => ({
        author: r.author,
        date: r.date,
        text: r.text,
        mediaBase64: r.mediaBase64,
      })),
    }));
  }

  async get(id: string, userId: string, estateId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, estateId },
      include: {
        budgetLines: true,
        reports: { orderBy: { createdAt: 'asc' } },
        donations: true,
        pledges: true,
        allocations: { select: { amount: true } },
        invoices: { where: { status: 'APPROVED' }, select: { amount: true } },
      },
    });
    if (!project) throw new NotFoundException('Project not found');

    const raised =
      project.baseRaised +
      project.donations.reduce((sum, d) => sum + d.amount, 0);
    const totalBudget = project.budgetLines.reduce(
      (sum, b) => sum + b.amount,
      0,
    );
    // Real estate-funded fields — what Finance has actually allocated and
    // spent via approved invoices, distinct from `budget`/`totalBudget`
    // above (a Project Admin's planned breakdown, entered by category).
    const allocated = project.allocations.reduce((sum, a) => sum + a.amount, 0);
    const spent = project.invoices.reduce((sum, i) => sum + i.amount, 0);
    const myDonated = project.donations
      .filter((d) => d.userId === userId)
      .reduce((sum, d) => sum + d.amount, 0);
    // Outstanding only — once a pledge is fulfilled it becomes a real
    // donation above, so counting it here too would double it up.
    const outstandingPledges = project.pledges.filter((p) => !p.fulfilledAt);
    const pledged = outstandingPledges.reduce((sum, p) => sum + p.amount, 0);
    const myPledged = outstandingPledges
      .filter((p) => p.userId === userId)
      .reduce((sum, p) => sum + p.amount, 0);

    return {
      ...this.summarize(project),
      mediaBase64: this.latestMedia(project, project.reports),
      description: project.description,
      budget: project.budgetLines.map((b) => ({
        label: b.label,
        amount: b.amount,
      })),
      totalBudget,
      allocated,
      spent,
      remaining: allocated - spent,
      reports: project.reports.map((r) => ({
        author: r.author,
        date: r.date,
        text: r.text,
        mediaBase64: r.mediaBase64,
      })),
      raised,
      goal: project.goal,
      raisedPct:
        project.goal > 0
          ? Math.min(100, Math.round((raised / project.goal) * 100))
          : 100,
      myDonated,
      pledged,
      myPledged,
    };
  }

  async pledge(userId: string, estateId: string, projectId: string, dto: PledgeDto) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, estateId },
    });
    if (!project) throw new NotFoundException('Project not found');
    // Completed projects take no new pledges — the UI hides the button, but
    // the API enforces it too so a stale client or direct call can't sneak one
    // in. Existing unfulfilled pledges stay visible as outstanding regardless.
    if (project.status === 'COMPLETED') {
      throw new ConflictException(
        'This project is already completed — pledges are closed.',
      );
    }

    await this.prisma.projectPledge.create({
      data: { projectId, userId, amount: dto.amount, estateId: project.estateId },
    });
    return { message: 'Thanks for your pledge!' };
  }

  listPledges(estateId: string, projectId: string) {
    return this.prisma.projectPledge.findMany({
      where: { projectId, estateId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { fullName: true, phone: true, house: true } } },
    });
  }

  /** A resident's own outstanding pledges across every project, for a home-screen reminder — fulfilled ones are already reflected as donations and need no further action. */
  async myPledges(userId: string) {
    const pledges = await this.prisma.projectPledge.findMany({
      where: { userId, fulfilledAt: null },
      orderBy: { createdAt: 'desc' },
      include: { project: { select: { id: true, title: true } } },
    });
    return pledges.map((p) => ({
      id: p.id,
      amount: p.amount,
      projectId: p.project.id,
      projectTitle: p.project.title,
    }));
  }

  async remindPledge(estateId: string, projectId: string, pledgeId: string) {
    const pledge = await this.findPledgeOrThrow(estateId, projectId, pledgeId);
    if (pledge.fulfilledAt) {
      throw new ConflictException('This pledge has already been fulfilled.');
    }

    await this.notifications.create(
      pledge.userId,
      `Reminder: you pledged ${this.formatNaira(pledge.amount)} to "${pledge.project.title}" — you can pay it whenever you're ready.`,
      'pledge-reminder',
    );
    await this.prisma.projectPledge.update({
      where: { id: pledgeId },
      data: { remindedAt: new Date() },
    });
    return { message: 'Reminder sent' };
  }

  /** Records the pledged amount as a real donation and marks the pledge fulfilled — the admin-confirmed "they actually paid" step. */
  async fulfillPledge(estateId: string, projectId: string, pledgeId: string) {
    const pledge = await this.findPledgeOrThrow(estateId, projectId, pledgeId);
    if (pledge.fulfilledAt) {
      throw new ConflictException('This pledge has already been fulfilled.');
    }

    await this.prisma.$transaction([
      this.prisma.projectDonation.create({
        data: { projectId, userId: pledge.userId, amount: pledge.amount, estateId: pledge.estateId },
      }),
      this.prisma.projectPledge.update({
        where: { id: pledgeId },
        data: { fulfilledAt: new Date() },
      }),
    ]);
    return { message: 'Pledge marked as fulfilled' };
  }

  private async findPledgeOrThrow(estateId: string, projectId: string, pledgeId: string) {
    const pledge = await this.prisma.projectPledge.findFirst({
      where: { id: pledgeId, projectId, estateId },
      include: { project: { select: { title: true } } },
    });
    if (!pledge) {
      throw new NotFoundException('Pledge not found');
    }
    return pledge;
  }

  private formatNaira(amount: number): string {
    return `₦${amount.toLocaleString('en-NG')}`;
  }

  async create(estateId: string, dto: CreateProjectDto) {
    const project = await this.prisma.project.create({
      data: {
        estateId,
        title: dto.title,
        description: dto.description,
        goal: dto.goal,
        status: 'IN_PROGRESS',
        progress: 0,
        baseRaised: 0,
        mediaBase64: dto.mediaBase64,
        budgetLines: { create: dto.budget.map((b) => ({ ...b, estateId })) },
      },
      include: { budgetLines: true },
    });
    await this.notifications.notifyProjectUpdate(project.estateId, project.title);
    return project;
  }

  async updateProgress(estateId: string, id: string, dto: UpdateProgressDto) {
    const project = await this.findTitleOrThrow(estateId, id);
    await this.prisma.project.update({
      where: { id },
      data: { progress: dto.progress, ...(dto.status && { status: dto.status }) },
    });
    await this.notifications.notifyProjectUpdate(project.estateId, project.title);
    return { message: 'Progress updated' };
  }

  async update(estateId: string, id: string, dto: CreateProjectDto) {
    const project = await this.findTitleOrThrow(estateId, id);
    await this.prisma.project.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        goal: dto.goal,
        ...(dto.mediaBase64 !== undefined && { mediaBase64: dto.mediaBase64 }),
        budgetLines: {
          deleteMany: {},
          create: dto.budget.map((b) => ({ ...b, estateId: project.estateId })),
        },
      },
    });
    await this.notifications.notifyProjectUpdate(project.estateId, project.title);
    return { message: 'Project updated' };
  }

  async remove(estateId: string, id: string) {
    await this.findTitleOrThrow(estateId, id);
    await this.prisma.project.delete({ where: { id } });
    return { message: 'Project deleted' };
  }

  async addReport(estateId: string, id: string, dto: CreateReportDto) {
    const project = await this.findTitleOrThrow(estateId, id);
    await this.prisma.projectReport.create({
      data: {
        projectId: id,
        estateId: project.estateId,
        author: dto.author,
        date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        text: dto.text,
        mediaBase64: dto.mediaBase64,
      },
    });
    await this.notifications.notifyProjectUpdate(project.estateId, project.title);
    return { message: 'Report added' };
  }

  private async findTitleOrThrow(estateId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, estateId },
      select: { title: true, estateId: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  /** The most recently posted report's media, falling back to the project's own cover media. */
  private latestMedia(
    project: { mediaBase64: string | null },
    reportsOldestFirst: { mediaBase64: string | null }[],
  ): string | null {
    for (let i = reportsOldestFirst.length - 1; i >= 0; i--) {
      if (reportsOldestFirst[i].mediaBase64) return reportsOldestFirst[i].mediaBase64;
    }
    return project.mediaBase64;
  }

  private summarize(project: {
    id: string;
    title: string;
    status: string;
    progress: number;
    mediaBase64: string | null;
    description: string;
    goal: number;
  }) {
    return {
      id: project.id,
      title: project.title,
      status: project.status,
      progress: project.progress,
      mediaBase64: project.mediaBase64,
      description: project.description,
      goal: project.goal,
    };
  }
}
