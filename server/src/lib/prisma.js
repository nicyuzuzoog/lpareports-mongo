/**
 * Thin Prisma-compatible facade used by the rest of the API.
 *
 * The routes were originally written against a Mongo-style repository with a
 * Prisma-shaped API. This module keeps that call surface (`prisma.user.find...`,
 * includes, nested writes, `$transaction`) while forwarding everything to the
 * generated Prisma Client for MySQL. Only two compatibility fixes live here:
 *
 *   1. `mode: 'insensitive'` is stripped recursively (MySQL is already
 *      case-insensitive with the default collation).
 *   2. `orderBy` on relation names is handled in memory after Prisma has
 *      attached the includes, because Prisma cannot sort by relations.
 *
 * No Mongo id translation (`_id`) remains — ids are plain Strings in MySQL.
 */
import { PrismaClient } from '@prisma/client';

/** Raw client, exported for code that needs Prisma directly. */
export const client = new PrismaClient();

const MODEL_KEYS = [
  'user',
  'teacherClass',
  'teacherSubject',
  'schoolClass',
  'subject',
  'student',
  'reportCard',
  'mark',
  'setting',
  'systemSetting',
  'auditLog'
];

/** Unique selectors Prisma accepts in `findUnique` / `update` / `upsert` / `delete`. */
const UNIQUE_KEYS = {
  user: ['campusId_email'],
  teacherClass: ['campusId_userId_classId'],
  teacherSubject: ['campusId_userId_subjectId'],
  schoolClass: ['campusId_name'],
  subject: ['campusId_code', 'campusId_name'],
  student: ['campusId_code'],
  reportCard: ['campusId_studentId_term_year_type'],
  mark: ['campusId_reportCardId_subjectId'],
  setting: [],
  systemSetting: [],
  auditLog: []
};

/**
 * Compound selectors, including the two legacy aliases used by the old
 * repository. They are expanded into plain scalar filters so that extra keys
 * such as `campusId` can still be honoured by a `findFirst` fallback.
 */
const COMPOUND_FIELDS = {
  campusId_email: ['campusId', 'email'],
  campusId_userId_classId: ['campusId', 'userId', 'classId'],
  campusId_userId_subjectId: ['campusId', 'userId', 'subjectId'],
  campusId_name: ['campusId', 'name'],
  campusId_code: ['campusId', 'code'],
  campusId_studentId_term_year_type: ['campusId', 'studentId', 'term', 'year', 'type'],
  campusId_reportCardId_subjectId: ['campusId', 'reportCardId', 'subjectId'],
  // Legacy Mongo-facade keys (the old report cards were unique per student,
  // term and year, and had no `type` field).
  studentId_term_year: ['studentId', 'term', 'year'],
  reportCardId_subjectId: ['reportCardId', 'subjectId']
};

/** Relations that can appear as `orderBy` keys (Prisma cannot sort by these). */
const RELATION_NAMES = {
  user: [
    'classes',
    'subjects',
    'assignedClasses',
    'createdStudents',
    'submittedReports',
    'approvedReports',
    'createdReports',
    'taughtMarks'
  ],
  teacherClass: ['user', 'class'],
  teacherSubject: ['user', 'subject'],
  schoolClass: ['students', 'reportCards', 'classTeacher', 'teacherClasses'],
  subject: ['marks', 'teacherSubjects'],
  student: ['reportCards', 'class', 'creator'],
  reportCard: ['student', 'class', 'marks', 'submittedBy', 'approvedBy', 'createdBy'],
  mark: ['reportCard', 'subject', 'teacher'],
  setting: [],
  systemSetting: [],
  auditLog: []
};

const isObject = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  !(typeof Buffer !== 'undefined' && Buffer.isBuffer(value));

/** Recursively remove Mongo-only `mode` operators; leave every other operator alone. */
function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!isObject(value)) return value;

  const result = {};
  for (const [key, raw] of Object.entries(value)) {
    if (key === 'mode') continue;
    result[key] = sanitize(raw);
  }
  return result;
}

function expandCompoundKeys(value) {
  if (Array.isArray(value)) return value.map(expandCompoundKeys);
  if (!isObject(value)) return value;

  const result = {};
  for (const [key, raw] of Object.entries(value)) {
    const fields = COMPOUND_FIELDS[key];
    if (fields && isObject(raw)) {
      for (const field of fields) {
        if (raw[field] !== undefined) result[field] = expandCompoundKeys(raw[field]);
      }
      if (key === 'studentId_term_year' && result.type === undefined) result.type = 'TERM';
    } else {
      result[key] = expandCompoundKeys(raw);
    }
  }
  return result;
}

function prepareArgs(args = {}) {
  const clean = sanitize(args);
  if (!isObject(clean.where)) return clean;
  return { ...clean, where: expandCompoundKeys(clean.where) };
}

function isDirectUnique(modelKey, where) {
  const keys = Object.keys(where).filter((key) => where[key] !== undefined);
  if (keys.length !== 1) return false;
  const [key] = keys;
  if (key === 'id') return typeof where.id === 'string';
  return Boolean(UNIQUE_KEYS[modelKey]?.includes(key) && isObject(where[key]));
}

function orderRules(modelKey, orderBy) {
  if (!orderBy) return null;

  const relations = new Set(RELATION_NAMES[modelKey] || []);
  const rules = [];
  const scalarOrderBy = [];
  const relationPaths = new Set();
  let hasRelation = false;

  for (const rule of Array.isArray(orderBy) ? orderBy : [orderBy]) {
    if (!isObject(rule)) continue;
    for (const [key, direction] of Object.entries(rule)) {
      if (direction === undefined) continue;
      if (relations.has(key)) {
        hasRelation = true;
        const nested = [];
        flattenOrder(key, direction, nested);
        rules.push(...nested);
        nested.forEach(([path]) => relationPaths.add(path));
      } else {
        // Scalar fields stay in Prisma's orderBy, but are also kept in the
        // in-memory sort so their priority is preserved when a relation sort
        // forces the rest of the ordering to happen after the query.
        rules.push([key, direction]);
        scalarOrderBy.push({ [key]: direction });
      }
    }
  }

  if (!hasRelation) return null;
  return {
    rules,
    prismaOrderBy: scalarOrderBy.length ? scalarOrderBy : undefined,
    // Only relation paths need their relations loaded into the result. Scalar
    // fields are already present; adding them to `include` makes Prisma throw.
    paths: [...relationPaths]
  };
}

function flattenOrder(prefix, value, out) {
  if (isObject(value)) {
    for (const [key, nested] of Object.entries(value)) {
      if (nested === undefined) continue;
      flattenOrder(`${prefix}.${key}`, nested, out);
    }
    return;
  }
  out.push([prefix, value]);
}

/** Make sure the relations used by an in-memory sort are actually loaded. */
function ensureRelationsForSort(args, paths) {
  const roots = [...new Set(paths.map((path) => path.split('.')[0]))];
  if (!roots.length) return;

  if (args.select) {
    for (const root of roots) {
      if (args.select[root]) continue;
      const leaf = paths.find((path) => path.startsWith(`${root}.`))?.split('.')[1] || 'id';
      args.select[root] = { select: { [leaf]: true } };
    }
    return;
  }

  args.include = args.include || {};
  for (const root of roots) {
    if (args.include[root] === undefined) args.include[root] = true;
  }
}

function sortValue(object, path) {
  return path.split('.').reduce((value, key) => {
    if (value === null || value === undefined) return null;
    if (key === '_count') {
      if (Array.isArray(value)) return value.length;
      if (typeof value.count === 'number') return value.count;
      return null;
    }
    return value[key] ?? null;
  }, object);
}

function comparable(value) {
  if (value instanceof Date) return value.getTime();
  return value;
}

function compareValues(a, b, direction) {
  const left = comparable(a);
  const right = comparable(b);
  if (left == null && right == null) return 0;
  // Nulls always sort last, regardless of direction.
  if (left == null) return 1;
  if (right == null) return -1;

  const result = left < right ? -1 : left > right ? 1 : 0;
  return direction === 'desc' ? -result : result;
}

function sortRows(rows, rules) {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      for (const [path, direction] of rules) {
        const result = compareValues(sortValue(a.row, path), sortValue(b.row, path), direction);
        if (result !== 0) return result;
      }
      // Stable, deterministic tiebreaker independent of database row order.
      return compareValues(String(a.row?.id ?? ''), String(b.row?.id ?? ''), 'asc') || a.index - b.index;
    })
    .map(({ row }) => row);
}

function paginate(rows, skip, take) {
  const start = Math.max(0, Number(skip) || 0);
  if (take === undefined || take === null) return rows.slice(start);
  return rows.slice(start, start + Math.max(0, Number(take) || 0));
}

function makeFacade(source) {
  const model = (modelKey) => source[modelKey];

  function hasWhere(where) {
    return isObject(where) && Object.keys(where).length > 0;
  }

  async function findManyRaw(modelKey, args = {}) {
    const prepared = prepareArgs(args);
    const sort = orderRules(modelKey, prepared.orderBy);

    // Native Prisma path: no relation sorting, no extra work.
    if (!sort) return model(modelKey).findMany(prepared);

    const query = { ...prepared };
    delete query.skip;
    delete query.take;
    if (sort.prismaOrderBy) query.orderBy = sort.prismaOrderBy;
    else delete query.orderBy;
    ensureRelationsForSort(query, sort.paths);

    const rows = await model(modelKey).findMany(query);
    return paginate(sortRows(rows, sort.rules), prepared.skip, prepared.take);
  }

  const api = {
    findUnique: async (modelKey, args = {}) => {
      const prepared = prepareArgs(args);
      const { where } = prepared;
      if (isDirectUnique(modelKey, where)) return model(modelKey).findUnique(prepared);
      // Extra campus filters and legacy compound keys are not valid selectors
      // for findUnique; findFirst honours them natively.
      return model(modelKey).findFirst(prepared);
    },

    findFirst: async (modelKey, args = {}) => {
      const prepared = prepareArgs(args);
      if (!orderRules(modelKey, prepared.orderBy)) return model(modelKey).findFirst(prepared);
      const rows = await findManyRaw(modelKey, { ...prepared, take: 1 });
      return rows[0] || null;
    },

    findMany: (modelKey, args = {}) => findManyRaw(modelKey, args),

    count: (modelKey, args = {}) => model(modelKey).count(prepareArgs(args)),

    create: (modelKey, args = {}) => model(modelKey).create(prepareArgs(args)),

    update: async (modelKey, args = {}) => {
      const prepared = prepareArgs(args);
      if (isDirectUnique(modelKey, prepared.where || {})) {
        return model(modelKey).update(prepared);
      }
      if (!hasWhere(prepared.where)) throw new Error('update() requires a where clause.');
      const found = await model(modelKey).findFirst({ where: prepared.where });
      if (!found) return null;
      return model(modelKey).update({ ...prepared, where: { id: found.id } });
    },

    delete: async (modelKey, args = {}) => {
      const prepared = prepareArgs(args);
      if (isDirectUnique(modelKey, prepared.where || {})) {
        return model(modelKey).delete(prepared);
      }
      if (!hasWhere(prepared.where)) throw new Error('delete() requires a where clause.');
      const found = await model(modelKey).findFirst({ where: prepared.where });
      if (!found) return null;
      return model(modelKey).delete({ ...prepared, where: { id: found.id } });
    },

    upsert: async (modelKey, args = {}) => {
      const prepared = prepareArgs(args);
      if (isDirectUnique(modelKey, prepared.where || {})) {
        return model(modelKey).upsert(prepared);
      }
      if (!hasWhere(prepared.where)) throw new Error('upsert() requires a where clause.');
      const found = await model(modelKey).findFirst({ where: prepared.where });
      if (found) {
        const { where, create, update, ...rest } = prepared;
        return model(modelKey).update({ ...rest, where: { id: found.id }, data: update });
      }
      const { where, update, create, ...rest } = prepared;
      return model(modelKey).create({ ...rest, data: create });
    },

    createMany: (modelKey, args = {}) => model(modelKey).createMany(prepareArgs(args)),

    deleteMany: (modelKey, args = {}) => model(modelKey).deleteMany(prepareArgs(args))
  };

  const facade = {};
  for (const key of MODEL_KEYS) {
    facade[key] = {
      findUnique: (args) => api.findUnique(key, args),
      findFirst: (args) => api.findFirst(key, args),
      findMany: (args) => api.findMany(key, args),
      count: (args) => api.count(key, args),
      create: (args) => api.create(key, args),
      update: (args) => api.update(key, args),
      delete: (args) => api.delete(key, args),
      upsert: (args) => api.upsert(key, args),
      createMany: (args) => api.createMany(key, args),
      deleteMany: (args) => api.deleteMany(key, args)
    };
  }

  facade.$connect = () => client.$connect();
  facade.$disconnect = () => client.$disconnect();
  facade.$transaction = (argument, options) => {
    if (Array.isArray(argument)) return client.$transaction(argument, options);
    return client.$transaction((tx) => argument(makeFacade(tx)), options);
  };

  return facade;
}

export const prisma = makeFacade(client);

export default client;
