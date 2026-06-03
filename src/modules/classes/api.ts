import { getDb } from "@/lib/db";
import { emitDataChanged } from "@/lib/events";
import type {
  ClassPackage,
  ClassPackageCreateInput,
  ClassPackageUpdateInput,
  ClassSession,
  ClassSessionCreateInput,
  ClassSessionUpdateInput,
  ClassStatus,
  Student,
  StudentCreateInput,
  StudentPackage,
  StudentPackageCreateInput,
  StudentPackageStatus,
  StudentUpdateInput,
} from "./types";

// ============================================================
// Students
// ============================================================

export type StudentFilters = {
  search?: string;
};

export async function listStudents(filters: StudentFilters = {}): Promise<Student[]> {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.search && filters.search.trim().length > 0) {
    const q = `%${filters.search.trim()}%`;
    params.push(q, q, q, q);
    const i = params.length;
    where.push(
      `(name LIKE $${i - 3} OR email LIKE $${i - 2} OR phone LIKE $${i - 1} OR instagram LIKE $${i})`
    );
  }
  const sql =
    "SELECT * FROM students" +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    " ORDER BY name COLLATE NOCASE ASC";
  return db.select<Student[]>(sql, params);
}

export async function getStudent(id: number): Promise<Student | null> {
  const db = getDb();
  const rows = await db.select<Student[]>("SELECT * FROM students WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function createStudent(input: StudentCreateInput): Promise<number> {
  const db = getDb();
  const cols = Object.keys(input);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const values = cols.map((k) => (input as Record<string, unknown>)[k]);
  const res = await db.execute(
    `INSERT INTO students (${cols.join(", ")}) VALUES (${placeholders})`,
    values
  );
  return Number(res.lastInsertId);
}

export async function updateStudent(input: StudentUpdateInput): Promise<void> {
  const db = getDb();
  const { id, ...rest } = input;
  const cols = Object.keys(rest);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((k) => (rest as Record<string, unknown>)[k]);
  values.push(id);
  await db.execute(
    `UPDATE students SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`,
    values
  );
}

export async function deleteStudent(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM students WHERE id = $1", [id]);
}

// ============================================================
// Class Packages (templates)
// ============================================================

export async function listPackages(activeOnly = false): Promise<ClassPackage[]> {
  const db = getDb();
  const sql = activeOnly
    ? "SELECT * FROM class_packages WHERE active = 1 ORDER BY name"
    : "SELECT * FROM class_packages ORDER BY active DESC, name";
  return db.select<ClassPackage[]>(sql);
}

export async function createPackage(input: ClassPackageCreateInput): Promise<number> {
  const db = getDb();
  const cols = Object.keys(input);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const values = cols.map((k) => (input as Record<string, unknown>)[k]);
  const res = await db.execute(
    `INSERT INTO class_packages (${cols.join(", ")}) VALUES (${placeholders})`,
    values
  );
  return Number(res.lastInsertId);
}

export async function updatePackage(input: ClassPackageUpdateInput): Promise<void> {
  const db = getDb();
  const { id, ...rest } = input;
  const cols = Object.keys(rest);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((k) => (rest as Record<string, unknown>)[k]);
  values.push(id);
  await db.execute(
    `UPDATE class_packages SET ${sets} WHERE id = $${values.length}`,
    values
  );
}

export async function deletePackage(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM class_packages WHERE id = $1", [id]);
}

// ============================================================
// Student Packages (instâncias compradas)
// ============================================================

export async function listStudentPackages(
  studentId: number
): Promise<StudentPackage[]> {
  const db = getDb();
  return db.select<StudentPackage[]>(
    `SELECT * FROM student_packages WHERE student_id = $1
     ORDER BY status = 'Ativo' DESC, purchased_at DESC`,
    [studentId]
  );
}

export async function getActiveStudentPackage(
  studentId: number
): Promise<StudentPackage | null> {
  const db = getDb();
  const rows = await db.select<StudentPackage[]>(
    `SELECT * FROM student_packages
      WHERE student_id = $1 AND status = 'Ativo' AND used_classes < total_classes
      ORDER BY purchased_at ASC LIMIT 1`,
    [studentId]
  );
  return rows[0] ?? null;
}

export async function createStudentPackage(
  input: StudentPackageCreateInput
): Promise<number> {
  const db = getDb();
  const cols = Object.keys(input);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const values = cols.map((k) => (input as Record<string, unknown>)[k]);
  const res = await db.execute(
    `INSERT INTO student_packages (${cols.join(", ")}) VALUES (${placeholders})`,
    values
  );
  return Number(res.lastInsertId);
}

export async function setStudentPackageStatus(
  id: number,
  status: StudentPackageStatus
): Promise<void> {
  const db = getDb();
  await db.execute(
    "UPDATE student_packages SET status = $1 WHERE id = $2",
    [status, id]
  );
}

export async function deleteStudentPackage(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM student_packages WHERE id = $1", [id]);
}

// ============================================================
// Classes
// ============================================================

export type ClassFilters = {
  status?: ClassStatus | "Todas";
  studentId?: number;
  fromDate?: string;
  toDate?: string;
  month?: string;
};

export type ClassWithStudent = ClassSession & { student_name: string };

export async function listClasses(
  filters: ClassFilters = {}
): Promise<ClassWithStudent[]> {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.status && filters.status !== "Todas") {
    params.push(filters.status);
    where.push(`c.status = $${params.length}`);
  }
  if (filters.studentId) {
    params.push(filters.studentId);
    where.push(`c.student_id = $${params.length}`);
  }
  if (filters.fromDate) {
    params.push(filters.fromDate);
    where.push(`c.date >= $${params.length}`);
  }
  if (filters.toDate) {
    params.push(filters.toDate);
    where.push(`c.date <= $${params.length}`);
  }
  if (filters.month) {
    params.push(`${filters.month}-01`, `${filters.month}-31`);
    where.push(
      `c.date BETWEEN $${params.length - 1} AND $${params.length}`
    );
  }

  const sql =
    `SELECT c.*, s.name as student_name
       FROM classes c JOIN students s ON s.id = c.student_id` +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    " ORDER BY c.date DESC, c.start_time DESC";
  return db.select<ClassWithStudent[]>(sql, params);
}

export async function getClass(id: number): Promise<ClassSession | null> {
  const db = getDb();
  const rows = await db.select<ClassSession[]>(
    "SELECT * FROM classes WHERE id = $1",
    [id]
  );
  return rows[0] ?? null;
}

export async function createClass(input: ClassSessionCreateInput): Promise<number> {
  const db = getDb();
  const cols = Object.keys(input);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const values = cols.map((k) => (input as Record<string, unknown>)[k]);
  const res = await db.execute(
    `INSERT INTO classes (${cols.join(", ")}) VALUES (${placeholders})`,
    values
  );
  const id = Number(res.lastInsertId);
  // Cria tarefa se a aula é no futuro
  const today = new Date().toISOString().slice(0, 10);
  if (input.date && input.date > today) {
    try {
      const studentRows = await db.select<{ name: string }[]>(
        "SELECT name FROM students WHERE id = $1", [input.student_id]
      );
      const studentName = studentRows[0]?.name ?? "Aluno";
      const { createTask } = await import("@/modules/tasks/api");
      const taskId = await createTask({
        title: `Aula: ${studentName}`,
        description: input.subject ?? null,
        category: "Pessoal",
        gig_id: null,
        contact_id: null,
        priority: "Média",
        status: "A fazer",
        due_date: input.date,
        tags: ["aula"],
      });
      await db.execute("UPDATE classes SET task_id = $1 WHERE id = $2", [taskId, id]);
    } catch {
      /* não interrompe */
    }
  }
  return id;
}

export async function updateClass(input: ClassSessionUpdateInput): Promise<void> {
  const db = getDb();
  const { id, ...rest } = input;
  const cols = Object.keys(rest);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((k) => (rest as Record<string, unknown>)[k]);
  values.push(id);
  await db.execute(
    `UPDATE classes SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`,
    values
  );
  // Sincroniza tarefa vinculada quando a aula é marcada como Realizada
  if (input.status === "Realizada") {
    const rows = await db.select<{ task_id: number | null }[]>(
      "SELECT task_id FROM classes WHERE id = $1", [id]
    );
    const taskId = rows[0]?.task_id;
    if (taskId) {
      try {
        const { updateTask } = await import("@/modules/tasks/api");
        await updateTask({ id: taskId, status: "Concluída" });
      } catch {
        /* não interrompe */
      }
    }
  }
}

export async function deleteClass(id: number): Promise<void> {
  const db = getDb();
  const rows = await db.select<{ task_id: number | null }[]>(
    "SELECT task_id FROM classes WHERE id = $1",
    [id]
  );
  const taskId = rows[0]?.task_id ?? null;
  await db.execute("DELETE FROM classes WHERE id = $1", [id]);
  if (taskId) {
    await db.execute("DELETE FROM tasks WHERE id = $1", [taskId]);
  }
  emitDataChanged();
}

/**
 * Recalcula `used_classes` para todos os pacotes (chamado quando uma aula
 * vinculada a pacote é criada/editada/excluída ou muda de status).
 * Conta apenas classes com status Realizada.
 */
export async function recalcPackageUsage(studentPackageId: number): Promise<void> {
  const db = getDb();
  const rows = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) as n FROM classes
      WHERE student_package_id = $1 AND status = 'Realizada'`,
    [studentPackageId]
  );
  const used = rows[0]?.n ?? 0;
  await db.execute(
    "UPDATE student_packages SET used_classes = $1 WHERE id = $2",
    [used, studentPackageId]
  );
  // Marca como Concluído automaticamente quando atinge o total
  await db.execute(
    `UPDATE student_packages SET status = 'Concluído'
      WHERE id = $1 AND used_classes >= total_classes AND status = 'Ativo'`,
    [studentPackageId]
  );
}

// ============================================================
// Stats
// ============================================================

export type ClassStats = {
  studentCount: number;
  activePackages: number;
  classesThisMonth: number;
  doneThisMonth: number;
};

export async function getClassStats(): Promise<ClassStats> {
  const db = getDb();
  const month = new Date().toISOString().slice(0, 7);
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-31`;

  const [students, activePkgs, total, done] = await Promise.all([
    db.select<{ n: number }[]>("SELECT COUNT(*) as n FROM students"),
    db.select<{ n: number }[]>(
      `SELECT COUNT(*) as n FROM student_packages WHERE status = 'Ativo'`
    ),
    db.select<{ n: number }[]>(
      `SELECT COUNT(*) as n FROM classes WHERE date BETWEEN $1 AND $2`,
      [monthStart, monthEnd]
    ),
    db.select<{ n: number }[]>(
      `SELECT COUNT(*) as n FROM classes
        WHERE date BETWEEN $1 AND $2 AND status = 'Realizada'`,
      [monthStart, monthEnd]
    ),
  ]);

  return {
    studentCount: students[0]?.n ?? 0,
    activePackages: activePkgs[0]?.n ?? 0,
    classesThisMonth: total[0]?.n ?? 0,
    doneThisMonth: done[0]?.n ?? 0,
  };
}
