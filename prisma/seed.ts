import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';

import { normalizePhone } from '../src/common/utils/normalize-phone';

const connectionString = process.env.DATABASE_URL;
const adapter = new PrismaPg(connectionString!);
const prisma = new PrismaClient({ adapter });

// Seed data transcribed 1:1 from the MyCove Flutter app's
// lib/data/mock_data.dart, which itself mirrors the original MyCove.dc.html
// design mockup.
async function main() {
  const estate = await prisma.estate.upsert({
    where: { code: 'PALM001' },
    update: { address: 'Lekki Phase 1, Lagos', managedBy: 'Palm Court Association' },
    create: {
      code: 'PALM001',
      name: 'Palm Court Estate',
      address: 'Lekki Phase 1, Lagos',
      managedBy: 'Palm Court Association',
    },
  });
  const estateId = estate.id;

  const residentPasswordHash = await argon2.hash('estate123');
  const guardPasswordHash = await argon2.hash('guard123');
  const tempPasswordHash = await argon2.hash('temp1234');
  const adminPasswordHash = await argon2.hash('admin123');
  const financePasswordHash = await argon2.hash('finance123');
  const projectAdminPasswordHash = await argon2.hash('project123');

  // update: restores the demo password/flag on every reseed — otherwise
  // exercising login/reset flows during testing permanently drifts these
  // accounts away from their documented demo credentials.
  const resident = await prisma.user.upsert({
    where: { phone: normalizePhone('08035550142') },
    update: { passwordHash: residentPasswordHash, mustResetPassword: false },
    create: {
      estateId,
      phone: normalizePhone('08035550142'),
      passwordHash: residentPasswordHash,
      role: 'RESIDENT',
      fullName: 'Ifeoma Adebayo',
      house: 'Block C, Flat 4',
    },
  });

  // No real top-up gateway is wired up yet — seeded here so the wallet
  // ledger (debit-on-purchase, refund-on-late-failure) is testable end to
  // end without one. update:{} on reseed so a test run's spending doesn't
  // get silently topped back up every time you re-seed.
  await prisma.wallet.upsert({
    where: { userId: resident.id },
    update: {},
    create: { estateId, userId: resident.id, balance: 50000 },
  });

  const guard = await prisma.user.upsert({
    where: { phone: normalizePhone('08052229981') },
    update: { passwordHash: guardPasswordHash },
    create: {
      estateId,
      phone: normalizePhone('08052229981'),
      passwordHash: guardPasswordHash,
      role: 'GUARD',
      fullName: 'Musa Ibrahim',
    },
  });

  // Preserves the mockup's "Try temp1234 to preview first-time setup" demo path.
  await prisma.user.upsert({
    where: { phone: normalizePhone('08099990000') },
    update: { passwordHash: tempPasswordHash, mustResetPassword: true },
    create: {
      estateId,
      phone: normalizePhone('08099990000'),
      passwordHash: tempPasswordHash,
      role: 'RESIDENT',
      fullName: 'New Resident',
      house: 'Block A, Flat 1',
      mustResetPassword: true,
    },
  });

  // Bootstrap account for the admin web app — there's no self-registration,
  // so someone has to already be an admin to create the first real one.
  await prisma.user.upsert({
    where: { phone: normalizePhone('08000000001') },
    update: { passwordHash: adminPasswordHash, mustResetPassword: false },
    create: {
      estateId,
      phone: normalizePhone('08000000001'),
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      fullName: 'Estate Admin',
      mustResetPassword: false,
    },
  });

  await prisma.user.upsert({
    where: { phone: normalizePhone('08000000002') },
    update: { passwordHash: financePasswordHash, mustResetPassword: false },
    create: {
      estateId,
      phone: normalizePhone('08000000002'),
      passwordHash: financePasswordHash,
      role: 'FINANCE_SECRETARY',
      fullName: 'Chidinma Okafor',
      mustResetPassword: false,
    },
  });

  await prisma.user.upsert({
    where: { phone: normalizePhone('08000000003') },
    update: { passwordHash: projectAdminPasswordHash, mustResetPassword: false },
    create: {
      estateId,
      phone: normalizePhone('08000000003'),
      passwordHash: projectAdminPasswordHash,
      role: 'PROJECT_ADMIN',
      fullName: 'Tunde Balogun',
      mustResetPassword: false,
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
    await prisma.announcement.upsert({ where: { id: a.id }, update: {}, create: { ...a, estateId } });
  }

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  const q3Report = `Q3 GENERAL MEETING — PALM COURT ESTATE
Held Monday, 3 August 2026 at the Estate Hall, 5:00 PM

1. OPENING AND ATTENDANCE

The meeting was called to order at 5:07 PM by the Chairman, Chief Emeka Okonkwo, after the arrival and registration of 87 resident representatives from 52 of the 78 households in the estate. The Secretary, Mrs. Funmilayo Adeyemi, confirmed that a quorum was present. Opening prayers were led by Elder Paulinus Eze, and the minutes of the previous general meeting held on 27th July were reviewed and adopted as circulated.

2. Q2 FINANCIAL REVIEW

The Finance Secretary, Mr. Olumide Ajayi, presented the financial report for the second quarter of 2026. Total income for the quarter was ₦18,640,000. This comprises ₦12,285,000 in monthly service charge contributions, ₦2,400,000 from the Security Upgrade Levy, ₦1,400,000 from the Estate Anniversary Levy, and ₦2,555,000 in project pledges and other income.

Total expenditure for the quarter was ₦15,912,000. The major components include:
- Perimeter Fence Upgrade materials and supplier payments: ₦7,100,000 (as of the June drawdown)
- Borehole Water Treatment Plant equipment procurement: ₦4,100,000
- Security agency fees for the two new gate officers: ₦1,600,000
- Street lighting repairs and floodlight procurement for the eastern entrance: ₦450,000
- One-off generator servicing for the borehole pump house: ₦280,000
- Sundry office and event expenses: ₦382,000

The Finance Secretary drew the meeting's attention to the outstanding dues position. As at 31st July, nine households remain in arrears of two months or more. A revised dues reminder was issued on 1st August. A motion was raised and seconded to extend the late-fee waiver window by one week for households who pay in full on or before 12th August, to encourage further compliance. The motion was carried unanimously.

3. PERIMETER FENCE PROJECT UPDATE

The Project Administrator, Mr. Tunde Balogun, gave an update on the Perimeter Fence Upgrade. The northern and eastern sections now stand at 85% and 78% completion respectively, bringing the overall project to 72% complete. The rear access lane has received its new precast panels and razor wire, and the security presence at the rear gate has already begun to reduce unofficial entries.

The project has spent ₦5,100,000 to date against a ₦5,150,000 budget for materials. The balance is allocated to the installation of a new boom at the rear gate and a small CCTV housing adjacent to the guard post. The contractors have given a projected completion date of 25th September 2026, weather permitting.

A discussion followed regarding residents who park cars and store building materials along the eastern fence alignment in breach of the Construction and Materials Guideline. Management was directed to write to each affected household by 8th August requiring materials to be cleared before the next fencing crew visit on 12th August.

4. RESIDENT CONCERNS AND Q&A

A number of residents' concerns were raised and addressed:

(a) Generator noise from Block D, Unit 7. The resident had been spoken to and has agreed to a routine daytime servicing schedule and to fit a sound deadening cover. The committee will carry out a follow-up check on 10th August.

(b) Visitor pass system. Several homeowners said that guests arriving after the 10:00 PM pedestrian gate closing time are sometimes kept waiting at the vehicle gate. Security confirmed the vehicle gate is the only official after-hours access and that a valid pass remains the best way to speed an entry. A reminder is to be included in the next neighbourhood alert.

(c) Drainage blockage between Block C and the access road. The maintenance crew is to carry out desilting of the affected drain on 4th August and to report whether any underground structural issues are causing the repeated blockage.

(d) Playground safety. A parent raised concern about the worn safety mat beneath the swings. Management has already purchased replacement tiles and installation is planned for the weekend of 9th August.

5. RESOLUTIONS ADOPTED

The following resolutions were adopted by the meeting:

(i) Management is to issue a revised statement of accounts for the quarter to all households before 15th September 2026.
(ii) The Executive will pay the final instalment due on the fence project once the engineers certify the works as complete.
(iii) The monthly clean-up exercise is moved to the LAST Saturday of every month effective October 2026, with a special estate-wide clean-up on 29th August to take advantage of the school break.
(iv) Households keeping more than two vehicles on their property are to contact the management by 25th August 2026 in order to avoid a breach of the Parking Rules.

6. ANY OTHER BUSINESS

The establishment of an independent clinic at the estate entrance was discussed again. An exploratory sub-committee of three volunteers — Dr. Bisi Osemene, Engr. Jide Akande and Mr. Rotimi Akeredolu — was formed to survey residents by 2nd September and present a feasibility note to the committee.

Two households also announced upcoming naming ceremonies and religious harvest programmes; the caretaker was reminded that events in the Estate Hall must be booked through the admin office at least five working days in advance.

7. ADJOURNMENT

There being no further business, the meeting was adjourned at 6:38 PM.

Signed:
Mrs. Funmilayo Adeyemi
Secretary — Palm Court Estate Association`;

  const securityReport = `SECURITY COMMITTEE MEETING — PALM COURT ESTATE
Date: 30th July 2026 | Venue: Admin Office | Time: 6:30 PM

1. GATE STAFFING REVIEW

The gate roster for July was reviewed. The estate has two full-time day shift officers, two full-time night shift officers, with two relief personnel covering leave and weekends. It was observed that the weekend evening shift at the pedestrian gate was left uncovered on three Sundays in July. The Head of Security was directed to revise the roster so that these hours are covered going forward.

2. VISITOR PASS POLICY

The system for issuing and managing visitor passes was reviewed. The estate processes an average of 29 visitors per day, with about 3 overnight passes. Concern was raised about passes being scanned after they have expired. The committee agreed that guard posts will now have a laminated instruction card stating clearly: "No entry — pass must scan" to avoid confusion and to maintain consistency.

3. CCTV UPGRADE PROPOSAL

A proposal for an upgraded CCTV system was tabled: five new cameras at the three gate posts, the pump house and the administrative block, together with a new 16-channel recorder and one year of maintenance, quoted at ₦1,850,000. This amount can be met from the security fund reserve of ₦2,100,000, so no additional levy is proposed. Members agreed to forward the proposal to the Estate Management Committee for approval.

4. NEXT MEETING

The next meeting of this committee will be held on Thursday, 13th August 2026, at 6:30 PM at the Estate Hall.

Signed:
Mrs. Funmilayo Adeyemi
Secretary — Security Committee`;

  const meetings = [
    {
      id: 'm1',
      title: 'Q3 General Meeting',
      date: 'Mon, 3 Aug 2026',
      time: '5:00 PM',
      location: 'Estate Hall',
      agenda: ['Q2 financial review', 'Perimeter fence project update', 'Resident concerns & Q&A'],
      scheduledAt: new Date(now - 20 * day),
      report: q3Report,
    },
    {
      id: 'm2',
      title: 'Security Committee Meeting',
      date: 'Thu, 30 Jul 2026',
      time: '6:30 PM',
      location: 'Admin Office',
      agenda: ['Gate staffing review', 'Visitor pass policy', 'CCTV upgrade proposal'],
      scheduledAt: new Date(now - 24 * day),
      report: securityReport,
    },
  ];
  for (const m of meetings) {
    await prisma.meeting.upsert({
      where: { id: m.id },
      update: { report: m.report, scheduledAt: m.scheduledAt },
      create: { ...m, estateId },
    });
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
    await prisma.project.upsert({ where: { id: p.id }, update: {}, create: { ...projectData, estateId } });
    await prisma.projectBudgetLine.deleteMany({ where: { projectId: p.id } });
    await prisma.projectReport.deleteMany({ where: { projectId: p.id } });
    await prisma.projectBudgetLine.createMany({
      data: budget.map((b) => ({ ...b, projectId: p.id, estateId })),
    });
    await prisma.projectReport.createMany({
      data: reports.map((r) => ({ ...r, projectId: p.id, estateId })),
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
    data: notifications.map((n) => ({ ...n, userId: resident.id, estateId })),
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
    await prisma.poll.upsert({ where: { id: p.id }, update: {}, create: { ...pollData, estateId } });
    const existingOptions = await prisma.pollOption.findMany({ where: { pollId: p.id } });
    if (existingOptions.length === 0) {
      await prisma.pollOption.createMany({ data: options.map((o) => ({ ...o, pollId: p.id, estateId })) });
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
        data: { title: rulesSections[i].title, order: i, estateId },
      });
      await prisma.ruleItem.createMany({
        data: rulesSections[i].items.map((text, j) => ({ sectionId: section.id, text, order: j, estateId })),
      });
    }
  }

  await prisma.duesSettings.upsert({
    where: { estateId },
    update: {},
    create: { estateId, monthlyAmount: 45000 },
  });

  // Dues charges are computed on the fly from the calendar (see
  // computeDuesAccrual in dues.service.ts) rather than stored — only real
  // payments live in this ledger.
  const duesHistory = [
    { date: '3 Jun', desc: 'Dues Payment Received', type: 'PAYMENT' as const, amount: 45000 },
  ];
  await prisma.duesLedgerEntry.deleteMany({ where: { userId: resident.id } });
  await prisma.duesLedgerEntry.createMany({
    data: duesHistory.map((d) => ({ ...d, userId: resident.id, estateId })),
  });

  const levies = [
    { id: 'lv1', label: 'Christmas Decoration Levy', amount: 8000, dueDate: '15 Dec', year: 2026, paid: false },
    { id: 'lv2', label: 'Security Upgrade Levy', amount: 15000, dueDate: '30 Jul', year: 2026, paid: false },
    { id: 'lv3', label: 'Estate Anniversary Levy', amount: 5000, dueDate: '1 Jun', year: 2026, paid: true },
  ];
  for (const l of levies) {
    const { paid, ...levyData } = l;
    await prisma.levy.upsert({ where: { id: l.id }, update: {}, create: { ...levyData, estateId } });
    if (paid) {
      await prisma.levyPayment.upsert({
        where: { userId_levyId: { userId: resident.id, levyId: l.id } },
        update: {},
        create: { userId: resident.id, levyId: l.id, estateId },
      });
    }
  }

  await prisma.visitorPass.deleteMany({ where: { residentId: resident.id } });
  const activePass = await prisma.visitorPass.create({
    data: {
      residentId: resident.id,
      estateId,
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
      estateId,
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
      estateId,
      entryAt: new Date(now - 1 * day - 2 * 60 * 60 * 1000),
      exitAt: new Date(now - 1 * day),
    },
  });

  // Not estate-scoped — a national reference list, not per-estate data.
  // `code` matches VTpass's serviceID slugs; `shortCode` is the real-world
  // abbreviation shown in the app and doubles as the bundled logo asset's
  // filename (assets/discos/<shortCode lowercased>.png).
  const discos = [
    { code: 'ikeja-electric', shortCode: 'IKEDC', name: 'Ikeja Electricity', sortOrder: 1 },
    { code: 'eko-electric', shortCode: 'EKEDC', name: 'Eko Electricity', sortOrder: 2 },
    { code: 'abuja-electric', shortCode: 'AEDC', name: 'Abuja Electricity', sortOrder: 3 },
    { code: 'kano-electric', shortCode: 'KEDCO', name: 'Kano Electricity', sortOrder: 4 },
    { code: 'portharcourt-electric', shortCode: 'PHED', name: 'Port Harcourt Electricity', sortOrder: 5 },
    { code: 'jos-electric', shortCode: 'JEDC', name: 'Jos Electricity', sortOrder: 6 },
    { code: 'ibadan-electric', shortCode: 'IBEDC', name: 'Ibadan Electricity', sortOrder: 7 },
    { code: 'kaduna-electric', shortCode: 'KAEDCO', name: 'Kaduna Electricity', sortOrder: 8 },
    { code: 'enugu-electric', shortCode: 'EEDC', name: 'Enugu Electricity', sortOrder: 9 },
    { code: 'benin-electric', shortCode: 'BEDC', name: 'Benin Electricity', sortOrder: 10 },
    { code: 'aba-electric', shortCode: 'ABA', name: 'Aba Electricity', sortOrder: 11 },
    { code: 'yola-electric', shortCode: 'YEDC', name: 'Yola Electricity', sortOrder: 12 },
  ];
  for (const d of discos) {
    await prisma.electricityDisco.upsert({
      where: { code: d.code },
      update: { shortCode: d.shortCode, name: d.name, sortOrder: d.sortOrder, active: true },
      create: d,
    });
  }

  const platformAdminPasswordHash = await argon2.hash('platform123');
  await prisma.platformAdmin.upsert({
    where: { email: 'super@mycove.ng' },
    update: { passwordHash: platformAdminPasswordHash },
    create: {
      email: 'super@mycove.ng',
      passwordHash: platformAdminPasswordHash,
      fullName: 'Platform Super Admin',
    },
  });

  console.log('Seed complete.');
  console.log('  Resident login: 08035550142 / estate123');
  console.log('  Guard login:    08052229981 / guard123');
  console.log('  Force-reset demo login: 08099990000 / temp1234');
  console.log('  Admin login:    08000000001 / admin123');
  console.log('  Finance Secretary login: 08000000002 / finance123');
  console.log('  Project Admin login:     08000000003 / project123');
  console.log('  Platform Super Admin login: super@mycove.ng / platform123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });