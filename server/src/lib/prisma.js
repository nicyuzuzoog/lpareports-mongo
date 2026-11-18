/**
 * Small repository facade over MongoDB/Mongoose.
 *
 * The rest of the API was written against a Prisma-style data API. Keeping
 * that surface here means the routes, services and audit code do not need to
 * know which database is behind them, and makes the MongoDB Atlas migration a
 * single-file swap. Query translation covers the operators and relation
 * includes used by this application.
 */
import { models, modelMeta, connectMongo, disconnectMongo } from '../models/index.js';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);

const plain = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);
const plainMany = (docs) => docs.map(plain);

async function findDocs(modelKey, filter) {
  return plainMany(await models[modelKey].find(filter));
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function translateValue(value) {
  if (value === null || value === undefined || !isObject(value)) return value;
  if (Array.isArray(value)) return { $in: value };

  const result = {};
  for (const [operator, operand] of Object.entries(value)) {
    switch (operator) {
      case 'in':
        result.$in = operand;
        break;
      case 'not':
        result.$ne = operand;
        break;
      case 'contains':
        result.$regex = escapeRegex(operand);
        if (value.mode === 'insensitive') result.$options = 'i';
        break;
      case 'startsWith':
        result.$regex = `^${escapeRegex(operand)}`;
        if (value.mode === 'insensitive') result.$options = 'i';
        break;
      case 'endsWith':
        result.$regex = `${escapeRegex(operand)}$`;
        if (value.mode === 'insensitive') result.$options = 'i';
        break;
      case 'has':
        result.$in = [operand];
        break;
      case 'gte':
        result.$gte = operand;
        break;
      case 'lte':
        result.$lte = operand;
        break;
      case 'gt':
        result.$gt = operand;
        break;
      case 'lt':
        result.$lt = operand;
        break;
      case 'mode':
        break;
      default:
        result[operator] = translateValue(operand);
    }
  }
  return result;
}

/** Relation filters used in `where`, e.g. `student: { OR: [...] }`. */
const RELATION_FILTERS = {
  Student: { class: { model: 'schoolClass', local: 'classId' } },
  ReportCard: {
    class: { model: 'schoolClass', local: 'classId' },
    student: { model: 'student', local: 'studentId' }
  }
};

async function translateWhere(meta, where = {}) {
  const result = {};
  for (const [key, raw] of Object.entries(where || {})) {
    if (raw === undefined) continue;

    if (['OR', 'AND', 'NOT'].includes(key)) {
      result[`$${key.toLowerCase()}`] = await Promise.all(
        raw.map((entry) => translateWhere(meta, entry))
      );
      continue;
    }
    if (key === 'id') {
      result._id = isObject(raw) ? translateValue(raw) : String(raw);
      continue;
    }

    const relation = RELATION_FILTERS[meta]?.[key];
    if (relation && isObject(raw)) {
      const related = await findDocs(relation.model, await translateWhere(modelMeta[relation.model], raw));
      result[relation.local] = { $in: related.map((doc) => doc.id) };
      continue;
    }

    result[key] = translateValue(raw);
  }
  return result;
}

/** Compound unique keys accepted by Prisma's `where`. */
const COMPOUND_KEYS = {
  studentId_term_year: ['studentId', 'term', 'year'],
  reportCardId_subjectId: ['reportCardId', 'subjectId']
};

function flattenUnique(where = {}) {
  const result = {};
  for (const [key, value] of Object.entries(where)) {
    if (COMPOUND_KEYS[key]) {
      for (const field of COMPOUND_KEYS[key]) result[field] = value[field];
    } else {
      result[key] = value;
    }
  }
  return result;
}

function mapIdField(data = {}) {
  const result = { ...data };
  if (Object.prototype.hasOwnProperty.call(result, 'id')) {
    result._id = String(result.id);
    delete result.id;
  }
  return result;
}

/** Relation loaders returning plain objects in the shape the routes expect. */
const RELATIONS = {
  User: {
    classes: {
      model: 'TeacherClass',
      load: async (doc) => {
        const rows = await findDocs('teacherClass', { userId: doc.id });
        const classes = await findDocs('schoolClass', { _id: { $in: rows.map((row) => row.classId) } });
        const byId = new Map(classes.map((item) => [item.id, item]));
        return rows.map((row) => ({ ...row, class: byId.get(row.classId) || null }));
      }
    },
    subjects: {
      model: 'TeacherSubject',
      load: async (doc) => {
        const rows = await findDocs('teacherSubject', { userId: doc.id });
        const subjects = await findDocs('subject', { _id: { $in: rows.map((row) => row.subjectId) } });
        const byId = new Map(subjects.map((item) => [item.id, item]));
        return rows.map((row) => ({ ...row, subject: byId.get(row.subjectId) || null }));
      }
    },
    classTeacherOf: {
      model: 'SchoolClass',
      load: (doc) => findDocs('schoolClass', { classTeacherId: doc.id })
    }
  },
  SchoolClass: {
    students: { model: 'Student', load: (doc) => findDocs('student', { classId: doc.id }) },
    reportCards: { model: 'ReportCard', load: (doc) => findDocs('reportCard', { classId: doc.id }) },
    classTeacher: {
      model: 'User',
      load: async (doc) => (await findDocs('user', { _id: doc.classTeacherId || '' }))[0] || null
    },
    teachers: { model: 'TeacherClass', load: (doc) => findDocs('teacherClass', { classId: doc.id }) }
  },
  Subject: {
    marks: { model: 'Mark', load: (doc) => findDocs('mark', { subjectId: doc.id }) },
    teachers: { model: 'TeacherSubject', load: (doc) => findDocs('teacherSubject', { subjectId: doc.id }) }
  },
  Student: {
    class: {
      model: 'SchoolClass',
      load: async (doc) => (await findDocs('schoolClass', { _id: doc.classId || '' }))[0] || null
    },
    reportCards: {
      model: 'ReportCard',
      load: (doc) => findDocs('reportCard', { studentId: doc.id })
    }
  },
  ReportCard: {
    student: { model: 'Student', load: async (doc) => (await findDocs('student', { _id: doc.studentId || '' }))[0] || null },
    class: { model: 'SchoolClass', load: async (doc) => (await findDocs('schoolClass', { _id: doc.classId || '' }))[0] || null },
    marks: { model: 'Mark', load: (doc) => findDocs('mark', { reportCardId: doc.id }) },
    submittedBy: { model: 'User', load: async (doc) => (await findDocs('user', { _id: doc.submittedById || '' }))[0] || null },
    approvedBy: { model: 'User', load: async (doc) => (await findDocs('user', { _id: doc.approvedById || '' }))[0] || null },
    createdBy: { model: 'User', load: async (doc) => (await findDocs('user', { _id: doc.createdById || '' }))[0] || null }
  },
  Mark: {
    reportCard: { model: 'ReportCard', load: async (doc) => (await findDocs('reportCard', { _id: doc.reportCardId || '' }))[0] || null },
    subject: { model: 'Subject', load: async (doc) => (await findDocs('subject', { _id: doc.subjectId || '' }))[0] || null },
    teacher: { model: 'User', load: async (doc) => (await findDocs('user', { _id: doc.teacherId || '' }))[0] || null }
  },
  AuditLog: {
    user: { model: 'User', load: async (doc) => (await findDocs('user', { _id: doc.userId || '' }))[0] || null }
  }
};

/** Simple predicate matcher for nested relation filters such as `students: { where: { isActive: true } }`. */
function matchesRelationWhere(doc, where = {}) {
  return Object.entries(where).every(([key, raw]) => {
    if (raw === undefined) return true;
    if (key === 'id') return String(doc.id) === String(raw);
    const value = doc[key];
    if (isObject(raw)) {
      if ('in' in raw) return raw.in.includes(value);
      if ('not' in raw) return value !== raw.not;
      if ('contains' in raw) {
        return String(value ?? '').toLowerCase().includes(String(raw.contains).toLowerCase());
      }
    }
    return value === raw;
  });
}

async function attachIncludes(meta, docs, include) {
  if (!include || !docs.length) return docs;

  for (const [key, spec] of Object.entries(include)) {
    if (key === '_count') {
      const names = Object.keys(spec?.select || {});
      await Promise.all(
        docs.map(async (doc) => {
          doc._count = {};
          for (const name of names) {
            const relation = RELATIONS[meta]?.[name];
            doc._count[name] = relation ? (await relation.load(doc)).length : 0;
          }
        })
      );
      continue;
    }

    const relation = RELATIONS[meta]?.[key];
    if (!relation) continue;

    await Promise.all(
      docs.map(async (doc) => {
        let value = await relation.load(doc);
        if (Array.isArray(value) && spec?.where) {
          value = value.filter((item) => matchesRelationWhere(item, spec.where));
        }
        if (Array.isArray(value)) {
          doc[key] = spec?.include ? await attachIncludes(relation.model, value, spec.include) : value;
        } else {
          doc[key] = value && spec?.include
            ? (await attachIncludes(relation.model, [value], spec.include))[0]
            : value;
        }
      })
    );
  }
  return docs;
}

function sortValue(object, path) {
  return path.split('.').reduce((value, key) => (value === null || value === undefined ? value : value[key]), object);
}

function compareValues(a, b, direction) {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  const result = a < b ? -1 : a > b ? 1 : 0;
  return direction === 'desc' ? -result : result;
}

function sortDocs(docs, orderBy) {
  if (!orderBy) return docs;
  const rules = (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap((rule) => {
    const entries = Object.entries(rule || {});
    if (entries.length === 1) {
      const [key, direction] = entries[0];
      if (isObject(direction)) {
        return Object.entries(direction).map(([nested, dir]) => [`${key}.${nested}`, dir]);
      }
    }
    return entries.map(([key, direction]) => [key, direction]);
  });
  if (!rules.length) return docs;

  return docs.slice().sort((a, b) => {
    for (const [path, direction] of rules) {
      const result = compareValues(sortValue(a, path), sortValue(b, path), direction);
      if (result !== 0) return result;
    }
    return 0;
  });
}

async function findMany(modelKey, args = {}) {
  const meta = modelMeta[modelKey];
  const filter = await translateWhere(meta, args.where);
  let docs = plainMany(await models[modelKey].find(filter));
  await attachIncludes(meta, docs, args.include);
  docs = sortDocs(docs, args.orderBy);
  const skip = args.skip || 0;
  return args.take === undefined ? docs.slice(skip) : docs.slice(skip, skip + args.take);
}

async function findFirst(modelKey, args = {}) {
  const docs = await findMany(modelKey, { ...args, take: 1 });
  return docs[0] || null;
}

async function findUnique(modelKey, args = {}) {
  const meta = modelMeta[modelKey];
  const where = flattenUnique(args.where || {});
  const filter = await translateWhere(meta, where);
  const doc = plain(await models[modelKey].findOne(filter));
  if (!doc) return null;
  await attachIncludes(meta, [doc], args.include);
  return doc;
}

async function count(modelKey, args = {}) {
  const meta = modelMeta[modelKey];
  const filter = await translateWhere(meta, args.where);
  return models[modelKey].countDocuments(filter);
}

async function create(modelKey, args = {}) {
  const data = mapIdField(args.data || {});
  const nested = {};
  for (const key of ['classes', 'subjects']) {
    if (data[key]?.create) {
      nested[key] = data[key].create;
      delete data[key];
    }
  }

  const doc = plain(await models[modelKey].create(data));
  for (const row of nested.classes || []) {
    await models.teacherClass.create({ userId: doc.id, classId: row.classId });
  }
  for (const row of nested.subjects || []) {
    await models.teacherSubject.create({ userId: doc.id, subjectId: row.subjectId });
  }
  await attachIncludes(modelMeta[modelKey], [doc], args.include);
  return doc;
}

async function updateById(modelKey, id, data = {}) {
  const record = await models[modelKey].findOne({ _id: id });
  if (!record) return null;

  for (const [key, value] of Object.entries(data)) {
    if (['classes', 'subjects'].includes(key) && value?.deleteMany !== undefined) {
      const model = key === 'classes' ? 'teacherClass' : 'teacherSubject';
      const field = key === 'classes' ? 'classId' : 'subjectId';
      await models[model].deleteMany({ userId: id });
      for (const row of value.create || []) {
        await models[model].create({ userId: id, [field]: row[field] });
      }
      continue;
    }
    record.set(key, value);
  }
  await record.save();
  return plain(record);
}

async function update(modelKey, args = {}) {
  const meta = modelMeta[modelKey];
  const where = flattenUnique(args.where || {});
  const filter = await translateWhere(meta, where);
  const existing = plain(await models[modelKey].findOne(filter));
  if (!existing) return null;

  const doc = await updateById(modelKey, existing.id, mapIdField(args.data || {}));
  await attachIncludes(meta, [doc], args.include);
  return doc;
}

async function remove(modelKey, args = {}) {
  const meta = modelMeta[modelKey];
  const where = flattenUnique(args.where || {});
  const filter = await translateWhere(meta, where);
  const doc = plain(await models[modelKey].findOne(filter));
  if (!doc) return null;

  if (modelKey === 'reportCard') {
    await models.mark.deleteMany({ reportCardId: doc.id });
  }
  if (modelKey === 'student') {
    const cards = await findDocs('reportCard', { studentId: doc.id });
    const cardIds = cards.map((card) => card.id);
    await models.mark.deleteMany({ reportCardId: { $in: cardIds } });
    await models.reportCard.deleteMany({ studentId: doc.id });
  }
  if (modelKey === 'user') {
    await models.teacherClass.deleteMany({ userId: doc.id });
    await models.teacherSubject.deleteMany({ userId: doc.id });
    await models.schoolClass.updateMany({ classTeacherId: doc.id }, { $set: { classTeacherId: null } });
    await models.reportCard.updateMany({ submittedById: doc.id }, { $set: { submittedById: null } });
    await models.reportCard.updateMany({ approvedById: doc.id }, { $set: { approvedById: null } });
    await models.mark.updateMany({ teacherId: doc.id }, { $set: { teacherId: null } });
  }
  if (modelKey === 'schoolClass') {
    await models.teacherClass.deleteMany({ classId: doc.id });
  }

  await models[modelKey].deleteOne({ _id: doc.id });
  return doc;
}

async function upsert(modelKey, args = {}) {
  const meta = modelMeta[modelKey];
  const where = flattenUnique(args.where || {});
  const filter = await translateWhere(meta, where);
  const existing = plain(await models[modelKey].findOne(filter));
  if (existing) return updateById(modelKey, existing.id, mapIdField(args.update || {}));
  return create(modelKey, { data: args.create || {} });
}

async function createMany(modelKey, args = {}) {
  const rows = (args.data || []).map(mapIdField);
  if (!rows.length) return { count: 0 };
  const result = await models[modelKey].insertMany(rows, { ordered: false });
  return { count: result.length };
}

async function deleteMany(modelKey, args = {}) {
  const meta = modelMeta[modelKey];
  const filter = await translateWhere(meta, args.where);
  const result = await models[modelKey].deleteMany(filter);
  return { count: result.deletedCount };
}

function modelApi(modelKey) {
  return {
    findUnique: (args) => findUnique(modelKey, args),
    findFirst: (args) => findFirst(modelKey, args),
    findMany: (args) => findMany(modelKey, args),
    count: (args) => count(modelKey, args),
    create: (args) => create(modelKey, args),
    update: (args) => update(modelKey, args),
    delete: (args) => remove(modelKey, args),
    upsert: (args) => upsert(modelKey, args),
    createMany: (args) => createMany(modelKey, args),
    deleteMany: (args) => deleteMany(modelKey, args)
  };
}

export const prisma = {
  user: modelApi('user'),
  teacherClass: modelApi('teacherClass'),
  teacherSubject: modelApi('teacherSubject'),
  schoolClass: modelApi('schoolClass'),
  subject: modelApi('subject'),
  student: modelApi('student'),
  reportCard: modelApi('reportCard'),
  mark: modelApi('mark'),
  setting: modelApi('setting'),
  auditLog: modelApi('auditLog'),
  $connect: () =>
    connectMongo(process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL),
  $disconnect: disconnectMongo,
  // Operations are already sequential; keep the same call signature without
  // requiring a MongoDB replica set for multi-document transactions.
  $transaction: async (callback) => callback(prisma)
};
