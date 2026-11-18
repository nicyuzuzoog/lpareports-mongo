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

const ROLES = ['SUPER_ADMIN', 'DOS', 'HEAD_TEACHER', 'TEACHER'];
const LEVELS = ['NURSERY', 'LOWER_PRIMARY', 'UPPER_PRIMARY'];
const TERMS = ['TERM1', 'TERM2', 'TERM3'];

const UserSchema = makeSchema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: { type: String, default: null },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, default: 'TEACHER' },
    isActive: { type: Boolean, default: true },
    canDelete: { type: Boolean, default: false }
  },
  { timestamps: true }
);
UserSchema.index({ role: 1 });

const TeacherClassSchema = makeSchema({ userId: { type: String, required: true }, classId: { type: String, required: true } });
TeacherClassSchema.index({ userId: 1, classId: 1 }, { unique: true });

const TeacherSubjectSchema = makeSchema({
  userId: { type: String, required: true },
  subjectId: { type: String, required: true }
});
TeacherSubjectSchema.index({ userId: 1, subjectId: 1 }, { unique: true });

const SchoolClassSchema = makeSchema(
  {
    name: { type: String, required: true, unique: true },
    level: { type: String, enum: LEVELS, required: true },
    classTeacherId: { type: String, default: null }
  },
  { timestamps: true }
);
SchoolClassSchema.index({ level: 1 });

const SubjectSchema = makeSchema(
  {
    name: { type: String, required: true, unique: true },
    code: { type: String, required: true, unique: true },
    levels: { type: [String], enum: LEVELS, default: [] },
    position: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

const StudentSchema = makeSchema(
  {
    code: { type: String, required: true, unique: true },
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
StudentSchema.index({ classId: 1 });
StudentSchema.index({ lastName: 1, firstName: 1 });

const ReportCardSchema = makeSchema(
  {
    studentId: { type: String, required: true },
    classId: { type: String, required: true },
    term: { type: String, enum: TERMS, required: true },
    year: { type: Number, required: true },
    attendancePresent: { type: Number, default: null },
    attendanceTotal: { type: Number, default: null },
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
ReportCardSchema.index({ studentId: 1, term: 1, year: 1 }, { unique: true });
ReportCardSchema.index({ classId: 1, term: 1, year: 1 });
ReportCardSchema.index({ status: 1 });

const MarkSchema = makeSchema(
  {
    reportCardId: { type: String, required: true },
    subjectId: { type: String, required: true },
    caScore: { type: Number, default: null },
    examScore: { type: Number, default: null },
    total: { type: Number, default: null },
    grade: { type: String, default: null },
    remark: { type: String, default: null },
    competency: { type: String, default: null },
    teacherId: { type: String, default: null }
  },
  { timestamps: true }
);
MarkSchema.index({ reportCardId: 1, subjectId: 1 }, { unique: true });
MarkSchema.index({ subjectId: 1 });

const SettingSchema = makeSchema(
  {
    schoolName: { type: String, default: 'LPACAMIS' },
    schoolMotto: { type: String, default: 'Knowledge, Character, Service' },
    schoolAddress: { type: String, default: 'P.O. Box 100, Kampala, Uganda' },
    schoolPhone: { type: String, default: '+256 700 000 000' },
    schoolEmail: { type: String, default: 'info@lpacamis.ac.ug' },
    headTeacherName: { type: String, default: 'Head Teacher' },
    dosName: { type: String, default: 'Director of Studies' },
    gradingScales: { type: Schema.Types.Mixed, default: () => DEFAULT_GRADING_SCALES },
    passMark: { type: Number, default: 50 },
    lowPerformanceThreshold: { type: Number, default: 40 },
    lowPerformanceMinSubjects: { type: Number, default: 2 },
    courseworkWeight: { type: Number, default: 40 },
    examWeight: { type: Number, default: 60 }
  },
  { timestamps: true }
);
// Singleton document, keeping the historic id "1" used by the API.
SettingSchema.remove('_id');
SettingSchema.add({ _id: { type: String, default: '1' } });

const AuditLogSchema = makeSchema(
  {
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
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ userId: 1 });
AuditLogSchema.index({ entity: 1 });

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
  auditLog: 'AuditLog'
};

export async function connectMongo(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  // Build unique/secondary indexes before the app starts serving requests.
  await Promise.all(Object.values(models).map((model) => model.init()));
}

export async function disconnectMongo() {
  await mongoose.disconnect();
}
