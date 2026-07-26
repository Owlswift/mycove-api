import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';

const connectionString = process.env.DATABASE_URL;
const adapter = new PrismaPg(connectionString!);
const prisma = new PrismaClient({ adapter });

// Seed data transcribed 1:1 from the CommunityHub Flutter app's
// lib/data/mock_data.dart, which itself mirrors the original CommunityHub.dc.html
// design mockup.
async function main() {
  const residentPasswordHash = await argon2.hash('estate123');
  const guardPasswordHash = await argon2.hash('guard123');
  const tempPasswordHash = await argon2.hash('temp1234');

  // update: restores the demo password/flag on every reseed — otherwise
  // exercising login/reset flows during testing permanently drifts these
  // accounts away from their documented demo credentials.
  const resident = await prisma.user.upsert({
    where: { phone: '08035550142' },
    update: { passwordHash: residentPasswordHash, mustResetPassword: false },
    create: {
      phone: '08035550142',
      passwordHash: residentPasswordHash,
      role: 'RESIDENT',
      fullName: 'Ifeoma Adebayo',
      house: 'Block C, Flat 4',
    },
  });

  const guard = await prisma.user.upsert({
    where: { phone: '08052229981' },
    update: { passwordHash: guardPasswordHash },
    create: {
      phone: '08052229981',
      passwordHash: guardPasswordHash,
      role: 'GUARD',
      fullName: 'Musa Ibrahim',
    },
  });

  // Preserves the mockup's "Try temp1234 to preview first-time setup" demo path.
  await prisma.user.upsert({
    where: { phone: '08099990000' },
    update: { passwordHash: tempPasswordHash, mustResetPassword: true },
    create: {
      phone: '08099990000',
      passwordHash: tempPasswordHash,
      role: 'RESIDENT',
      fullName: 'New Resident',
      house: 'Block A, Flat 1',
      mustResetPassword: true,
    },
  });

  const announcements = [
    {
      id: 'a1',
      title: 'Water Tank Cleaning This Saturday',
      category: 'Maintenance',
      body: 'The estate management will carry out scheduled water tank cleaning on Saturday, 27 July, from 8:00 AM to 12:00 PM. Water supply will be temporarily unavailable. Please store enough water in advance.',
    },
    {
      id: 'a2',
      title: 'Dues for August Now Due',
      category: 'Finance',
      body: 'August service charge invoices have been issued. Kindly settle outstanding balances before 5 August to avoid a 5% late fee. Pay directly from the Dues tab.',
    },
    {
      id: 'a3',
      title: 'Updated Visitor Gate Hours',
      category: 'Security',
      body: 'Effective immediately, the pedestrian gate closes at 10:00 PM daily. Visitors arriving after this time should use the main vehicle gate with a valid pass.',
    },
    {
      id: 'a4',
      title: 'General Meeting Rescheduled',
      category: 'Announcement',
      body: 'The Q3 general meeting has moved from 27 July to 3 August, 5:00 PM at the Estate Hall. See the Meetings tab for details.',
    },
  ];
  for (const a of announcements) {
    await prisma.announcement.upsert({ where: { id: a.id }, update: {}, create: a });
  }

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const meetings = [
    {
      id: 'm1',
      title: 'Q3 General Meeting',
      date: 'Mon, 3 Aug 2026',
      time: '5:00 PM',
      location: 'Estate Hall',
      agenda: ['Q2 financial review', 'Perimeter fence project update', 'Resident concerns & Q&A'],
      scheduledAt: new Date(now + 9 * day),
    },
    {
      id: 'm2',
      title: 'Security Committee Meeting',
      date: 'Thu, 30 Jul 2026',
      time: '6:30 PM',
      location: 'Admin Office',
      agenda: ['Gate staffing review', 'Visitor pass policy', 'CCTV upgrade proposal'],
      scheduledAt: new Date(now + 5 * day),
    },
  ];
  for (const m of meetings) {
    await prisma.meeting.upsert({ where: { id: m.id }, update: {}, create: m });
  }

  const projects = [
    {
      id: 'p1',
      title: 'Perimeter Fence Upgrade',
      status: 'IN_PROGRESS' as const,
      progress: 72,
      description: "Reinforcing the estate's northern and eastern perimeter with 8ft fencing and razor wire.",
      goal: 1500000,
      baseRaised: 620000,
      budget: [
        { label: 'Fencing materials', amount: 3200000 },
        { label: 'Razor wire & fittings', amount: 850000 },
        { label: 'Labour', amount: 1100000 },
      ],
      reports: [
        {
          author: 'Finance Secretary',
          date: '19 Jul',
          text: 'Eastern section fencing 80% complete. ₦4.1M of the ₦5.15M budget disbursed to date.',
        },
      ],
    },
    {
      id: 'p2',
      title: 'Borehole Water Treatment Plant',
      status: 'IN_PROGRESS' as const,
      progress: 40,
      description: 'Installing a treatment plant to improve water quality across all blocks.',
      goal: 2000000,
      baseRaised: 410000,
      budget: [
        { label: 'Treatment equipment', amount: 4500000 },
        { label: 'Piping & installation', amount: 1800000 },
        { label: 'Permits', amount: 250000 },
      ],
      reports: [
        {
          author: 'Finance Secretary',
          date: '10 Jul',
          text: 'Equipment procurement complete. Installation begins first week of August.',
        },
      ],
    },
    {
      id: 'p3',
      title: 'Estate Road Resurfacing',
      status: 'COMPLETED' as const,
      progress: 100,
      description: 'Resurfacing of all internal roads, completed ahead of the rainy season.',
      goal: 0,
      baseRaised: 0,
      budget: [
        { label: 'Asphalt & materials', amount: 6200000 },
        { label: 'Labour & equipment hire', amount: 1400000 },
      ],
      reports: [
        {
          author: 'Finance Secretary',
          date: '2 Jul',
          text: 'Project closed under budget by ₦180,000, refunded to the general reserve.',
        },
      ],
    },
  ];
  for (const p of projects) {
    const { budget, reports, ...projectData } = p;
    await prisma.project.upsert({ where: { id: p.id }, update: {}, create: projectData });
    await prisma.projectBudgetLine.deleteMany({ where: { projectId: p.id } });
    await prisma.projectReport.deleteMany({ where: { projectId: p.id } });
    await prisma.projectBudgetLine.createMany({
      data: budget.map((b) => ({ ...b, projectId: p.id })),
    });
    await prisma.projectReport.createMany({
      data: reports.map((r) => ({ ...r, projectId: p.id })),
    });
  }

  const notifications = [
    {
      title: 'New announcement: Water Tank Cleaning This Saturday',
      type: 'announcement',
      createdAt: new Date(now - 3 * 60 * 60 * 1000),
    },
    {
      title: 'Reminder: Security Committee Meeting tomorrow at 6:30 PM',
      type: 'meeting',
      createdAt: new Date(now - 1 * day),
    },
    { title: 'Visitor checked in — Chioma Nwosu', type: 'visitor', createdAt: new Date(now - 1 * day) },
    {
      title: 'Project updated — Perimeter Fence Upgrade now 72% complete',
      type: 'project',
      createdAt: new Date(now - 2 * day),
    },
    {
      title: 'Dues payment successful — receipt available',
      type: 'payment',
      createdAt: new Date(now - 3 * day),
    },
  ];
  await prisma.notification.deleteMany({ where: { userId: resident.id } });
  await prisma.notification.createMany({
    data: notifications.map((n) => ({ ...n, userId: resident.id })),
  });

  const polls = [
    {
      id: 'po1',
      question: 'Should we install speed bumps on the inner road?',
      closesAt: new Date(now + 3 * day),
      options: [
        { label: 'Yes, all sections', baseVotes: 62 },
        { label: 'Only near the playground', baseVotes: 21 },
        { label: 'No, not needed', baseVotes: 9 },
      ],
    },
    {
      id: 'po2',
      question: 'Preferred day for monthly compound clean-up?',
      closesAt: new Date(now + 6 * day),
      options: [
        { label: 'First Saturday', baseVotes: 34 },
        { label: 'Last Saturday', baseVotes: 40 },
        { label: 'Sunday morning', baseVotes: 18 },
      ],
    },
  ];
  for (const p of polls) {
    const { options, ...pollData } = p;
    await prisma.poll.upsert({ where: { id: p.id }, update: {}, create: pollData });
    const existingOptions = await prisma.pollOption.findMany({ where: { pollId: p.id } });
    if (existingOptions.length === 0) {
      await prisma.pollOption.createMany({ data: options.map((o) => ({ ...o, pollId: p.id })) });
    }
  }
  // Reset so the demo resident always starts able to vote — otherwise a
  // vote cast during testing persists forever across reseeds.
  await prisma.pollVote.deleteMany({ where: { userId: resident.id } });

  const rulesSections = [
    {
      title: 'Security & Access',
      items: [
        'All visitors must have a valid pass — QR or 6-digit code — before entry.',
        'Do not share gate codes; report a lost pass immediately.',
        'The pedestrian gate closes at 10:00 PM; use the vehicle gate after hours.',
      ],
    },
    {
      title: 'Noise & Conduct',
      items: ['Quiet hours are 10:00 PM–6:00 AM.', 'Generators must be switched off by 11:00 PM.'],
    },
    {
      title: 'Parking',
      items: ['Park only within your assigned slot.', 'No overnight parking on internal roads.'],
    },
    {
      title: 'Waste & Environment',
      items: ['Household waste goes out only on collection days.', 'No dumping in undeveloped plots or drains.'],
    },
    {
      title: 'Dues & Levies',
      items: [
        'Service charge is due on the 5th of every month.',
        'A 5% late fee applies after the due date.',
        'Special levies require majority resident approval at a general meeting.',
      ],
    },
  ];
  const existingSections = await prisma.rulesSection.findMany();
  if (existingSections.length === 0) {
    for (let i = 0; i < rulesSections.length; i++) {
      const section = await prisma.rulesSection.create({
        data: { title: rulesSections[i].title, order: i },
      });
      await prisma.ruleItem.createMany({
        data: rulesSections[i].items.map((text, j) => ({ sectionId: section.id, text, order: j })),
      });
    }
  }

  const duesHistory = [
    { date: '1 Jul', desc: 'July Service Charge', type: 'CHARGE' as const, amount: 45000 },
    { date: '3 Jun', desc: 'Payment Received', type: 'PAYMENT' as const, amount: 45000 },
    { date: '1 Jun', desc: 'June Service Charge', type: 'CHARGE' as const, amount: 45000 },
  ];
  await prisma.duesLedgerEntry.deleteMany({ where: { userId: resident.id } });
  await prisma.duesLedgerEntry.createMany({
    data: duesHistory.map((d) => ({ ...d, userId: resident.id })),
  });

  const levies = [
    { id: 'lv1', label: 'Christmas Decoration Levy', amount: 8000, dueDate: '15 Dec', paid: false },
    { id: 'lv2', label: 'Security Upgrade Levy', amount: 15000, dueDate: '30 Jul', paid: false },
    { id: 'lv3', label: 'Estate Anniversary Levy', amount: 5000, dueDate: '1 Jun', paid: true },
  ];
  for (const l of levies) {
    const { paid, ...levyData } = l;
    await prisma.levy.upsert({ where: { id: l.id }, update: {}, create: levyData });
    if (paid) {
      await prisma.levyPayment.upsert({
        where: { userId_levyId: { userId: resident.id, levyId: l.id } },
        update: {},
        create: { userId: resident.id, levyId: l.id },
      });
    }
  }

  await prisma.visitorPass.deleteMany({ where: { residentId: resident.id } });
  const activePass = await prisma.visitorPass.create({
    data: {
      residentId: resident.id,
      name: 'Tunde Bakare',
      phone: '0701 234 5678',
      plate: 'LND 442 KJ',
      code: '482913',
      createdAt: new Date(now - 2 * 60 * 60 * 1000),
      validUntil: new Date(now + 2 * 60 * 60 * 1000),
    },
  });
  const expiredPass = await prisma.visitorPass.create({
    data: {
      residentId: resident.id,
      name: 'Chioma Nwosu',
      phone: '0812 987 6543',
      code: '116607',
      createdAt: new Date(now - 1 * day - 3 * 60 * 60 * 1000),
      validUntil: new Date(now - 1 * day),
    },
  });
  void activePass;

  await prisma.accessLogEntry.deleteMany({ where: { visitorPassId: expiredPass.id } });
  await prisma.accessLogEntry.create({
    data: {
      visitorPassId: expiredPass.id,
      guardId: guard.id,
      entryAt: new Date(now - 1 * day - 2 * 60 * 60 * 1000),
      exitAt: new Date(now - 1 * day),
    },
  });

  console.log('Seed complete.');
  console.log('  Resident login: 08035550142 / estate123');
  console.log('  Guard login:    08052229981 / guard123');
  console.log('  Force-reset demo login: 08099990000 / temp1234');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
