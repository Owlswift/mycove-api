import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { DonateDto } from './dto/donate.dto';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async list() {
    const projects = await this.prisma.project.findMany();
    return projects.map((p) => this.summarize(p));
  }

  async get(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { budgetLines: true, reports: true, donations: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    const raised =
      project.baseRaised +
      project.donations.reduce((sum, d) => sum + d.amount, 0);
    const totalBudget = project.budgetLines.reduce(
      (sum, b) => sum + b.amount,
      0,
    );

    return {
      ...this.summarize(project),
      description: project.description,
      budget: project.budgetLines.map((b) => ({
        label: b.label,
        amount: b.amount,
      })),
      totalBudget,
      reports: project.reports.map((r) => ({
        author: r.author,
        date: r.date,
        text: r.text,
      })),
      raised,
      goal: project.goal,
      raisedPct:
        project.goal > 0
          ? Math.min(100, Math.round((raised / project.goal) * 100))
          : 100,
    };
  }

  async donate(userId: string, projectId: string, dto: DonateDto) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('Project not found');

    await this.prisma.projectDonation.create({
      data: { projectId, userId, amount: dto.amount },
    });
    return { message: 'Thank you for your donation!' };
  }

  private summarize(project: {
    id: string;
    title: string;
    status: string;
    progress: number;
  }) {
    return {
      id: project.id,
      title: project.title,
      status: project.status,
      progress: project.progress,
    };
  }
}
