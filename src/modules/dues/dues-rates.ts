import { PrismaService } from '../../database/prisma.service';
import { RateBook, RateEntry } from './dues-calc';

/** The estate's whole rate history as a RateBook, ready to price any month. */
export async function loadRateBook(prisma: PrismaService, estateId: string): Promise<RateBook> {
  const rows = await prisma.duesRate.findMany({ where: { estateId } });
  const entries: RateEntry[] = rows.map((r) => ({
    residentType: r.residentType,
    monthlyAmount: r.monthlyAmount,
    effectiveMonth: r.effectiveMonth,
    createdAt: r.createdAt,
  }));
  return new RateBook(entries);
}
