import { getDb } from "@/lib/db";
import { emitDataChanged } from "@/lib/events";
import {
  createTask,
  updateTask,
  deleteTask,
  setTaskLinks,
  syncLinkedTasksStatus,
  unlinkTasksFromEntity,
} from "@/modules/tasks/api";
import type { TaskPriority } from "@/modules/tasks/types";
import type {
  Meeting,
  MeetingCreateInput,
  MeetingUpdateInput,
} from "./types";

type MeetingRow = Omit<Meeting, "participants"> & { participants: string | null };

function rowToMeeting(r: MeetingRow): Meeting {
  let participants: string[] = [];
  if (r.participants) {
    try {
      const parsed = JSON.parse(r.participants);
      if (Array.isArray(parsed)) participants = parsed as string[];
    } catch {
      participants = [];
    }
  }
  return { ...r, participants };
}

/** Título da tarefa-lembrete derivada de uma reunião. */
function reminderTitle(title: string): string {
  return `Reunião: ${title}`;
}

export async function listMeetings(): Promise<Meeting[]> {
  const db = getDb();
  const rows = await db.select<MeetingRow[]>(
    `SELECT * FROM meetings
      ORDER BY
        CASE status
          WHEN 'Agendada' THEN 0
          WHEN 'Realizada' THEN 1
          WHEN 'Cancelada' THEN 2
        END,
        CASE WHEN date IS NULL THEN 1 ELSE 0 END,
        date ASC,
        time ASC`
  );
  return rows.map(rowToMeeting);
}

async function getMeeting(id: number): Promise<Meeting | null> {
  const db = getDb();
  const rows = await db.select<MeetingRow[]>(
    "SELECT * FROM meetings WHERE id = $1",
    [id]
  );
  return rows[0] ? rowToMeeting(rows[0]) : null;
}

/**
 * Cria a reunião. Se ficar "Agendada" e tiver data, cria automaticamente uma
 * tarefa-lembrete (categoria Administrativo, vencendo na data da reunião) e
 * guarda o vínculo em meetings.task_id.
 */
export async function createMeeting(input: MeetingCreateInput): Promise<number> {
  const db = getDb();
  let taskId: number | null = null;
  if (input.status === "Agendada" && input.date) {
    taskId = await createTask({
      title: reminderTitle(input.title),
      description: input.agenda?.trim() || null,
      category: "Administrativo",
      gig_id: null,
      contact_id: null,
      priority: "Média",
      status: "A fazer",
      due_date: input.date,
      tags: ["reunião"],
    });
  }
  const res = await db.execute(
    `INSERT INTO meetings
       (title, date, time, location, participants, agenda, notes, outcomes, status, task_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      input.title,
      input.date,
      input.time,
      input.location,
      JSON.stringify(input.participants ?? []),
      input.agenda,
      input.notes,
      input.outcomes,
      input.status,
      taskId,
    ]
  );
  emitDataChanged();
  return Number(res.lastInsertId);
}

/**
 * Atualiza a reunião e mantém a tarefa-lembrete em sincronia: ajusta
 * título/vencimento se a reunião continuar agendada e a cancela quando a
 * reunião é cancelada ou realizada.
 */
export async function updateMeeting(input: MeetingUpdateInput): Promise<void> {
  const db = getDb();
  const current = await getMeeting(input.id);
  if (!current) return;

  const next: Meeting = {
    ...current,
    ...input,
    participants: input.participants ?? current.participants,
  };

  // Sincroniza a tarefa-lembrete vinculada.
  if (current.task_id) {
    if (next.status === "Agendada") {
      await updateTask({
        id: current.task_id,
        title: reminderTitle(next.title),
        due_date: next.date,
      });
    } else {
      // Reunião saiu da agenda: cancela o lembrete em vez de deixá-lo pendente.
      await updateTask({ id: current.task_id, status: "Cancelada" });
    }
  }

  await db.execute(
    `UPDATE meetings SET
       title = $1, date = $2, time = $3, location = $4, participants = $5,
       agenda = $6, notes = $7, outcomes = $8, status = $9,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $10`,
    [
      next.title,
      next.date,
      next.time,
      next.location,
      JSON.stringify(next.participants),
      next.agenda,
      next.notes,
      next.outcomes,
      next.status,
      input.id,
    ]
  );
  // Espelha o estado da reunião nas tarefas vinculadas (follow-ups etc.)
  if (next.status === "Realizada" || next.status === "Cancelada") {
    await syncLinkedTasksStatus(
      "meeting",
      input.id,
      next.status === "Realizada" ? "Concluída" : "Cancelada"
    );
  }
  emitDataChanged();
}

export async function deleteMeeting(id: number): Promise<void> {
  const db = getDb();
  const current = await getMeeting(id);
  if (current?.task_id) {
    await deleteTask(current.task_id);
  }
  await db.execute("DELETE FROM meetings WHERE id = $1", [id]);
  await unlinkTasksFromEntity("meeting", id);
  emitDataChanged();
}

/**
 * Cria uma tarefa de follow-up a partir de uma reunião (ex.: encaminhamentos
 * após a reunião acontecer). Não mexe na tarefa-lembrete original. A tarefa é
 * vinculada à reunião, então aparece na lista de tarefas vinculadas dela.
 */
export async function createFollowUpTask(
  meeting: Meeting,
  input: { title: string; due_date: string | null; priority?: TaskPriority }
): Promise<number> {
  const taskId = await createTask({
    title: input.title,
    description: `Follow-up da reunião "${meeting.title}".`,
    category: "Administrativo",
    gig_id: null,
    contact_id: null,
    priority: input.priority ?? "Média",
    status: "A fazer",
    due_date: input.due_date,
    tags: ["reunião"],
  });
  await setTaskLinks(taskId, [
    { entity_type: "meeting", entity_id: meeting.id, label: meeting.title },
  ]);
  emitDataChanged();
  return taskId;
}

/**
 * Transforma cada linha dos encaminhamentos em uma tarefa vinculada à reunião
 * ("ideia vira coisa"). Ignora marcadores de lista (-, *, •) no início. Retorna
 * quantas tarefas foram criadas.
 */
export async function createTasksFromOutcomes(meeting: Meeting): Promise<number> {
  const lines = (meeting.outcomes ?? "")
    .split("\n")
    .map((l) => l.replace(/^[-*•–—\s]+/, "").trim())
    .filter((l) => l.length > 0);
  let created = 0;
  for (const line of lines) {
    const taskId = await createTask({
      title: line,
      description: `Encaminhamento da reunião "${meeting.title}".`,
      category: "Administrativo",
      gig_id: null,
      contact_id: null,
      priority: "Média",
      status: "A fazer",
      due_date: null,
      tags: ["reunião", "encaminhamento"],
    });
    await setTaskLinks(taskId, [
      { entity_type: "meeting", entity_id: meeting.id, label: meeting.title },
    ]);
    created++;
  }
  if (created > 0) emitDataChanged();
  return created;
}
