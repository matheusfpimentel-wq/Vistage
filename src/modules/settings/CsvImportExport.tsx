import { useState } from "react";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  exportEntityCsv,
  importCsvIntoTable,
  pickAndParseCsv,
  type CsvEntityKey,
} from "@/lib/csv";

export function CsvImportExport() {
  const [entity, setEntity] = useState<CsvEntityKey>("gigs");
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

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

  async function handleImport() {
    setImporting(true);
    try {
      const data = await pickAndParseCsv();
      if (!data) return;
      const mode = window.confirm(
        `Importar ${data.length - 1} linha(s) para "${selected.label}":\n\n` +
          `OK = SUBSTITUIR tudo da tabela pelos dados do CSV\n` +
          `Cancelar = APENAS ADICIONAR (linhas duplicadas por id são ignoradas)`
      )
        ? "replace"
        : "append";

      const res = await importCsvIntoTable(selected.table, data, mode);
      const errMsg =
        res.errors.length > 0
          ? ` · ${res.errors.length} erro(s)`
          : "";
      toast.success(
        `Importadas ${res.inserted}, puladas ${res.skipped}${errMsg}`
      );
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          Exportar / Importar CSV
        </CardTitle>
        <CardDescription>
          Por entidade. Útil pra planilha, contador, importação em massa.
        </CardDescription>
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
          O cabeçalho do CSV precisa bater com as colunas da tabela. Exporte
          uma vez pra ver o formato exato.
        </p>
      </CardContent>
    </Card>
  );
}
