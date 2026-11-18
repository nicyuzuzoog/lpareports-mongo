import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma.js';
import { models } from '../src/models/index.js';
import {
  CAMPUSES,
  defaultSettingsFor,
  computeTotal,
  gradeFor,
  assessmentCompetency
} from '../src/lib/grading.js';

if (!process.env.MONGODB_URI && !process.env.MONGO_URI && !process.env.DATABASE_URL) {
  console.error('Set MONGODB_URI (or MONGO_URI) to your MongoDB Atlas connection string before seeding.');
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

const STAFF_LOCALS = [
  'superadmin', 'dos', 'head', 'teacher', 'teacher2', 'teacher3', 'teacher4'
];

const STAFF_ROLES = {
  superadmin: 'SUPER_ADMIN',
  dos: 'DOS',
  head: 'HEAD_TEACHER',
  teacher: 'TEACHER',
  teacher2: 'TEACHER',
  teacher3: 'TEACHER',
  teacher4: 'TEACHER'
};

const STAFF_PASSWORDS = {
  superadmin: 'Admin@1234',
  dos: 'Dos@12345',
  head: 'Head@12345',
  teacher: 'Teacher@123',
  teacher2: 'Teacher@123',
  teacher3: 'Teacher@123',
  teacher4: 'Teacher@123'
};

const STAFF_NAMES = {
  MAIN: {
    superadmin: 'Super Admin',
    dos: 'Ms. Mukamana Grace',
    head: 'Mr. Nkurunziza Emmanuel',
    teacher: 'Ms. Umuhoza Alice',
    teacher2: 'Mr. Nsengiyumva Jean',
    teacher3: 'Ms. Mutesi Claudine',
    teacher4: 'Mr. Irakoze Olivier'
  },
  RULINDO: {
    superadmin: 'Super Admin',
    dos: 'Ms. Uwimana Claudine',
    head: 'Mr. Habimana Jean',
    teacher: 'Ms. Niyonsaba Diane',
    teacher2: 'Mr. Ndayisaba Eric',
    teacher3: 'Ms. Mukamana Esperance',
    teacher4: 'Mr. Nkurunziza Samuel'
  }
};

const TEACHER_ASSIGNMENTS = {
  teacher: { classNames: ['P.1', 'P.4'], subjectCodes: ['ENG', 'MATH', 'KIN'] },
  teacher2: { classNames: ['P.2', 'P.5'], subjectCodes: ['ENG', 'MATH', 'SCI'] },
  teacher3: { classNames: ['Baby Class', 'Middle Class', 'Top Class'], subjectCodes: ['LANG', 'NUM', 'R&W'] },
  teacher4: { classNames: ['P.3', 'P.7'], subjectCodes: ['SCI', 'SST', 'RE'] }
};

const CLASS_TEACHERS = {
  'Baby Class': 'teacher3',
  'Middle Class': 'teacher3',
  'Top Class': 'teacher3',
  'P.1': 'teacher',
  'P.2': 'teacher2',
  'P.3': 'teacher4',
  'P.4': 'teacher',
  'P.5': 'teacher2',
  'P.6': 'teacher4',
  'P.7': 'teacher4'
};

const BULK_COLLECTIONS = [
  'setting',
  'schoolClass',
  'subject',
  'user',
  'student',
  'teacherClass',
  'teacherSubject',
  'reportCard',
  'mark',
  'auditLog'
];

const hashPassword = (value) => bcrypt.hash(value, 10);

function emailFor(localPart, campusId) {
  return campusId === 'MAIN'
    ? `${localPart}@lpareports.rw`
    : `${localPart}.rulindo@lpareports.rw`;
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** One idempotent bulk operation: a deterministic _id is the upsert key. */
function upsertOperation(id, doc) {
  return {
    updateOne: {
      filter: { _id: id },
      update: { $set: doc },
      upsert: true
    }
  };
}

/** Build every document for one campus in memory; no database reads/writes here. */
function buildCampusDocs(campus, passwordHashes, bucket) {
  const settings = defaultSettingsFor(campus.id);
  const isMain = campus.id === 'MAIN';
  const phoneBase = isMain ? 100 : 200;
  const nameOffset = isMain ? 0 : 27;
  const push = (collection, id, doc) => {
    bucket[collection].push(upsertOperation(id, doc));
  };
  const userId = (local) => `user-${campus.id}-${local}`;

  console.log(`Seeding ${campus.name} (${campus.id}) — ${campus.location}`);

  // Setting is keyed by its _id (the campus id); the schema has no campusId.
  push('setting', campus.id, { ...settings });

  const classes = {};
  for (const item of CLASSES) {
    const classId = `class-${campus.id}-${slug(item.name)}`;
    classes[item.name] = { id: classId, level: item.level };
    push('schoolClass', classId, {
      campusId: campus.id,
      name: item.name,
      level: item.level,
      classTeacherId: userId(CLASS_TEACHERS[item.name])
    });
  }

  const subjects = {};
  for (const item of SUBJECTS) {
    const subjectId = `subject-${campus.id}-${item.code}`;
    subjects[item.code] = subjectId;
    push('subject', subjectId, {
      campusId: campus.id,
      name: item.name,
      code: item.code,
      levels: item.levels,
      position: item.position,
      isActive: true
    });
  }

  for (const [index, local] of STAFF_LOCALS.entries()) {
    const userIdValue = userId(local);
    push('user', userIdValue, {
      campusId: campus.id,
      name: STAFF_NAMES[campus.id][local],
      email: emailFor(local, campus.id),
      phone: `+250 788 300 ${phoneBase + index}`,
      passwordHash: passwordHashes[`${campus.id}:${local}`],
      role: STAFF_ROLES[local],
      isActive: true,
      canDelete: local === 'superadmin'
    });

    const assignment = TEACHER_ASSIGNMENTS[local];
    for (const name of assignment?.classNames || []) {
      const classId = classes[name].id;
      push('teacherClass', `tc-${userIdValue}-${classId}`, {
        campusId: campus.id,
        userId: userIdValue,
        classId
      });
    }
    for (const code of assignment?.subjectCodes || []) {
      const subjectId = subjects[code];
      push('teacherSubject', `ts-${userIdValue}-${subjectId}`, {
        campusId: campus.id,
        userId: userIdValue,
        subjectId
      });
    }
  }

  let studentSequence = 0;
  const studentsByClass = {};
  for (const item of CLASSES) {
    const schoolClass = classes[item.name];
    studentsByClass[item.name] = [];

    for (let index = 0; index < 5; index += 1) {
      studentSequence += 1;
      const [firstName, lastName] =
        STUDENT_NAMES[(studentSequence - 1 + nameOffset) % STUDENT_NAMES.length];
      const code = `LPA-${campus.short}-2026-${String(studentSequence).padStart(3, '0')}`;
      const studentId = `student-${campus.id}-${code}`;

      push('student', studentId, {
        campusId: campus.id,
        code,
        firstName,
        lastName,
        gender: studentSequence % 2 === 0 ? 'FEMALE' : 'MALE',
        dateOfBirth: new Date(2012 + (studentSequence % 6), (studentSequence % 12), 12),
        guardianName: `${lastName} Family`,
        guardianPhone: `+250 78${String(2000000 + studentSequence).slice(-7)}`,
        address: campus.location,
        classId: schoolClass.id,
        createdById: userId('superadmin'),
        isActive: true
      });

      studentsByClass[item.name].push({ id: studentId, code });
    }
  }

  const now = new Date();
  const termStatus = { TERM1: 'APPROVED', TERM2: 'APPROVED' };

  for (const className of DEMO_CLASSES) {
    const schoolClass = classes[className];
    const classSubjects = SUBJECTS.filter((item) => item.levels.includes(schoolClass.level))
      .sort((a, b) => a.position - b.position);
    const students = studentsByClass[className];
    const teacherId = userId(CLASS_TEACHERS[className]);

    for (const [termIndex, term] of ['TERM1', 'TERM2', 'TERM3'].entries()) {
      for (const [studentIndex, student] of students.entries()) {
        const status =
          term === 'TERM3'
            ? className === 'P.7'
              ? 'APPROVED'
              : ['DRAFT', 'SUBMITTED', 'APPROVED'][studentIndex % 3]
            : termStatus[term];

        const cardId = `card-${campus.id}-${student.code}-${term}-2026`;
        push('reportCard', cardId, {
          campusId: campus.id,
          studentId: student.id,
          classId: schoolClass.id,
          term,
          year: 2026,
          status,
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
          submittedAt: status === 'DRAFT' ? null : now,
          approvedById: status === 'APPROVED' ? userId('dos') : null,
          approvedAt: status === 'APPROVED' ? now : null
        });

        const baseAbility = 38 + ((studentIndex * 13 + className.length * 7 + nameOffset) % 48);

        for (const [subjectIndex, subject] of classSubjects.entries()) {
          const variation = ((subjectIndex * 17 + termIndex * 11) % 21) - 10;
          const rawScore = Math.min(98, Math.max(16, baseAbility + variation + ((studentIndex * 3) % 7) - 3));
          const caScore = Math.min(100, Math.max(0, rawScore + ((subjectIndex + studentIndex) % 7) - 3));
          const examScore = Math.min(100, Math.max(0, rawScore + ((subjectIndex * 2 + studentIndex) % 9) - 4));
          const total = computeTotal(caScore, examScore, settings);
          const gradeInfo = gradeFor(total, schoolClass.level, settings);

          push('mark', `mark-${cardId}-${subject.code}`, {
            campusId: campus.id,
            reportCardId: cardId,
            subjectId: subjects[subject.code],
            caScore,
            examScore,
            total,
            grade: gradeInfo.grade,
            remark: gradeInfo.remark,
            competency: assessmentCompetency(schoolClass.level, total, null),
            teacherId
          });
        }
      }
    }
  }

  push('auditLog', `audit-seed-${campus.id}`, {
    campusId: campus.id,
    userId: userId('superadmin'),
    userName: 'Super Admin',
    userRole: 'SUPER_ADMIN',
    action: 'SEED',
    entity: 'System',
    description: `Seeded ${campus.name} classes, subjects, staff, students and report cards.`,
    ip: '127.0.0.1'
  });
}

async function main() {
  console.log('Seeding LPAREPORTS...');

  const campusList = Object.values(CAMPUSES);

  // Hash all 14 staff passwords exactly once, before any documents are built.
  const passwordHashes = {};
  await Promise.all(
    campusList.flatMap((campus) =>
      STAFF_LOCALS.map(async (local) => {
        passwordHashes[`${campus.id}:${local}`] = await hashPassword(STAFF_PASSWORDS[local]);
      })
    )
  );

  const bucket = Object.fromEntries(BULK_COLLECTIONS.map((key) => [key, []]));
  for (const campus of campusList) {
    buildCampusDocs(campus, passwordHashes, bucket);
  }

  for (const collection of BULK_COLLECTIONS) {
    if (bucket[collection].length) {
      await models[collection].bulkWrite(bucket[collection], { ordered: false });
    }
  }

  console.log('\nSeed complete.');
  for (const campus of campusList) {
    const localSuffix = campus.id === 'MAIN' ? '' : '.rulindo';
    console.log(`\n${campus.name} (${campus.id}) — ${campus.location}`);
    for (const local of STAFF_LOCALS) {
      const label = {
        superadmin: 'Super Admin ',
        dos: 'DOS         ',
        head: 'Head Teacher',
        teacher: 'Teacher     ',
        teacher2: 'Teacher 2   ',
        teacher3: 'Teacher 3   ',
        teacher4: 'Teacher 4   '
      }[local];
      console.log(`  ${label}: ${emailFor(local, campus.id)} / ${STAFF_PASSWORDS[local]}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
