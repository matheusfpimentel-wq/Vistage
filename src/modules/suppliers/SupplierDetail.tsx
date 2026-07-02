import { useEffect, useState } from "react";
import { Instagram, Mail, MapPin, Pencil, Phone, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { EMPTY_VALUE, formatCurrency, formatDate } from "@/lib/format";
import { getSupplier, listServices, listPartiesBySupplier, getSupplierSpend } from "./api";
import type { Supplier, SupplierService } from "./types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierId: number | null;
  onEdit: (supplier: Supplier) => void;
};

export function SupplierDetail({ open, onOpenChange, supplierId, onEdit }: Props) {
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [services, setServices] = useState<SupplierService[]>([]);
  const [parties, setParties] = useState<
    { id: number; title: string; date: string | null; status: string; role: string | null; amount_cents: number | null }[]
  >([]);
  const [spend, setSpend] = useState<{ total: number; itemCount: number; parties: number } | null>(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    if (!supplierId) return;
    setLoading(true);
    try {
      const [s, svcs, prts, spd] = await Promise.all([
        getSupplier(supplierId),
        listServices(supplierId),
        listPartiesBySupplier(supplierId),
        getSupplierSpend(supplierId),
      ]);
      setSupplier(s);
      setServices(svcs);
      setParties(prts);
      setSpend(spd);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && supplierId) void refresh();
  }, [open, supplierId]);

  if (!supplier && !loading) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-start justify-between gap-2">
            <span>{loading ? "Carregando…" : supplier?.name}</span>
            {supplier && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onEdit(supplier);
                  onOpenChange(false);
                }}
              >
                <Pencil className="mr-1 h-3.5 w-3.5" />
                Editar
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        {supplier && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {supplier.category && (
                <Badge variant="secondary">{supplier.category}</Badge>
              )}
              {supplier.city && (
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {supplier.city}
                </span>
              )}
              {supplier.rating != null && supplier.rating > 0 && (
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={cn(
                        "h-4 w-4",
                        s <= (supplier.rating ?? 0)
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-muted-foreground/40"
                      )}
                    />
                  ))}
                </div>
              )}
            </div>

            {spend && spend.itemCount > 0 && (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                Total gasto: {formatCurrency(spend.total)} · {spend.itemCount}{" "}
                {spend.itemCount === 1 ? "item" : "itens"} · {spend.parties}{" "}
                {spend.parties === 1 ? "festa" : "festas"}
              </div>
            )}

            {supplier.contact_name && (
              <div className="text-sm">
                <span className="font-medium">Contato:</span> {supplier.contact_name}
              </div>
            )}

            <div className="space-y-1.5">
              {supplier.phone && (
                <a
                  href={`tel:${supplier.phone}`}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {supplier.phone}
                </a>
              )}
              {supplier.email && (
                <a
                  href={`mailto:${supplier.email}`}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {supplier.email}
                </a>
              )}
              {supplier.instagram && (
                <a
                  href={`https://instagram.com/${supplier.instagram.replace(/^@/, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  <Instagram className="h-3.5 w-3.5" />
                  {supplier.instagram}
                </a>
              )}
            </div>

            {supplier.notes && (
              <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                {supplier.notes}
              </div>
            )}

            {/* Services table */}
            {services.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Serviços / Tabela de preços</h3>
                <div className="overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="px-3 py-2 text-left font-medium">Descrição</th>
                        <th className="px-3 py-2 text-left font-medium">Unidade</th>
                        <th className="px-3 py-2 text-right font-medium">Preço</th>
                      </tr>
                    </thead>
                    <tbody>
                      {services.map((svc) => (
                        <tr key={svc.id} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="px-3 py-2">{svc.description}</td>
                          <td className="px-3 py-2 text-muted-foreground">{svc.unit ?? EMPTY_VALUE}</td>
                          <td className="px-3 py-2 text-right">
                            {svc.price != null ? formatCurrency(svc.price) : EMPTY_VALUE}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Festas atendidas */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Festas atendidas</h3>
              {parties.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma festa registrada com este fornecedor.
                </p>
              ) : (
                <div className="space-y-2">
                  {parties.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-start justify-between gap-2 rounded-md border p-3 text-sm"
                    >
                      <div className="space-y-1">
                        <div className="font-medium">{p.title}</div>
                        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                          <span>{p.date ? formatDate(p.date) : "Sem data"}</span>
                          <Badge variant="secondary">{p.status}</Badge>
                          {p.role && <span>{p.role}</span>}
                        </div>
                      </div>
                      <div className="shrink-0 text-right font-medium">
                        {p.amount_cents != null
                          ? formatCurrency(p.amount_cents / 100)
                          : EMPTY_VALUE}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
