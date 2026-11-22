import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma.js';
import {
  CAMPUSES,
  defaultSettingsFor,
  computeTotal,
  gradeFor,
  assessmentCompetency
} from '../src/lib/grading.js';

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith('mysql://')) {
  console.error('Set DATABASE_URL to your MySQL connection string (mysql://...) before seeding.');
  process.exit(1);
}

await prisma.$connect();

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
  { name: 'Kinyarwanda', code: 'KIN', levels: ['NURSERY', 'LOWER_PRIMARY', 'UPPER_PRIMARY'], position: 7 },
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

const FIRST_NAMES = [
  'Aline', 'Bertrand', 'Chantal', 'David', 'Esperance', 'Fabrice', 'Gloria', 'Herve', 'Irene', 'Jean',
  'Clarisse', 'Kevin', 'Lydie', 'Moses', 'Nadine', 'Olivier', 'Patience', 'Quentin', 'Rosine', 'Samuel',
  'Teresa', 'Uwitonze', 'Valerie', 'Wilfried', 'Yvonne', 'Zacharie', 'Alice', 'Eric', 'Diane', 'Claudine',
  'Grace', 'Emmanuel', 'Brigitte', 'Celine', 'Dorothee', 'Edmond', 'Felicie', 'Gaspard', 'Hortense', 'Innocent',
  'Jacqueline', 'Kizito', 'Lea', 'Marcel', 'Nicole', 'Pacifique', 'Rebecca', 'Saidi', 'Sylvie', 'Thierry',
  'Valens', 'Viateur', 'Yolande', 'Adrien', 'Beatrice', 'Celestin', 'Delphine', 'Elie'
];

const LAST_NAMES = [
  'Mukamana', 'Nkurunziza', 'Uwimana', 'Habimana', 'Niyonsaba',
  'Nsengiyumva', 'Umuhoza', 'Mutesi', 'Irakoze', 'Ndayisaba'
];

const STUDENT_NAMES = FIRST_NAMES.map((first, index) => [first, LAST_NAMES[index % LAST_NAMES.length]]);
const DEMO_CLASSES = ['Top Class', 'P.1', 'P.4', 'P.7'];

const SUPER_ADMIN_ID = 'user-GLOBAL-superadmin';

/** Exactly one teacher is the class teacher of each of these classes. */
const CLASS_TEACHERS = {
  'P.4': 'teacher',
  'P.1': 'teacher2',
  'Baby Class': 'teacher3'
};

const TEACHER_ASSIGNMENTS = {
  teacher: { classNames: ['P.1', 'P.4'], subjectCodes: ['ENG', 'MATH', 'KIN'] },
  teacher2: { classNames: ['P.2', 'P.5'], subjectCodes: ['ENG', 'MATH', 'SCI'] },
  teacher3: { classNames: ['Baby Class', 'Middle Class', 'Top Class'], subjectCodes: ['LANG', 'NUM', 'R&W'] },
  teacher4: { classNames: ['P.3', 'P.7'], subjectCodes: ['SCI', 'SST', 'RE'] }
};

const STAFF = [
  {
    local: 'dos',
    role: 'DOS',
    passwordKey: 'DOS',
    names: { MAIN: 'Ms. Mukamana Grace', RULINDO: 'Ms. Uwimana Claudine' }
  },
  {
    local: 'head',
    role: 'HEAD_TEACHER',
    passwordKey: 'HEAD',
    names: { MAIN: 'Mr. Nkurunziza Emmanuel', RULINDO: 'Mr. Habimana Jean' }
  },
  {
    local: 'teacher',
    role: 'TEACHER',
    passwordKey: 'TEACHER',
    names: { MAIN: 'Ms. Umuhoza Alice', RULINDO: 'Ms. Niyonsaba Diane' }
  },
  {
    local: 'teacher2',
    role: 'TEACHER',
    passwordKey: 'TEACHER',
    names: { MAIN: 'Mr. Nsengiyumva Jean', RULINDO: 'Mr. Ndayisaba Eric' }
  },
  {
    local: 'teacher3',
    role: 'TEACHER',
    passwordKey: 'TEACHER',
    names: { MAIN: 'Ms. Mutesi Claudine', RULINDO: 'Ms. Mukamana Esperance' }
  },
  {
    local: 'teacher4',
    role: 'TEACHER',
    passwordKey: 'TEACHER',
    names: { MAIN: 'Mr. Irakoze Olivier', RULINDO: 'Mr. Nkurunziza Samuel' }
  }
];

const PASSWORDS = {
  SUPER: 'Admin@1234',
  DOS: 'Dos@12345',
  HEAD: 'Head@12345',
  TEACHER: 'Teacher@123'
};

const STAFF_LABELS = {
  dos: 'DOS',
  head: 'Head Teacher',
  teacher: 'Teacher 1',
  teacher2: 'Teacher 2',
  teacher3: 'Teacher 3',
  teacher4: 'Teacher 4'
};

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function userId(campusId, local) {
  return `user-${campusId}-${local}`;
}

function emailFor(localPart, campusId) {
  return campusId === 'MAIN'
    ? `${localPart}@lpareports.rw`
    : `${localPart}.rulindo@lpareports.rw`;
}

function fullName(student) {
  return [student.firstName, student.otherNames, student.lastName].filter(Boolean).join(' ');
}

function statusFor(term, studentIndex, className) {
  if (term !== 'TERM3') return 'APPROVED';
  if (className === 'Top Class' && studentIndex === 0) return 'DRAFT';
  if (className === 'Top Class' && studentIndex === 1) return 'SUBMITTED';
  return 'APPROVED';
}

async function seedGlobalRows(passwordHashes) {
  await prisma.user.upsert({
    where: { id: SUPER_ADMIN_ID },
    create: {
      id: SUPER_ADMIN_ID,
      campusId: 'MAIN',
      name: 'Super Admin',
      email: 'superadmin@lpareports.rw',
      phone: '+250 788 300 000',
      passwordHash: passwordHashes.SUPER,
      role: 'SUPER_ADMIN',
      isActive: true,
      canDelete: false,
      isGlobal: true
    },
    update: {
      campusId: 'MAIN',
      name: 'Super Admin',
      email: 'superadmin@lpareports.rw',
      passwordHash: passwordHashes.SUPER,
      role: 'SUPER_ADMIN',
      isActive: true,
      canDelete: false,
      isGlobal: true
    }
  });

  await prisma.systemSetting.upsert({
    where: { id: 'GLOBAL' },
    create: { id: 'GLOBAL', studentRegistrationEnabled: true },
    update: { studentRegistrationEnabled: true }
  });
}

async function seedCampus(campus, passwordHashes) {
  const campusId = campus.id;
  const settings = defaultSettingsFor(campusId);
  console.log(`Seeding ${campus.name} (${campusId}) — ${campus.location}`);

  await prisma.setting.upsert({
    where: { id: campusId },
    create: { id: campusId, ...settings },
    update: { ...settings }
  });

  const classes = {};
  for (const item of CLASSES) {
    const id = `class-${campusId}-${slug(item.name)}`;
    const classTeacherId = CLASS_TEACHERS[item.name]
      ? userId(campusId, CLASS_TEACHERS[item.name])
      : null;
    const data = {
      campusId,
      name: item.name,
      level: item.level,
      classTeacherId
    };
    await prisma.schoolClass.upsert({
      where: { id },
      create: { id, ...data },
      update: data
    });
    classes[item.name] = { id, ...data };
  }

  const subjects = {};
  for (const item of SUBJECTS) {
    const id = `subject-${campusId}-${item.code}`;
    const data = {
      campusId,
      name: item.name,
      code: item.code,
      levels: item.levels,
      position: item.position,
      isActive: true
    };
    await prisma.subject.upsert({
      where: { id },
      create: { id, ...data },
      update: data
    });
    subjects[item.code] = { id, ...data };
  }

  // Staff accounts (the single global Super Admin is seeded separately).
  for (const member of STAFF) {
    const id = userId(campusId, member.local);
    const className = Object.keys(CLASS_TEACHERS).find(
      (name) => CLASS_TEACHERS[name] === member.local
    );
    const data = {
      campusId,
      name: member.names[campusId] || member.names.MAIN,
      email: emailFor(member.local, campusId),
      phone: `+250 788 300 ${member.local === 'dos' ? 100 : 200}`,
      passwordHash: passwordHashes[member.passwordKey],
      role: member.role,
      isActive: true,
      canDelete: false,
      isGlobal: false,
      classTeacherClassId: className ? classes[className].id : null
    };
    await prisma.user.upsert({
      where: { id },
      create: { id, ...data },
      update: data
    });

    for (const name of TEACHER_ASSIGNMENTS[member.local]?.classNames || []) {
      const classId = classes[name].id;
      const rowId = `tc-${id}-${classId}`;
      const row = { campusId, userId: id, classId };
      await prisma.teacherClass.upsert({
        where: { id: rowId },
        create: { id: rowId, ...row },
        update: row
      });
    }
    for (const code of TEACHER_ASSIGNMENTS[member.local]?.subjectCodes || []) {
      const subjectId = subjects[code].id;
      const rowId = `ts-${id}-${subjectId}`;
      const row = { campusId, userId: id, subjectId };
      await prisma.teacherSubject.upsert({
        where: { id: rowId },
        create: { id: rowId, ...row },
        update: row
      });
    }
  }

  // 50 students: five per class.
  const studentsByClass = {};
  let studentSequence = 0;
  const nameOffset = campusId === 'MAIN' ? 0 : 27;
  for (const item of CLASSES) {
    const schoolClass = classes[item.name];
    studentsByClass[item.name] = [];

    for (let index = 0; index < 5; index += 1) {
      studentSequence += 1;
      const [firstName, lastName] =
        STUDENT_NAMES[(studentSequence - 1 + nameOffset) % STUDENT_NAMES.length];
      const code = `LPA-${campus.short}-2026-${String(studentSequence).padStart(3, '0')}`;
      const id = `student-${campusId}-${code}`;
      const data = {
        campusId,
        code,
        firstName,
        lastName,
        otherNames: null,
        gender: studentSequence % 2 === 0 ? 'FEMALE' : 'MALE',
        dateOfBirth: new Date(Date.UTC(2012 + (studentSequence % 6), studentSequence % 12, 12)),
        guardianName: `${lastName} Family`,
        guardianPhone: `+250 78${String(2000000 + studentSequence).slice(-7)}`,
        address: campus.location,
        isActive: true,
        classId: schoolClass.id,
        createdById: SUPER_ADMIN_ID
      };
      await prisma.student.upsert({
        where: { id },
        create: { id, ...data },
        update: data
      });
      studentsByClass[item.name].push({ id, code, ...data });
    }
  }

  const now = new Date();
  const cardIds = [];
  const marks = [];

  for (const className of DEMO_CLASSES) {
    const schoolClass = classes[className];
    const level = schoolClass.level;
    const classSubjects = SUBJECTS.filter((item) => item.levels.includes(level)).sort(
      (a, b) => a.position - b.position
    );
    const teacherId = schoolClass.classTeacherId || userId(campusId, 'teacher');
    const students = studentsByClass[className];

    for (const [studentIndex, student] of students.entries()) {
      const studentName = fullName(student);
      const baseAbility = 38 + ((studentIndex * 13 + className.length * 7 + nameOffset) % 48);

      for (const [termIndex, term] of ['TERM1', 'TERM2', 'TERM3'].entries()) {
        const status = statusFor(term, studentIndex, className);

        // Term report: coursework + exam, with an optional mid-term score.
        const cardId = `card-${campusId}-${student.code}-${term}-TERM-2026`;
        const cardData = {
          campusId,
          studentId: student.id,
          classId: schoolClass.id,
          term,
          type: 'TERM',
          year: 2026,
          studentName,
          status,
          submittedById: status === 'DRAFT' ? null : teacherId,
          submittedAt: status === 'DRAFT' ? null : now,
          approvedById: status === 'APPROVED' ? userId(campusId, 'dos') : null,
          approvedAt: status === 'APPROVED' ? now : null,
          createdById: teacherId
        };
        await prisma.reportCard.upsert({
          where: { id: cardId },
          create: { id: cardId, ...cardData },
          update: cardData
        });
        cardIds.push(cardId);

        for (const [subjectIndex, subject] of classSubjects.entries()) {
          const variation = ((subjectIndex * 17 + termIndex * 11) % 21) - 10;
          const rawScore = Math.min(98, Math.max(16, baseAbility + variation + ((studentIndex * 3) % 7) - 3));
          const caScore = Math.min(100, Math.max(0, rawScore + ((subjectIndex + studentIndex) % 7) - 3));
          const examScore = Math.min(100, Math.max(0, rawScore + ((subjectIndex * 2 + studentIndex) % 9) - 4));
          const midtermScore = Math.min(100, Math.max(0, rawScore + ((subjectIndex + termIndex) % 5) - 2));
          const total = computeTotal(caScore, examScore, settings);
          const gradeInfo = gradeFor(total, level, settings);

          marks.push({
            id: `mark-${cardId}-${subject.code}`,
            campusId,
            reportCardId: cardId,
            subjectId: subjects[subject.code].id,
            caScore,
            midtermScore,
            examScore,
            total,
            grade: gradeInfo.grade,
            remark: gradeInfo.remark,
            competency: assessmentCompetency(level, total, null),
            teacherId
          });
        }

        // Mid-term report: only the mid-term score is recorded.
        const midCardId = `card-${campusId}-${student.code}-${term}-MIDTERM-2026`;
        const midCardData = { ...cardData, type: 'MIDTERM', status: 'APPROVED' };
        await prisma.reportCard.upsert({
          where: { id: midCardId },
          create: { id: midCardId, ...midCardData },
          update: midCardData
        });
        cardIds.push(midCardId);

        for (const subject of classSubjects) {
          marks.push({
            id: `mark-${midCardId}-${subject.code}`,
            campusId,
            reportCardId: midCardId,
            subjectId: subjects[subject.code].id,
            caScore: null,
            midtermScore: Math.min(
              100,
              Math.max(0, baseAbility + ((subject.position + termIndex) % 11) - 5)
            ),
            examScore: null,
            total: null,
            grade: null,
            remark: null,
            competency: null,
            teacherId
          });
        }
      }

      // A few annual reports. These are derived from the three TERM cards.
      if (studentIndex < 2 && ['P.7', 'Top Class'].includes(className)) {
        const cardId = `card-${campusId}-${student.code}-ANNUAL-2026`;
        const cardData = {
          campusId,
          studentId: student.id,
          classId: schoolClass.id,
          term: 'ANNUAL',
          type: 'ANNUAL',
          year: 2026,
          studentName,
          status: 'APPROVED',
          submittedById: teacherId,
          submittedAt: now,
          approvedById: userId(campusId, 'dos'),
          approvedAt: now,
          createdById: teacherId
        };
        await prisma.reportCard.upsert({
          where: { id: cardId },
          create: { id: cardId, ...cardData },
          update: cardData
        });
        cardIds.push(cardId);
      }
    }
  }

  // Deterministic mark ids: replace the marks of seeded cards, then re-create.
  if (cardIds.length) {
    await prisma.mark.deleteMany({ where: { campusId, reportCardId: { in: cardIds } } });
  }
  if (marks.length) {
    await prisma.mark.createMany({ data: marks, skipDuplicates: true });
  }

  await prisma.auditLog.upsert({
    where: { id: `audit-seed-${campusId}` },
    create: {
      id: `audit-seed-${campusId}`,
      campusId,
      userId: SUPER_ADMIN_ID,
      userName: 'Super Admin',
      userRole: 'SUPER_ADMIN',
      action: 'SEED',
      entity: 'System',
      description: `Seeded ${campus.name} classes, subjects, staff, students and report cards.`,
      ip: '127.0.0.1'
    },
    update: {
      campusId,
      userId: SUPER_ADMIN_ID,
      userName: 'Super Admin',
      userRole: 'SUPER_ADMIN',
      action: 'SEED',
      entity: 'System',
      description: `Seeded ${campus.name} classes, subjects, staff, students and report cards.`,
      ip: '127.0.0.1'
    }
  });
}

async function main() {
  console.log('Seeding LPAREPORTS...');

  // Hash each distinct password exactly once.
  const passwordHashes = {};
  await Promise.all(
    Object.entries(PASSWORDS).map(async ([key, value]) => {
      passwordHashes[key] = await bcrypt.hash(value, 10);
    })
  );

  await seedGlobalRows(passwordHashes);
  for (const campus of Object.values(CAMPUSES)) {
    await seedCampus(campus, passwordHashes);
  }

  console.log('\nSeed complete.');
  console.log('\nGlobal Super Admin (works for BOTH campuses):');
  console.log(`  Super Admin: ${emailFor('superadmin', 'MAIN')} / ${PASSWORDS.SUPER}`);

  for (const campus of Object.values(CAMPUSES)) {
    console.log(`\n${campus.name} (${campus.id}) — ${campus.location}`);
    for (const member of STAFF) {
      console.log(
        `  ${STAFF_LABELS[member.local].padEnd(12)}: ${emailFor(member.local, campus.id)} / ${PASSWORDS[member.passwordKey]}`
      );
    }
  }

  console.log('\nReminder: `npm run db:setup` creates the MySQL tables before seeding.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
