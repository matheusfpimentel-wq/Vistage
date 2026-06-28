import { useState } from "react";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import {
  CSV_ENTITIES,
  exportAllCsv,
  exportEntityCsv,
  importCsvIntoTable,
  pickAndParseCsv,
  type CsvEntityKey,
} from "@/lib/csv";

export function CsvImportExport() {
  const [entity, setEntity] = useState<CsvEntityKey>("gigs");
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingData, setPendingData] = useState<string[][]>([]);
  const [exportingAll, setExportingAll] = useState(false);

  const selected = CSV_ENTITIES.find((e) => e.key === entity)!;

  async function handleExport() {
    setExporting(true);
    try {
      const path = await exportEntityCsv(selected.table);
      if (path) toast.success(`Salvo: ${path}`);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setExporting(false);
    }
  }

  async function handleExportAll() {
    setExportingAll(true);
    try {
      const res = await exportAllCsv();
      if (res) {
        toast.success(
          `${res.files} tabela(s) exportada(s) num .zip` +
            (res.skippedEmpty.length > 0
              ? ` (${res.skippedEmpty.length} vazia(s) pulada(s))`
              : "")
        );
      }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setExportingAll(false);
    }
  }

  async function handleImport() {
    setImporting(true);
    try {
      const data = await pickAndParseCsv();
      if (!data) return;
      setPendingData(data);
      setConfirmOpen(true);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
      setImporting(false);
    }
  }

  async function doImport() {
    setConfirmOpen(false);
    try {
      const res = await importCsvIntoTable(selected.table, pendingData, "append");
      if (res.errors.length > 0) {
        // mostra o primeiro erro real pra dar pra depurar (coluna faltando,
        // constraint, data inválida etc.)
        toast.error(
          `Importadas ${res.inserted}, puladas ${res.skipped}. ${res.errors[0]}`
        );
      } else {
        toast.success(
          `Importadas ${res.inserted}, puladas ${res.skipped}`
        );
      }
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setImporting(false);
      setPendingData([]);
    }
  }

  const rowCount = pendingData.length > 0 ? pendingData.length - 1 : 0;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Exportar / Importar CSV
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={entity} onValueChange={(v) => setEntity(v as CsvEntityKey)}>
            <SelectTrigger className="max-w-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CSV_ENTITIES.map((e) => (
                <SelectItem key={e.key} value={e.key}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleExport} disabled={exporting}>
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Exportar CSV
            </Button>
            <Button
              variant="outline"
              onClick={handleImport}
              disabled={importing}
            >
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Importar CSV
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            O cabeçalho do CSV precisa bater com as colunas da tabela.
          </p>

          <div className="border-t pt-3">
            <Button
              variant="secondary"
              onClick={handleExportAll}
              disabled={exportingAll}
            >
              {exportingAll ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Exportar tudo em CSV
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Gera um único arquivo .zip com um CSV por tabela.
            </p>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={(o) => {
        if (!o) {
          setConfirmOpen(false);
          setImporting(false);
          setPendingData([]);
        }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Importar CSV</DialogTitle>
            <DialogDescription>
              Importar {rowCount} linha{rowCount !== 1 ? "s" : ""} para{" "}
              <strong>{selected.label}</strong>. Os registros serão adicionados sem substituir os existentes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmOpen(false); setImporting(false); setPendingData([]); }}>
              Cancelar
            </Button>
            <Button onClick={() => void doImport()}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
