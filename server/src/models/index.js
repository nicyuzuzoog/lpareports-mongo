import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { DEFAULT_GRADING_SCALES } from '../lib/grading.js';

const { Schema } = mongoose;

const idField = { type: String, default: () => randomUUID() };

const transform = (doc, ret) => {
  ret.id = String(ret._id);
  delete ret._id;
  delete ret.__v;
  return ret;
};

function makeSchema(definition, options = {}) {
  const { toJSON, toObject, ...rest } = options;
  return new Schema(
    { _id: idField, ...definition },
    {
      ...rest,
      toJSON: { virtuals: false, transform, ...toJSON },
      toObject: { virtuals: false, transform, ...toObject }
    }
  );
}

const CAMPUSES = ['MAIN', 'RULINDO'];
const campusField = { type: String, enum: CAMPUSES, required: true };
const ROLES = ['SUPER_ADMIN', 'DOS', 'HEAD_TEACHER', 'TEACHER'];
const LEVELS = ['NURSERY', 'LOWER_PRIMARY', 'UPPER_PRIMARY'];
const TERMS = ['TERM1', 'TERM2', 'TERM3'];
const REPORT_TYPES = ['MIDTERM', 'TERM', 'ANNUAL'];

const UserSchema = makeSchema(
  {
    campusId: campusField,
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    phone: { type: String, default: null },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, default: 'TEACHER' },
    isActive: { type: Boolean, default: true },
    canDelete: { type: Boolean, default: false },
    isGlobal: { type: Boolean, default: false },
    classTeacherClassId: { type: String, default: null }
  },
  { timestamps: true }
);
UserSchema.index({ campusId: 1, email: 1 }, { unique: true });
UserSchema.index({ campusId: 1, role: 1 });
UserSchema.index({ campusId: 1, isGlobal: 1 });

const TeacherClassSchema = makeSchema({
  campusId: campusField,
  userId: { type: String, required: true },
  classId: { type: String, required: true }
});
TeacherClassSchema.index({ campusId: 1, userId: 1, classId: 1 }, { unique: true });

const TeacherSubjectSchema = makeSchema({
  campusId: campusField,
  userId: { type: String, required: true },
  subjectId: { type: String, required: true }
});
TeacherSubjectSchema.index({ campusId: 1, userId: 1, subjectId: 1 }, { unique: true });

const SchoolClassSchema = makeSchema(
  {
    campusId: campusField,
    name: { type: String, required: true },
    level: { type: String, enum: LEVELS, required: true },
    classTeacherId: { type: String, default: null }
  },
  { timestamps: true }
);
SchoolClassSchema.index({ campusId: 1, name: 1 }, { unique: true });
SchoolClassSchema.index({ campusId: 1, level: 1 });

const SubjectSchema = makeSchema(
  {
    campusId: campusField,
    name: { type: String, required: true },
    code: { type: String, required: true },
    levels: { type: [String], enum: LEVELS, default: [] },
    position: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);
SubjectSchema.index({ campusId: 1, code: 1 }, { unique: true });
SubjectSchema.index({ campusId: 1, name: 1 }, { unique: true });
SubjectSchema.index({ campusId: 1, isActive: 1 });

const StudentSchema = makeSchema(
  {
    campusId: campusField,
    code: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    otherNames: { type: String, default: null },
    gender: { type: String, enum: ['MALE', 'FEMALE'], required: true },
    dateOfBirth: { type: Date, default: null },
    guardianName: { type: String, default: null },
    guardianPhone: { type: String, default: null },
    address: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    classId: { type: String, required: true },
    createdById: { type: String, default: null }
  },
  { timestamps: true }
);
StudentSchema.index({ campusId: 1, code: 1 }, { unique: true });
StudentSchema.index({ campusId: 1, classId: 1 });
StudentSchema.index({ campusId: 1, lastName: 1, firstName: 1 });

const ReportCardSchema = makeSchema(
  {
    campusId: campusField,
    studentId: { type: String, required: true },
    classId: { type: String, required: true },
    term: { type: String, enum: [...TERMS, 'ANNUAL'], required: true },
    type: { type: String, enum: REPORT_TYPES, default: 'TERM' },
    year: { type: Number, required: true },
    studentName: { type: String, default: '' },
    teacherComment: { type: String, default: null },
    dosComment: { type: String, default: null },
    headComment: { type: String, default: null },
    status: { type: String, enum: ['DRAFT', 'SUBMITTED', 'APPROVED'], default: 'DRAFT' },
    submittedById: { type: String, default: null },
    submittedAt: { type: Date, default: null },
    approvedById: { type: String, default: null },
    approvedAt: { type: Date, default: null },
    createdById: { type: String, default: null }
  },
  { timestamps: true }
);
// One card per student / term / year / report type. The legacy index without
// `type` is dropped in connectMongo so MIDTERM and TERM can coexist.
ReportCardSchema.index(
  { campusId: 1, studentId: 1, term: 1, year: 1, type: 1 },
  { unique: true, name: 'campusId_1_studentId_1_term_1_year_1_type_1' }
);
ReportCardSchema.index({ campusId: 1, classId: 1, term: 1, year: 1 });
ReportCardSchema.index({ campusId: 1, status: 1 });

const MarkSchema = makeSchema(
  {
    campusId: campusField,
    reportCardId: { type: String, required: true },
    subjectId: { type: String, required: true },
    caScore: { type: Number, default: null },
    midtermScore: { type: Number, default: null },
    examScore: { type: Number, default: null },
    total: { type: Number, default: null },
    grade: { type: String, default: null },
    remark: { type: String, default: null },
    competency: { type: String, default: null },
    teacherId: { type: String, default: null }
  },
  { timestamps: true }
);
MarkSchema.index({ campusId: 1, reportCardId: 1, subjectId: 1 }, { unique: true });
MarkSchema.index({ campusId: 1, subjectId: 1 });

// One singleton setting document per campus; its _id is the campus id.
const SettingSchema = new Schema(
  {
    _id: { type: String, enum: CAMPUSES, required: true },
    schoolName: { type: String, default: 'LPAREPORTS' },
    schoolMotto: { type: String, default: 'excellent working for success' },
    schoolAddress: { type: String, default: 'P.O. Box 100, Kigali, Rwanda' },
    schoolPhone: { type: String, default: '+250 700 000 000' },
    schoolEmail: { type: String, default: 'info@peacelight.com' },
    headTeacherName: { type: String, default: 'Head Teacher' },
    dosName: { type: String, default: 'Director of Studies' },
    gradingScales: { type: Schema.Types.Mixed, default: () => DEFAULT_GRADING_SCALES },
    passMark: { type: Number, default: 50 },
    lowPerformanceThreshold: { type: Number, default: 40 },
    lowPerformanceMinSubjects: { type: Number, default: 2 },
    courseworkWeight: { type: Number, default: 40 },
    examWeight: { type: Number, default: 60 }
  },
  {
    timestamps: true,
    toJSON: { virtuals: false, transform },
    toObject: { virtuals: false, transform }
  }
);

const SystemSettingSchema = new Schema(
  {
    _id: { type: String, default: 'GLOBAL' },
    studentRegistrationEnabled: { type: Boolean, default: true },
    loginDisabledExceptSuperAdmin: { type: Boolean, default: false }
  },
  {
    timestamps: { createdAt: false, updatedAt: 'updatedAt' },
    toJSON: { virtuals: false, transform },
    toObject: { virtuals: false, transform }
  }
);

const AuditLogSchema = makeSchema(
  {
    campusId: campusField,
    userId: { type: String, default: null },
    userName: { type: String, required: true },
    userRole: { type: String, required: true },
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: { type: String, default: null },
    description: { type: String, default: null },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);
AuditLogSchema.index({ campusId: 1, createdAt: -1 });
AuditLogSchema.index({ campusId: 1, userId: 1 });
AuditLogSchema.index({ campusId: 1, entity: 1 });

export const models = {
  user: mongoose.model('User', UserSchema),
  teacherClass: mongoose.model('TeacherClass', TeacherClassSchema),
  teacherSubject: mongoose.model('TeacherSubject', TeacherSubjectSchema),
  schoolClass: mongoose.model('SchoolClass', SchoolClassSchema),
  subject: mongoose.model('Subject', SubjectSchema),
  student: mongoose.model('Student', StudentSchema),
  reportCard: mongoose.model('ReportCard', ReportCardSchema),
  mark: mongoose.model('Mark', MarkSchema),
  setting: mongoose.model('Setting', SettingSchema),
  systemSetting: mongoose.model('SystemSetting', SystemSettingSchema),
  auditLog: mongoose.model('AuditLog', AuditLogSchema)
};

export const modelMeta = {
  user: 'User',
  teacherClass: 'TeacherClass',
  teacherSubject: 'TeacherSubject',
  schoolClass: 'SchoolClass',
  subject: 'Subject',
  student: 'Student',
  reportCard: 'ReportCard',
  mark: 'Mark',
  setting: 'Setting',
  systemSetting: 'SystemSetting',
  auditLog: 'AuditLog'
};

export async function connectMongo(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });

  // Backfill legacy Atlas documents BEFORE building campus-scoped unique indexes.
  const campusModels = [
    'user',
    'teacherClass',
    'teacherSubject',
    'schoolClass',
    'subject',
    'student',
    'reportCard',
    'mark',
    'auditLog'
  ];
  await Promise.all(
    campusModels.map((key) =>
      models[key].updateMany(
        { $or: [{ campusId: { $exists: false } }, { campusId: null }] },
        { $set: { campusId: 'MAIN' } }
      )
    )
  );

  // Legacy docs had no report type; TERM preserves their meaning.
  await models.reportCard.updateMany(
    { $or: [{ type: { $exists: false } }, { type: null }] },
    { $set: { type: 'TERM', studentName: '' } }
  );

  // Drop the old unique index that ignored `type` so MIDTERM and TERM reports
  // can exist for the same learner/term/year.
  await models.reportCard.collection
    .dropIndex('campusId_1_studentId_1_term_1_year_1')
    .catch(() => {});

  // Attendance fields were removed from report cards.
  await models.reportCard.updateMany(
    {
      $or: [
        { attendancePresent: { $exists: true } },
        { attendanceTotal: { $exists: true } }
      ]
    },
    { $unset: { attendancePresent: '', attendanceTotal: '' } }
  );

  // The old settings singleton used the id "1"; move it to the MAIN campus.
  const legacySetting = await models.setting.findOne({ _id: '1' }).lean();
  if (legacySetting && !(await models.setting.exists({ _id: 'MAIN' }))) {
    const { _id, ...fields } = legacySetting;
    await models.setting.create({ _id: 'MAIN', ...fields });
    await models.setting.deleteOne({ _id: '1' });
  }

  // Ensure global switches exist with safe defaults.
  await models.systemSetting.updateOne(
    { _id: 'GLOBAL' },
    {
      $setOnInsert: {
        studentRegistrationEnabled: true,
        loginDisabledExceptSuperAdmin: false
      }
    },
    { upsert: true }
  );

  // Build unique/secondary indexes before the app starts serving requests.
  await Promise.all(Object.values(models).map((model) => model.init()));
}

export async function disconnectMongo() {
  await mongoose.disconnect();
}
