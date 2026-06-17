import { getDb } from "@/lib/db";
import { toLocalISODate, toLocalYearMonth } from "@/lib/format";
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

function parsePackageRow(row: Record<string, unknown>): ClassPackage {
  let items: ClassPackage["syllabus_items"] = [];
  const raw = row.syllabus_items;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) items = parsed;
    } catch {
      items = [];
    }
  } else if (Array.isArray(raw)) {
    items = raw as ClassPackage["syllabus_items"];
  }
  return { ...(row as ClassPackage), syllabus_items: items };
}

function serializePackageValue(key: string, value: unknown): unknown {
  if (key === "syllabus_items") return JSON.stringify(value ?? []);
  return value;
}

export async function listPackages(activeOnly = false): Promise<ClassPackage[]> {
  const db = getDb();
  const sql = activeOnly
    ? "SELECT * FROM class_packages WHERE active = 1 ORDER BY name"
    : "SELECT * FROM class_packages ORDER BY active DESC, name";
  const rows = await db.select<Record<string, unknown>[]>(sql);
  return rows.map(parsePackageRow);
}

export async function createPackage(input: ClassPackageCreateInput): Promise<number> {
  const db = getDb();
  const cols = Object.keys(input);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const values = cols.map((k) =>
    serializePackageValue(k, (input as Record<string, unknown>)[k])
  );
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
  const values = cols.map((k) =>
    serializePackageValue(k, (rest as Record<string, unknown>)[k])
  );
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
    `SELECT sp.* FROM student_packages sp
      LEFT JOIN class_packages cp ON cp.id = sp.package_id
      WHERE sp.student_id = $1 AND sp.status = 'Ativo'
        AND (cp.total_hours IS NULL OR sp.used_minutes < cp.total_hours * 60)
        AND (cp.total_hours IS NOT NULL OR sp.used_classes < sp.total_classes)
      ORDER BY sp.purchased_at ASC LIMIT 1`,
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
  const id = Number(res.lastInsertId);
  try {
    const { syncStudentPackageTransaction } = await import("@/modules/finance/api");
    await syncStudentPackageTransaction(id);
  } catch {
    /* não interrompe */
  }
  emitDataChanged();
  return id;
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
  // Cancelar/reativar reflete na receita lançada.
  try {
    const { syncStudentPackageTransaction } = await import("@/modules/finance/api");
    await syncStudentPackageTransaction(id);
  } catch {
    /* não interrompe */
  }
  emitDataChanged();
}

export async function deleteStudentPackage(id: number): Promise<void> {
  const db = getDb();
  // As aulas vinculadas viram avulsas (mantém o histórico do aluno).
  const affected = await db.select<{ id: number }[]>(
    "SELECT id FROM classes WHERE student_package_id = $1",
    [id]
  );
  await db.execute(
    "UPDATE classes SET student_package_id = NULL WHERE student_package_id = $1",
    [id]
  );
  await db.execute("DELETE FROM student_packages WHERE id = $1", [id]);
  try {
    const { deleteTransactionsForStudentPackage, syncClassTransaction } =
      await import("@/modules/finance/api");
    await deleteTransactionsForStudentPackage(id);
    // Aulas que viraram avulsas podem agora gerar receita própria.
    await Promise.all(affected.map((c) => syncClassTransaction(c.id)));
  } catch {
    /* não interrompe */
  }
  emitDataChanged();
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
  const today = toLocalISODate();
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
  try {
    const { syncClassTransaction } = await import("@/modules/finance/api");
    await syncClassTransaction(id);
  } catch {
    /* não interrompe */
  }
  emitDataChanged();
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
  // Sincroniza tarefa vinculada
  if ("date" in rest || input.status === "Realizada") {
    const rows = await db.select<{ task_id: number | null; date: string | null; student_id: number; subject: string | null }[]>(
      "SELECT task_id, date, student_id, subject FROM classes WHERE id = $1", [id]
    );
    const taskId = rows[0]?.task_id;
    const today = toLocalISODate();
    if (taskId) {
      try {
        const { updateTask } = await import("@/modules/tasks/api");
        const patch: Parameters<typeof updateTask>[0] = { id: taskId };
        if ("date" in rest) patch.due_date = rest.date as string | null;
        if (input.status === "Realizada") patch.status = "Concluída";
        await updateTask(patch);
      } catch {
        /* não interrompe */
      }
    } else if ("date" in rest && rows[0]?.date && rows[0].date > today && input.status !== "Realizada") {
      // Aula remarcada para o futuro sem tarefa (ex.: criada no passado) → cria agora
      try {
        const studentRows = await db.select<{ name: string }[]>(
          "SELECT name FROM students WHERE id = $1", [rows[0].student_id]
        );
        const studentName = studentRows[0]?.name ?? "Aluno";
        const { createTask } = await import("@/modules/tasks/api");
        const newTaskId = await createTask({
          title: `Aula: ${studentName}`,
          description: rows[0].subject ?? null,
          category: "Pessoal",
          gig_id: null,
          contact_id: null,
          priority: "Média",
          status: "A fazer",
          due_date: rows[0].date,
          tags: ["aula"],
        });
        await db.execute("UPDATE classes SET task_id = $1 WHERE id = $2", [newTaskId, id]);
      } catch {
        /* não interrompe */
      }
    }
  }
  try {
    const { syncClassTransaction } = await import("@/modules/finance/api");
    await syncClassTransaction(id);
  } catch {
    /* não interrompe */
  }
  emitDataChanged();
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
  try {
    const { deleteTransactionsForClass } = await import("@/modules/finance/api");
    await deleteTransactionsForClass(id);
  } catch {
    /* não interrompe */
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
  // Conta aulas Agendada + Realizada (já descontam do saldo)
  const rows = await db.select<{ n: number; total_min: number }[]>(
    `SELECT COUNT(*) as n, COALESCE(SUM(duration_min), 0) as total_min
       FROM classes
      WHERE student_package_id = $1 AND status IN ('Agendada', 'Realizada')`,
    [studentPackageId]
  );
  const used = rows[0]?.n ?? 0;
  const usedMin = rows[0]?.total_min ?? 0;
  await db.execute(
    "UPDATE student_packages SET used_classes = $1, used_minutes = $2 WHERE id = $3",
    [used, usedMin, studentPackageId]
  );
  // Pacote por carga horária: conclui quando esgota as horas
  await db.execute(
    `UPDATE student_packages SET status = 'Concluído'
      WHERE id = $1 AND status = 'Ativo' AND (
        SELECT total_hours FROM class_packages WHERE id = (
          SELECT package_id FROM student_packages WHERE id = $1
        )
      ) IS NOT NULL
      AND used_minutes >= (
        SELECT total_hours * 60 FROM class_packages WHERE id = (
          SELECT package_id FROM student_packages WHERE id = $1
        )
      )`,
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
  const month = toLocalYearMonth();
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-31`;

  const [students, activePkgs, total, done] = await Promise.all([
    db.select<{ n: number }[]>("SELECT COUNT(*) as n FROM students"),
    db.select<{ n: number }[]>(
      `SELECT COUNT(*) as n FROM class_packages WHERE active = 1`
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
