import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarRange,
  GraduationCap,
  Package as PackageIcon,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { confirm } from "@/components/ui/confirm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { StudentForm } from "./forms/StudentForm";
import { PackageForm } from "./forms/PackageForm";
import { ClassForm } from "./forms/ClassForm";
import { StudentDetail } from "./forms/StudentDetail";
import {
  deleteClass,
  deletePackage,
  deleteStudent,
  getClassStats,
  listClasses,
  listPackages,
  listStudents,
  recalcPackageUsage,
  type ClassFilters,
  type ClassStats,
  type ClassWithStudent,
} from "./api";
import {
  CLASS_STATUSES,
  classStatusVariant,
  type ClassPackage,
  type ClassSession,
  type ClassStatus,
  type Student,
} from "./types";
import { formatCurrency, formatDate } from "@/lib/format";
import { useNewItemShortcut } from "@/lib/shortcuts";

type StatusFilter = ClassStatus | "Todas";

export function ClassesPage() {
  const [classes, setClasses] = useState<ClassWithStudent[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [packages, setPackages] = useState<ClassPackage[]>([]);
  const [stats, setStats] = useState<ClassStats | null>(null);
  const [filters, setFilters] = useState<{
    status: StatusFilter;
    studentId: number | "all";
    search: string;
  }>({ status: "Todas", studentId: "all", search: "" });

  const [classFormOpen, setClassFormOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassSession | null>(null);

  const [studentFormOpen, setStudentFormOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const [pkgFormOpen, setPkgFormOpen] = useState(false);
  const [editingPkg, setEditingPkg] = useState<ClassPackage | null>(null);

  const queryFilters: ClassFilters = useMemo(
    () => ({
      status: filters.status,
      studentId:
        filters.studentId === "all" ? undefined : (filters.studentId as number),
    }),
    [filters]
  );

  const refresh = useCallback(async () => {
    const [cls, sts, pkgs, st] = await Promise.all([
      listClasses(queryFilters),
      listStudents(),
      listPackages(),
      getClassStats(),
    ]);
    const filtered =
      filters.search.trim().length > 0
        ? cls.filter((c) =>
            (c.student_name + " " + (c.subject ?? ""))
              .toLowerCase()
              .includes(filters.search.toLowerCase())
          )
        : cls;
    setClasses(filtered);
    setStudents(sts);
    setPackages(pkgs);
    setStats(st);
  }, [queryFilters, filters.search]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Ctrl+N na aba de aulas cria aula nova
  useNewItemShortcut(() => {
    setEditingClass(null);
    setClassFormOpen(true);
  });

  async function handleDeleteClass(c: ClassWithStudent) {
    if (!(await confirm({ description: "Excluir esta aula?" }))) return;
    const pkgId = c.student_package_id;
    await deleteClass(c.id);
    if (pkgId) await recalcPackageUsage(pkgId);
    toast.success("Aula excluída");
    await refresh();
  }

  async function handleDeleteStudent(s: Student) {
    if (
      !(await confirm({
        description: `Excluir "${s.name}"? Aulas e pacotes vinculados serão removidos.`,
      }))
    )
      return;
    await deleteStudent(s.id);
    toast.success("Aluno excluído");
    await refresh();
  }

  async function handleDeletePackage(p: ClassPackage) {
    if (!(await confirm({ description: `Excluir o template de pacote "${p.name}"?` }))) return;
    await deletePackage(p.id);
    toast.success("Pacote excluído");
    await refresh();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi
          icon={<GraduationCap className="h-4 w-4" />}
          label="Alunos"
          value={stats?.studentCount ?? 0}
        />
        <Kpi
          icon={<PackageIcon className="h-4 w-4" />}
          label="Pacotes ativos"
          value={stats?.activePackages ?? 0}
        />
        <Kpi
          icon={<CalendarRange className="h-4 w-4" />}
          label="Aulas no mês"
          value={stats?.classesThisMonth ?? 0}
        />
        <Kpi
          icon={<CalendarRange className="h-4 w-4 text-emerald-500" />}
          label="Realizadas no mês"
          value={stats?.doneThisMonth ?? 0}
        />
      </div>

      <Tabs defaultValue="classes">
        <TabsList>
          <TabsTrigger value="classes">Aulas</TabsTrigger>
          <TabsTrigger value="students">Alunos</TabsTrigger>
          <TabsTrigger value="packages">Pacotes</TabsTrigger>
        </TabsList>

        {/* ====================== AULAS ====================== */}
        <TabsContent value="classes" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar aluno ou matéria…"
                  value={filters.search}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, search: e.target.value }))
                  }
                  className="w-64 pl-8"
                />
              </div>
              <Select
                value={filters.studentId.toString()}
                onValueChange={(v) =>
                  setFilters((f) => ({
                    ...f,
                    studentId: v === "all" ? "all" : Number(v),
                  }))
                }
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os alunos</SelectItem>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id.toString()}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filters.status}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, status: v as StatusFilter }))
                }
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Todas">Todos os status</SelectItem>
                  {CLASS_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => {
                setEditingClass(null);
                setClassFormOpen(true);
              }}
              disabled={students.length === 0}
              title={students.length === 0 ? "Cadastre um aluno antes" : ""}
            >
              <Plus className="h-4 w-4" /> Nova aula
            </Button>
          </div>

          {classes.length === 0 ? (
            <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
              {students.length === 0
                ? "Cadastre um aluno na aba ao lado e depois agende a primeira aula."
                : "Nenhuma aula encontrada."}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Data</th>
                    <th className="px-3 py-2 text-left">Aluno</th>
                    <th className="px-3 py-2 text-left">Matéria</th>
                    <th className="px-3 py-2 text-left">Modalidade</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                    <th className="px-3 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map((c) => (
                    <tr
                      key={c.id}
                      className="border-t transition-colors hover:bg-muted/40"
                    >
                      <td className="px-3 py-2 tabular-nums">
                        {formatDate(c.date)}
                        {c.start_time && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            · {c.start_time}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-medium">{c.student_name}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {c.subject ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline">
                          {c.student_package_id ? "Pacote" : "Avulsa"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={classStatusVariant(c.status)}>
                          {c.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCurrency(c.amount)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setEditingClass(c);
                              setClassFormOpen(true);
                            }}
                            aria-label="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDeleteClass(c)}
                            aria-label="Excluir"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ====================== ALUNOS ====================== */}
        <TabsContent value="students" className="space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setEditingStudent(null);
                setStudentFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Novo aluno
            </Button>
          </div>
          {students.length === 0 ? (
            <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
              <GraduationCap className="mx-auto mb-2 h-8 w-8 opacity-50" />
              Nenhum aluno ainda.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Nome</th>
                    <th className="px-3 py-2 text-left">Captação</th>
                    <th className="px-3 py-2 text-left">Cidade</th>
                    <th className="px-3 py-2 text-left">Contato</th>
                    <th className="px-3 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr
                      key={s.id}
                      className="cursor-pointer border-t transition-colors hover:bg-muted/40"
                      onClick={() => {
                        setDetailId(s.id);
                        setDetailOpen(true);
                      }}
                    >
                      <td className="px-3 py-2 font-medium">{s.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {s.acquisition ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {s.city ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {s.instagram ?? s.email ?? s.phone ?? "—"}
                      </td>
                      <td
                        className="px-3 py-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setEditingStudent(s);
                              setStudentFormOpen(true);
                            }}
                            aria-label="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDeleteStudent(s)}
                            aria-label="Excluir"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ====================== PACOTES (templates) ====================== */}
        <TabsContent value="packages" className="space-y-4">
          <div className="flex justify-between">
            <p className="text-sm text-muted-foreground">
              Templates de pacote. Vincule a um aluno na tela de detalhe dele.
            </p>
            <Button
              onClick={() => {
                setEditingPkg(null);
                setPkgFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Novo pacote
            </Button>
          </div>

          {packages.length === 0 ? (
            <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
              <PackageIcon className="mx-auto mb-2 h-8 w-8 opacity-50" />
              Nenhum pacote-template cadastrado.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {packages.map((p) => (
                <Card key={p.id} className={p.active === 0 ? "opacity-60" : ""}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{p.name}</CardTitle>
                        <CardDescription>
                          {p.total_classes} aulas
                          {p.price ? ` · ${formatCurrency(p.price)}` : ""}
                        </CardDescription>
                      </div>
                      {p.active === 0 && (
                        <Badge variant="secondary">inativo</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {p.description && (
                      <p className="text-muted-foreground whitespace-pre-wrap">
                        {p.description}
                      </p>
                    )}
                    {p.syllabus && (
                      <details className="rounded-md border bg-muted/30 p-2">
                        <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Ementa
                        </summary>
                        <pre className="mt-2 whitespace-pre-wrap font-sans text-xs">
                          {p.syllabus}
                        </pre>
                      </details>
                    )}
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setEditingPkg(p);
                          setPkgFormOpen(true);
                        }}
                        aria-label="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDeletePackage(p)}
                        aria-label="Excluir"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ClassForm
        open={classFormOpen}
        onOpenChange={setClassFormOpen}
        session={editingClass}
        onSaved={refresh}
      />
      <StudentForm
        open={studentFormOpen}
        onOpenChange={setStudentFormOpen}
        student={editingStudent}
        onSaved={() => void refresh()}
      />
      <PackageForm
        open={pkgFormOpen}
        onOpenChange={setPkgFormOpen}
        pkg={editingPkg}
        onSaved={refresh}
      />
      <StudentDetail
        open={detailOpen}
        onOpenChange={setDetailOpen}
        studentId={detailId}
        onEdit={(s) => {
          setDetailOpen(false);
          setEditingStudent(s);
          setStudentFormOpen(true);
        }}
      />
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2 text-xs">
          {icon}
          {label}
        </CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
