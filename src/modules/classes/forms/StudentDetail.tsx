import { useEffect, useState } from "react";
import {
  CalendarRange,
  Instagram,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import {
  createStudentPackage,
  deleteStudentPackage,
  getStudent,
  listClasses,
  listPackages,
  listStudentPackages,
  setStudentPackageStatus,
  type ClassWithStudent,
} from "../api";
import { ClassForm } from "./ClassForm";
import {
  classStatusVariant,
  type ClassPackage,
  type Student,
  type StudentPackage,
} from "../types";
import { formatCurrency, formatDate, todayISO } from "@/lib/format";

function minutesToHoursStr(min: number | null): string {
  if (min == null) return "";
  const h = min / 60;
  return h.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: number | null;
  onEdit: (s: Student) => void;
};

export function StudentDetail({ open, onOpenChange, studentId, onEdit }: Props) {
  const [student, setStudent] = useState<Student | null>(null);
  const [packages, setPackages] = useState<StudentPackage[]>([]);
  const [classes, setClasses] = useState<ClassWithStudent[]>([]);
  const [templates, setTemplates] = useState<ClassPackage[]>([]);
  const [classFormOpen, setClassFormOpen] = useState(false);
  const [pkgToSell, setPkgToSell] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    if (!studentId) return;
    setLoading(true);
    try {
      const [s, pkgs, cls, tpls] = await Promise.all([
        getStudent(studentId),
        listStudentPackages(studentId),
        listClasses({ studentId }),
        listPackages(true),
      ]);
      setStudent(s);
      setPackages(pkgs);
      setClasses(cls);
      setTemplates(tpls);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && studentId) void refresh();
  }, [open, studentId]);

  async function handleSellPackage() {
    if (!studentId || !pkgToSell) return;
    if (saving) return;
    const tpl = templates.find((t) => t.id === Number(pkgToSell));
    if (!tpl) return;
    setSaving(true);
    try {
      await createStudentPackage({
        student_id: studentId,
        package_id: tpl.id,
        total_classes: 0,
        total_hours: tpl.total_hours,
        used_classes: 0,
        used_minutes: 0,
        purchased_at: todayISO(),
        status: "Ativo",
        notes: null,
      });
      setPkgToSell("");
      await refresh();
      toast.success(`Pacote "${tpl.name}" vendido`);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelPackage(p: StudentPackage) {
    if (saving) return;
    if (!(await confirmDialog("Cancelar este pacote?"))) return;
    setSaving(true);
    try {
      await setStudentPackageStatus(p.id, "Cancelado");
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePackage(p: StudentPackage) {
    if (saving) return;
    if (!(await confirmDialog({ title: "Excluir", description: "Excluir este pacote? As aulas vinculadas a ele viram avulsa.", confirmLabel: "Excluir", destructive: true }))) return;
    setSaving(true);
    try {
      await deleteStudentPackage(p.id);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!studentId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        {loading || !student ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Carregando…
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <DialogTitle>{student.name}</DialogTitle>
                  {student.acquisition && (
                    <Badge variant="outline" className="gap-1">
                      <Sparkles className="h-3 w-3" />
                      Via {student.acquisition}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => onEdit(student)}>
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Button>
                  <Button size="sm" onClick={() => setClassFormOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> Nova aula
                  </Button>
                </div>
              </div>
            </DialogHeader>

            <div className="grid grid-cols-1 gap-2 rounded-md border p-3 text-sm sm:grid-cols-2">
              {student.phone && (
                <Row
                  icon={<Phone className="h-3.5 w-3.5" />}
                  label="Telefone"
                  value={student.phone}
                />
              )}
              {student.email && (
                <Row
                  icon={<Mail className="h-3.5 w-3.5" />}
                  label="Email"
                  value={student.email}
                />
              )}
              {student.instagram && (
                <Row
                  icon={<Instagram className="h-3.5 w-3.5" />}
                  label="Instagram"
                  value={student.instagram}
                />
              )}
              {student.city && (
                <Row
                  icon={<MapPin className="h-3.5 w-3.5" />}
                  label="Cidade"
                  value={student.city}
                />
              )}
            </div>

            {student.notes && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                {student.notes}
              </div>
            )}

            <Tabs defaultValue="classes">
              <TabsList>
                <TabsTrigger value="classes">
                  Aulas ({classes.length})
                </TabsTrigger>
                <TabsTrigger value="packages">
                  Pacotes ({packages.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="classes">
                {classes.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    Nenhuma aula com esse aluno ainda.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {classes.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between rounded-md border p-2.5 text-sm"
                      >
                        <div>
                          <div className="font-medium">
                            {formatDate(c.date)}
                            {c.start_time && ` · ${c.start_time}`}
                          </div>
                          {c.subject && (
                            <div className="text-xs text-muted-foreground">
                              {c.subject}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {c.amount && (
                            <span className="tabular-nums text-muted-foreground">
                              {formatCurrency(c.amount)}
                            </span>
                          )}
                          <Badge variant={classStatusVariant(c.status)}>
                            {c.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="packages" className="space-y-3">
                <div className="rounded-md border p-3 space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Vender pacote
                  </div>
                  <div className="flex gap-2">
                    <Select value={pkgToSell} onValueChange={setPkgToSell}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Selecione um pacote-template" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id.toString()}>
                            {t.name}
                            {t.total_hours != null
                              ? ` — ${String(t.total_hours).replace(".", ",")}h`
                              : ""}
                            {t.price ? ` · ${formatCurrency(t.price)}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={handleSellPackage} disabled={!pkgToSell || saving}>
                      <ShoppingCart className="h-4 w-4" /> Vender
                    </Button>
                  </div>
                </div>

                {packages.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    Aluno sem pacotes — toda aula vira avulsa.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {packages.map((p) => {
                      const tpl = templates.find((t) => t.id === p.package_id);
                      const isHoursBased = tpl?.total_hours != null;
                      const totalMin = isHoursBased ? Math.round(tpl!.total_hours! * 60) : null;
                      const usedPct = isHoursBased
                        ? totalMin! > 0 ? (p.used_minutes / totalMin!) * 100 : 0
                        : p.total_classes > 0 ? (p.used_classes / p.total_classes) * 100 : 0;
                      const usedLabel = isHoursBased
                        ? `${minutesToHoursStr(p.used_minutes)}h / ${tpl!.total_hours}h`
                        : `${p.used_classes}/${p.total_classes} aulas`;
                      const remainingLabel = isHoursBased
                        ? `${minutesToHoursStr(totalMin! - p.used_minutes)}h restantes`
                        : `${p.total_classes - p.used_classes} restantes`;
                      return (
                        <div
                          key={p.id}
                          className="space-y-2 rounded-md border p-3 text-sm"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <CalendarRange className="h-4 w-4" />
                              <span className="font-medium">Pacote #{p.id}</span>
                              <span className="text-xs text-muted-foreground">
                                comprado em {formatDate(p.purchased_at)}
                              </span>
                            </div>
                            <Badge
                              variant={
                                p.status === "Ativo"
                                  ? "success"
                                  : p.status === "Concluído"
                                  ? "info"
                                  : "secondary"
                              }
                            >
                              {p.status}
                            </Badge>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">
                                {usedLabel}
                              </span>
                              <span className="tabular-nums">
                                {remainingLabel}
                              </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full bg-primary-gradient"
                                style={{ width: `${usedPct}%` }}
                              />
                            </div>
                          </div>
                          <div className="flex justify-end gap-2">
                            {p.status === "Ativo" && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={saving}
                                onClick={() => handleCancelPackage(p)}
                              >
                                Cancelar pacote
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={saving}
                              onClick={() => handleDeletePackage(p)}
                            >
                              Excluir
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <ClassForm
              open={classFormOpen}
              onOpenChange={setClassFormOpen}
              defaultStudentId={studentId}
              onSaved={refresh}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="truncate">{value}</span>
    </div>
  );
}
