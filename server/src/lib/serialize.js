export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    canDelete: user.canDelete,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    classes: (user.classes || []).map((entry) => ({
      id: entry.class.id,
      name: entry.class.name,
      level: entry.class.level
    })),
    subjects: (user.subjects || []).map((entry) => ({
      id: entry.subject.id,
      name: entry.subject.name,
      code: entry.subject.code
    }))
  };
}

export function publicStudent(student) {
  if (!student) return null;
  return {
    id: student.id,
    code: student.code,
    firstName: student.firstName,
    lastName: student.lastName,
    otherNames: student.otherNames,
    fullName: [student.firstName, student.otherNames, student.lastName].filter(Boolean).join(' '),
    gender: student.gender,
    dateOfBirth: student.dateOfBirth,
    guardianName: student.guardianName,
    guardianPhone: student.guardianPhone,
    address: student.address,
    isActive: student.isActive,
    classId: student.classId,
    className: student.class?.name,
    level: student.class?.level,
    createdAt: student.createdAt,
    updatedAt: student.updatedAt
  };
}
