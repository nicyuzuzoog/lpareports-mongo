import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import {
  DEFAULT_SETTINGS,
  computeTotal,
  gradeFor,
  assessmentCompetency
} from '../src/lib/grading.js';

const prisma = new PrismaClient();

const CLASSES = [
  { name: 'Baby Class', level: 'NURSERY' },
  { name: 'Middle Class', level: 'NURSERY' },
  { name: 'Top Class', level: 'NURSERY' },
  { name: 'P.1', level: 'LOWER_PRIMARY' },
  { name: 'P.2', level: 'LOWER_PRIMARY' },
  { name: 'P.3', level: 'LOWER_PRIMARY' },
  { name: 'P.4', level: 'UPPER_PRIMARY' },
  { name: 'P.5', level: 'UPPER_PRIMARY' },
  { name: 'P.6', level: 'UPPER_PRIMARY' },
  { name: 'P.7', level: 'UPPER_PRIMARY' }
];

const SUBJECTS = [
  { name: 'Language Development', code: 'LANG', levels: ['NURSERY'], position: 1 },
  { name: 'Numbers & Counting', code: 'NUM', levels: ['NURSERY'], position: 2 },
  { name: 'Reading & Writing', code: 'R&W', levels: ['NURSERY'], position: 3 },
  { name: 'Creative Arts', code: 'ART', levels: ['NURSERY'], position: 4 },
  { name: 'Health & Habits', code: 'HLTH', levels: ['NURSERY'], position: 5 },
  { name: 'Social Development', code: 'SOC', levels: ['NURSERY'], position: 6 },
  { name: 'Swahili', code: 'SWA', levels: ['NURSERY', 'LOWER_PRIMARY', 'UPPER_PRIMARY'], position: 7 },
  { name: 'English', code: 'ENG', levels: ['LOWER_PRIMARY', 'UPPER_PRIMARY'], position: 1 },
  { name: 'Mathematics', code: 'MATH', levels: ['LOWER_PRIMARY', 'UPPER_PRIMARY'], position: 2 },
  { name: 'Literacy', code: 'LIT', levels: ['LOWER_PRIMARY'], position: 3 },
  { name: 'Reading', code: 'READ', levels: ['LOWER_PRIMARY'], position: 4 },
  { name: 'Writing', code: 'WRIT', levels: ['LOWER_PRIMARY'], position: 5 },
  { name: 'Science', code: 'SCI', levels: ['LOWER_PRIMARY', 'UPPER_PRIMARY'], position: 6 },
  { name: 'Social Studies', code: 'SST', levels: ['LOWER_PRIMARY', 'UPPER_PRIMARY'], position: 7 },
  {
    name: 'Religious Education',
    code: 'RE',
    levels: ['LOWER_PRIMARY', 'UPPER_PRIMARY'],
    position: 8
  },
  { name: 'ICT', code: 'ICT', levels: ['LOWER_PRIMARY', 'UPPER_PRIMARY'], position: 9 },
  { name: 'Agriculture', code: 'AGR', levels: ['UPPER_PRIMARY'], position: 10 },
  { name: 'Music, Dance and Drama', code: 'MDD', levels: ['UPPER_PRIMARY'], position: 11 },
  { name: 'Physical Education', code: 'PE', levels: ['UPPER_PRIMARY'], position: 12 }
];

const STUDENT_NAMES = [
  ['Aisha', 'Nabirye'],
  ['Brian', 'Okello'],
  ['Cynthia', 'Namutebi'],
  ['Daniel', 'Mugisha'],
  ['Esther', 'Achieng'],
  ['Farouk', 'Ssemwanga'],
  ['Grace', 'Atim'],
  ['Hakim', 'Kizza'],
  ['Irene', 'Nakato'],
  ['Joel', 'Byaruhanga'],
  ['Kevin', 'Otieno'],
  ['Lydia', 'Nansubuga'],
  ['Martin', 'Tumusiime'],
  ['Nadia', 'Nakimuli'],
  ['Oscar', 'Odongo'],
  ['Patience', 'Auma'],
  ['Quinton', 'Ssekandi'],
  ['Rita', 'Nabukenya'],
  ['Samuel', 'Wasswa'],
  ['Teddy', 'Nalubega'],
  ['Umar', 'Kakooza'],
  ['Vivian', 'Nakalema'],
  ['Wilson', 'Ochieng'],
  ['Xenia', 'Nabatanzi'],
  ['Yusuf', 'Mukasa'],
  ['Zara', 'Namatovu'],
  ['Aaron', 'Kibet'],
  ['Betty', 'Nakiganda'],
  ['Charles', 'Ouma'],
  ['Doreen', 'Nakamya'],
  ['Edwin', 'Ssentongo'],
  ['Faith', 'Akello'],
  ['Godfrey', 'Mubiru'],
  ['Harriet', 'Nabukalu'],
  ['Isaac', 'Omondi'],
  ['Janet', 'Nakayiza'],
  ['Kato', 'Ssemakula'],
  ['Lilian', 'Nabirye'],
  ['Moses', 'Kaggwa'],
  ['Nancy', 'Amino'],
  ['Peter', 'Ocen'],
  ['Rehema', 'Nansamba'],
  ['Simon', 'Walusimbi'],
  ['Tracy', 'Nakato'],
  ['Uganda', 'Mukasa'],
  ['Vera', 'Nabulya'],
  ['Wasswa', 'Kizito'],
  ['Yasmin', 'Nabukeera'],
  ['Zachary', 'Okumu'],
  ['Agnes', 'Nakabugo'],
  ['Ben', 'Ssekabira'],
  ['Clara', 'Nabbanja'],
  ['Duncan', 'Mugerwa'],
  ['Eunice', 'Nakimera'],
  ['Fred', 'Kato'],
  ['Gloria', 'Nakintu'],
  ['Henry', 'Ssemujju'],
  ['Ivy', 'Nabaggala']
];

const DEMO_CLASSES = ['Top Class', 'P.1', 'P.4', 'P.7'];

function fakeScore(seed) {
  const value = 32 + ((seed * 7919 + 11) % 61);
  return Math.min(98, Math.max(18, value));
}

async function main() {
  console.log('Seeding LPACAMIS...');

  await prisma.setting.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, ...DEFAULT_SETTINGS }
  });

  const classes = {};
  for (const item of CLASSES) {
    classes[item.name] = await prisma.schoolClass.upsert({
      where: { name: item.name },
      update: { level: item.level },
      create: item
    });
  }

  const subjects = {};
  for (const item of SUBJECTS) {
    subjects[item.code] = await prisma.subject.upsert({
      where: { code: item.code },
      update: { name: item.name, levels: item.levels, position: item.position },
      create: item
    });
  }

  const password = async (value) => bcrypt.hash(value, 10);
  const users = [
    {
      name: 'Super Admin',
      email: 'superadmin@lpacamis.ac.ug',
      phone: '+256 700 100 100',
      role: 'SUPER_ADMIN',
      password: 'Admin@1234',
      canDelete: true
    },
    {
      name: 'Ms. Sarah Namusoke',
      email: 'dos@lpacamis.ac.ug',
      phone: '+256 700 100 101',
      role: 'DOS',
      password: 'Dos@12345',
      canDelete: false
    },
    {
      name: 'Mr. Robert Ssekandi',
      email: 'head@lpacamis.ac.ug',
      phone: '+256 700 100 102',
      role: 'HEAD_TEACHER',
      password: 'Head@12345',
      canDelete: false
    },
    {
      name: 'Ms. Josephine Nakiwala',
      email: 'teacher@lpacamis.ac.ug',
      phone: '+256 700 100 103',
      role: 'TEACHER',
      password: 'Teacher@123',
      classNames: ['P.1', 'P.4'],
      subjectCodes: ['ENG', 'MATH', 'SWA']
    },
    {
      name: 'Mr. Emmanuel Okiror',
      email: 'teacher2@lpacamis.ac.ug',
      phone: '+256 700 100 104',
      role: 'TEACHER',
      password: 'Teacher@123',
      classNames: ['P.2', 'P.5'],
      subjectCodes: ['ENG', 'MATH', 'SCI']
    },
    {
      name: 'Ms. Daphne Nakato',
      email: 'teacher3@lpacamis.ac.ug',
      phone: '+256 700 100 105',
      role: 'TEACHER',
      password: 'Teacher@123',
      classNames: ['Baby Class', 'Middle Class', 'Top Class'],
      subjectCodes: ['LANG', 'NUM', 'R&W']
    },
    {
      name: 'Mr. Isaac Mugerwa',
      email: 'teacher4@lpacamis.ac.ug',
      phone: '+256 700 100 106',
      role: 'TEACHER',
      password: 'Teacher@123',
      classNames: ['P.3', 'P.7'],
      subjectCodes: ['SCI', 'SST', 'RE']
    }
  ];

  const userRecords = {};
  for (const item of users) {
    const existing = await prisma.user.findUnique({ where: { email: item.email } });
    const record = existing
      ? await prisma.user.update({
          where: { email: item.email },
          data: {
            name: item.name,
            phone: item.phone,
            role: item.role,
            isActive: true,
            canDelete: item.canDelete ?? existing.canDelete
          }
        })
      : await prisma.user.create({
          data: {
            name: item.name,
            email: item.email,
            phone: item.phone,
            role: item.role,
            canDelete: item.canDelete ?? false,
            passwordHash: await password(item.password)
          }
        });

    userRecords[item.email] = record;
    await prisma.teacherClass.deleteMany({ where: { userId: record.id } });
    await prisma.teacherSubject.deleteMany({ where: { userId: record.id } });
    if (item.classNames?.length) {
      await prisma.teacherClass.createMany({
        data: item.classNames.map((name) => ({ userId: record.id, classId: classes[name].id }))
      });
    }
    if (item.subjectCodes?.length) {
      await prisma.teacherSubject.createMany({
        data: item.subjectCodes.map((code) => ({ userId: record.id, subjectId: subjects[code].id }))
      });
    }
  }

  const teacher1 = userRecords['teacher@lpacamis.ac.ug'];
  const teacher2 = userRecords['teacher2@lpacamis.ac.ug'];
  const teacher3 = userRecords['teacher3@lpacamis.ac.ug'];
  const teacher4 = userRecords['teacher4@lpacamis.ac.ug'];
  const dos = userRecords['dos@lpacamis.ac.ug'];
  const head = userRecords['head@lpacamis.ac.ug'];

  const classTeachers = {
    'Baby Class': teacher3,
    'Middle Class': teacher3,
    'Top Class': teacher3,
    'P.1': teacher1,
    'P.2': teacher2,
    'P.3': teacher4,
    'P.4': teacher1,
    'P.5': teacher2,
    'P.6': teacher4,
    'P.7': teacher4
  };
  for (const [name, teacher] of Object.entries(classTeachers)) {
    await prisma.schoolClass.update({
      where: { id: classes[name].id },
      data: { classTeacherId: teacher.id }
    });
  }

  let studentSequence = 0;
  const studentsByClass = {};
  for (const schoolClass of Object.values(classes)) {
    studentsByClass[schoolClass.name] = [];
    for (let index = 0; index < 5; index += 1) {
      const [firstName, lastName] = STUDENT_NAMES[studentSequence % STUDENT_NAMES.length];
      studentSequence += 1;
      const code = `LPAC-2026-${String(studentSequence).padStart(3, '0')}`;
      const student = await prisma.student.upsert({
        where: { code },
        update: { classId: schoolClass.id },
        create: {
          code,
          firstName,
          lastName,
          gender: studentSequence % 2 === 0 ? 'FEMALE' : 'MALE',
          dateOfBirth: new Date(2012 + (studentSequence % 6), (studentSequence % 12), 12),
          guardianName: `${lastName} Family`,
          guardianPhone: `+256 77${String(2000000 + studentSequence).slice(-7)}`,
          address: 'Kampala, Uganda',
          classId: schoolClass.id,
          createdById: userRecords['superadmin@lpacamis.ac.ug'].id
        }
      });
      studentsByClass[schoolClass.name].push(student);
    }
  }

  const termStatus = {
    TERM1: 'APPROVED',
    TERM2: 'APPROVED'
  };

  for (const className of DEMO_CLASSES) {
    const schoolClass = classes[className];
    const classSubjects = await prisma.subject.findMany({
      where: { levels: { has: schoolClass.level }, isActive: true },
      orderBy: { position: 'asc' }
    });
    const students = studentsByClass[className];
    const teacherId = classTeachers[className].id;

    for (const [termIndex, term] of ['TERM1', 'TERM2', 'TERM3'].entries()) {
      for (const [studentIndex, student] of students.entries()) {
        const status =
          term === 'TERM3'
            ? className === 'P.7'
              ? 'APPROVED'
              : ['DRAFT', 'SUBMITTED', 'APPROVED'][studentIndex % 3]
            : termStatus[term];

        const card = await prisma.reportCard.upsert({
          where: { studentId_term_year: { studentId: student.id, term, year: 2026 } },
          update: { status, classId: schoolClass.id },
          create: {
            studentId: student.id,
            classId: schoolClass.id,
            term,
            year: 2026,
            status,
            attendancePresent: 56 + ((studentIndex + termIndex) % 6),
            attendanceTotal: 64,
            teacherComment:
              status === 'APPROVED'
                ? 'A steady term. Keep working on the weaker subjects during the holiday.'
                : null,
            dosComment:
              status === 'APPROVED'
                ? 'Report verified against the class assessment records.'
                : null,
            headComment:
              status === 'APPROVED'
                ? 'Approved for issue to the parent or guardian.'
                : null,
            createdById: teacherId,
            submittedById: status === 'DRAFT' ? null : teacherId,
            submittedAt: status === 'DRAFT' ? null : new Date(),
            approvedById: status === 'APPROVED' ? dos.id : null,
            approvedAt: status === 'APPROVED' ? new Date() : null
          }
        });

        const baseAbility = 38 + ((studentIndex * 13 + className.length * 7) % 48);

        for (const [subjectIndex, subject] of classSubjects.entries()) {
          const variation = ((subjectIndex * 17 + termIndex * 11) % 21) - 10;
          const rawScore = Math.min(98, Math.max(16, baseAbility + variation + ((studentIndex * 3) % 7) - 3));
          const caScore = Math.min(100, Math.max(0, rawScore + ((subjectIndex + studentIndex) % 7) - 3));
          const examScore = Math.min(100, Math.max(0, rawScore + ((subjectIndex * 2 + studentIndex) % 9) - 4));
          const total = computeTotal(caScore, examScore, DEFAULT_SETTINGS);
          const gradeInfo = gradeFor(total, schoolClass.level, DEFAULT_SETTINGS);

          await prisma.mark.upsert({
            where: {
              reportCardId_subjectId: { reportCardId: card.id, subjectId: subject.id }
            },
            update: {
              caScore,
              examScore,
              total,
              grade: gradeInfo.grade,
              remark: gradeInfo.remark,
              competency: assessmentCompetency(schoolClass.level, total, null),
              teacherId
            },
            create: {
              reportCardId: card.id,
              subjectId: subject.id,
              caScore,
              examScore,
              total,
              grade: gradeInfo.grade,
              remark: gradeInfo.remark,
              competency: assessmentCompetency(schoolClass.level, total, null),
              teacherId
            }
          });
        }
      }
    }
  }

  await prisma.auditLog.create({
    data: {
      userId: userRecords['superadmin@lpacamis.ac.ug'].id,
      userName: 'Super Admin',
      userRole: 'SUPER_ADMIN',
      action: 'SEED',
      entity: 'System',
      description: 'Seeded demonstration classes, subjects, staff, students and report cards.',
      ip: '127.0.0.1'
    }
  });

  console.log('Seed complete.');
  console.log('Super Admin : superadmin@lpacamis.ac.ug / Admin@1234');
  console.log('DOS         : dos@lpacamis.ac.ug / Dos@12345');
  console.log('Head Teacher: head@lpacamis.ac.ug / Head@12345');
  console.log('Teacher     : teacher@lpacamis.ac.ug / Teacher@123');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
