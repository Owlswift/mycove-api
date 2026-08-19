import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';

import { normalizePhone } from '../src/common/utils/normalize-phone';

const connectionString = process.env.DATABASE_URL;
const adapter = new PrismaPg(connectionString!);
const prisma = new PrismaClient({ adapter });

// A second, independent estate used purely to verify cross-estate isolation:
// every scoped endpoint should return zero rows from here when called by a
// Palm Court (PALM001) user, and vice versa.
async function main() {
  const estate = await prisma.estate.upsert({
    where: { code: 'SUNR001' },
    update: {},
    create: { code: 'SUNR001', name: 'Sunrise Gardens Estate' },
  });
  const estateId = estate.id;

  const residentPasswordHash = await argon2.hash('sunrise123');
  const guardPasswordHash = await argon2.hash('sunriseguard123');
  const adminPasswordHash = await argon2.hash('sunriseadmin123');
  const financePasswordHash = await argon2.hash('sunrisefinance123');

  const resident = await prisma.user.upsert({
    where: { phone: normalizePhone('08099998801') },
    update: { passwordHash: residentPasswordHash, mustResetPassword: false },
    create: {
      estateId,
      phone: normalizePhone('08099998801'),
      passwordHash: residentPasswordHash,
      role: 'RESIDENT',
      fullName: 'Bola Fashola',
      house: 'Villa 2',
    },
  });

  const guard = await prisma.user.upsert({
    where: { phone: normalizePhone('08099998802') },
    update: { passwordHash: guardPasswordHash },
    create: {
      estateId,
      phone: normalizePhone('08099998802'),
      passwordHash: guardPasswordHash,
      role: 'GUARD',
      fullName: 'Emeka Nwachukwu',
    },
  });

  await prisma.user.upsert({
    where: { phone: normalizePhone('08099998803') },
    update: { passwordHash: adminPasswordHash, mustResetPassword: false },
    create: {
      estateId,
      phone: normalizePhone('08099998803'),
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      fullName: 'Sunrise Admin',
      mustResetPassword: false,
    },
  });

  await prisma.user.upsert({
    where: { phone: normalizePhone('08099998804') },
    update: { passwordHash: financePasswordHash, mustResetPassword: false },
    create: {
      estateId,
      phone: normalizePhone('08099998804'),
      passwordHash: financePasswordHash,
      role: 'FINANCE_SECRETARY',
      fullName: 'Amaka Eze',
      mustResetPassword: false,
    },
  });

  await prisma.announcement.upsert({
    where: { id: 'sunr-a1' },
    update: {},
    create: {
      id: 'sunr-a1',
      estateId,
      title: 'Sunrise Gardens Pool Maintenance',
      category: 'Maintenance',
      body: 'The estate pool will be closed for maintenance this weekend.',
    },
  });

  await prisma.meeting.upsert({
    where: { id: 'sunr-m1' },
    update: {},
    create: {
      id: 'sunr-m1',
      estateId,
      title: 'Sunrise Gardens AGM',
      date: 'Fri, 14 Aug 2026',
      time: '4:00 PM',
      location: 'Clubhouse',
      agenda: ['Budget review'],
      scheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const project = await prisma.project.upsert({
    where: { id: 'sunr-p1' },
    update: {},
    create: {
      id: 'sunr-p1',
      estateId,
      title: 'Sunrise Gardens Solar Lighting',
      status: 'IN_PROGRESS',
      progress: 30,
      description: 'Installing solar-powered street lighting.',
      goal: 500000,
      baseRaised: 100000,
    },
  });
  await prisma.projectBudgetLine.deleteMany({ where: { projectId: project.id } });
  await prisma.projectBudgetLine.createMany({
    data: [{ projectId: project.id, estateId, label: 'Solar panels', amount: 800000 }],
  });

  await prisma.duesSettings.upsert({
    where: { estateId },
    update: {},
    create: { estateId, monthlyAmount: 30000 },
  });

  await prisma.levy.upsert({
    where: { id: 'sunr-lv1' },
    update: {},
    create: {
      id: 'sunr-lv1',
      estateId,
      label: 'Sunrise Security Levy',
      amount: 12000,
      dueDate: '1 Sep',
      year: 2026,
    },
  });

  await prisma.visitorPass.deleteMany({ where: { residentId: resident.id } });
  await prisma.visitorPass.create({
    data: {
      residentId: resident.id,
      estateId,
      name: 'Sunrise Visitor',
      phone: '0700 000 0000',
      code: '900001',
      createdAt: new Date(),
      validUntil: new Date(Date.now() + 2 * 60 * 60 * 1000),
    },
  });

  console.log('Second estate seed complete (Sunrise Gardens Estate — SUNR001).');
  console.log('  Resident login: 08099998801 / sunrise123');
  console.log('  Guard login:    08099998802 / sunriseguard123');
  console.log('  Admin login:    08099998803 / sunriseadmin123');
  console.log('  Finance login:  08099998804 / sunrisefinance123');
  console.log('  Visitor pass code: 900001');
  void guard;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
