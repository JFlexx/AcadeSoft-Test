/**
 * Who to email about a student: their guardians' addresses or, if no
 * guardian has one, the student's own. Lower-cased and de-duplicated.
 */
export function familyEmails(student: {
  email: string | null;
  guardians: { email: string | null }[];
}): string[] {
  const guardians = [
    ...new Set(
      student.guardians
        .map((g) => g.email?.trim().toLowerCase())
        .filter((e): e is string => !!e),
    ),
  ];
  if (guardians.length > 0) return guardians;
  return student.email ? [student.email.trim().toLowerCase()] : [];
}
