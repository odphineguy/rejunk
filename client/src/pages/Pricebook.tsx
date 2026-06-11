import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Edit3,
  FileImage,
  MoreHorizontal,
  PackageSearch,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { OperationsShell } from "@/components/OperationsShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  deletePricebookCategory,
  deletePricebookItem,
  getPricebook,
  savePricebookCategory,
  savePricebookItem,
} from "@/lib/pricebookStorage";
import { cn } from "@/lib/utils";
import type {
  PricebookCategory,
  PricebookCrewSize,
  PricebookItem,
  PricebookItemType,
  PricebookMode,
  PricebookPriceUnit,
} from "@/types/pricebook";

type PricebookTab = "items" | "categories";

const itemTypes: PricebookItemType[] = ["Service", "Product", "Fee"];

const crewOptions: PricebookCrewSize[] = [1, 2, 3];

const priceUnitOptions: { value: PricebookPriceUnit; label: string }[] = [
  { value: "flat", label: "Flat" },
  { value: "hourly", label: "Per hour" },
  { value: "per_item", label: "Per item" },
  { value: "per_mile", label: "Per mile" },
  { value: "per_30min", label: "Per 30 min" },
  { value: "percent", label: "Percent" },
];

const modeOptions: { value: PricebookMode; label: string }[] = [
  { value: "assembly_service", label: "Assembly & Service" },
  { value: "moving", label: "Moving & Delivery" },
  { value: "junk_removal", label: "Junk Removal" },
  { value: "surcharge_fee", label: "Surcharge / Fee" },
];

function truncate(value: string, max = 34) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max).trim()}...` : value;
}

function priceText(value: number) {
  return value.toFixed(2);
}

function unitSuffix(unit?: PricebookPriceUnit) {
  switch (unit) {
    case "hourly":
      return "/hr";
    case "per_item":
      return "/item";
    case "per_mile":
      return "/mi";
    case "per_30min":
      return "/30min";
    case "percent":
      return "%";
    default:
      return "";
  }
}

function numeric(value: string | number | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Safety crew classification badge (1 / ⚠️2 / ⚠️3 from Pricebook v4). */
function CrewBadge({ crewSize }: { crewSize?: PricebookCrewSize }) {
  if (!crewSize) return <span className="text-muted-foreground">—</span>;
  if (crewSize === 1) {
    return <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">1</span>;
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
      ⚠️ {crewSize}
    </span>
  );
}

export default function Pricebook() {
  const [pricebook, setPricebook] = useState(() => getPricebook());
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState("10");
  const [activeTab, setActiveTab] = useState<PricebookTab>("items");
  const [editingItem, setEditingItem] = useState<Partial<PricebookItem> | null>(null);
  const [editingCategory, setEditingCategory] = useState<Partial<PricebookCategory> | null>(null);

  useEffect(() => {
    const refresh = () => setPricebook(getPricebook());
    window.addEventListener("pricebook-updated", refresh);
    return () => window.removeEventListener("pricebook-updated", refresh);
  }, []);

  const categoryNameById = useMemo(
    () => Object.fromEntries(pricebook.categories.map((category) => [category.id, category.name])),
    [pricebook.categories],
  );

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return pricebook.items.filter((item) => {
      const searchable = [item.name, item.description, item.price, categoryNameById[item.categoryId], item.itemType, item.taxable ? "taxable" : "not taxable"]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return !normalizedQuery || searchable.includes(normalizedQuery);
    });
  }, [categoryNameById, pricebook.items, query]);

  const filteredCategories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return pricebook.categories.filter((category) => {
      const searchable = [category.name, category.description].join(" ").toLowerCase();
      return !normalizedQuery || searchable.includes(normalizedQuery);
    });
  }, [pricebook.categories, query]);

  const removeItem = (itemId: string) => {
    setPricebook(deletePricebookItem(itemId));
    toast.success("Item deleted");
  };

  const removeCategory = (categoryId: string) => {
    setPricebook(deletePricebookCategory(categoryId));
    toast.success("Category deleted");
  };

  return (
    <OperationsShell
      title="Pricebook"
      icon={PackageSearch}
      actions={
        <>
          <Button variant="outline" className="rounded-lg" onClick={() => setEditingCategory(newCategoryDraft())}>
            <Plus className="size-4" />
            Create Category
          </Button>
          <Button className="rounded-lg bg-[#155e3f] text-white hover:bg-[#0c4a30]" onClick={() => setEditingItem(newItemDraft(pricebook.categories[0]?.id))}>
            <Plus className="size-4" />
            Create Item
          </Button>
        </>
      }
    >
      <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-[400px]">
              <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search..." className="h-12 rounded-lg pl-10 pr-10" />
              {query && (
                <button type="button" onClick={() => setQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8a9180]" aria-label="Clear pricebook search">
                  <X className="size-4" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Select value={pageSize} onValueChange={setPageSize}>
                <SelectTrigger className="h-10 w-20 rounded-lg bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["10", "25", "50"].map((size) => (
                    <SelectItem key={size} value={size}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" className="size-10 rounded-lg">
                <MoreHorizontal className="size-4" />
              </Button>
            </div>
          </div>

          <div className="mt-6 flex border-b border-border">
            <TabButton active={activeTab === "items"} onClick={() => setActiveTab("items")}>
              Pricebook
            </TabButton>
            <TabButton active={activeTab === "categories"} onClick={() => setActiveTab("categories")}>
              Category
            </TabButton>
          </div>

          <div className="mt-5">
            {activeTab === "items" ? (
              <ItemsTable
                items={filteredItems}
                categories={categoryNameById}
                onEdit={setEditingItem}
                onDelete={removeItem}
              />
            ) : (
              <CategoriesTable categories={filteredCategories} onEdit={setEditingCategory} onDelete={removeCategory} />
            )}
          </div>
        </section>

      <ItemDialog
        open={Boolean(editingItem)}
        item={editingItem}
        categories={pricebook.categories}
        onOpenChange={(open) => {
          if (!open) setEditingItem(null);
        }}
        onSave={(item) => {
          const saved = savePricebookItem({
            ...item,
            name: item.name?.trim() || "New Item",
            categoryId: item.categoryId || pricebook.categories[0]?.id || "",
          });
          setEditingItem(null);
          toast.success(saved.id === item.id ? "Item updated" : "Item created");
        }}
      />
      <CategoryDialog
        open={Boolean(editingCategory)}
        category={editingCategory}
        onOpenChange={(open) => {
          if (!open) setEditingCategory(null);
        }}
        onSave={(category) => {
          const saved = savePricebookCategory({
            ...category,
            name: category.name?.trim() || "New Category",
          });
          setEditingCategory(null);
          toast.success(saved.id === category.id ? "Category updated" : "Category created");
        }}
      />
    </OperationsShell>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-w-28 border-b-4 border-transparent px-4 py-4 text-left text-base font-medium transition-colors",
        active ? "border-[#155e3f] text-[#155e3f]" : "text-foreground hover:text-[#155e3f]",
      )}
    >
      {children}
    </button>
  );
}

function ImagePlaceholder({ label }: { label: string }) {
  return (
    <div className="flex size-12 items-center justify-center rounded-lg bg-muted" aria-label={label}>
      <FileImage className="size-5 text-[#8a9180]" />
    </div>
  );
}

function ItemsTable({
  items,
  categories,
  onEdit,
  onDelete,
}: {
  items: PricebookItem[];
  categories: Record<string, string>;
  onEdit: (item: PricebookItem) => void;
  onDelete: (itemId: string) => void;
}) {
  return (
    <Table>
      <TableHeader className="bg-muted/30">
        <TableRow>
          <TableHead className="h-14 px-5">Name</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>Crew</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Taxable</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item, index) => (
          <TableRow key={item.id} className={index % 2 === 1 ? "bg-muted/20" : undefined}>
            <TableCell className="px-5 font-medium">
              <div className="flex items-center gap-2">
                {item.name}
                {item.photoRequired && (
                  <span title="Photos required before confirming final price" aria-label="Photos required">📷</span>
                )}
              </div>
            </TableCell>
            <TableCell className="max-w-[320px]">{truncate(item.description)}</TableCell>
            <TableCell className="whitespace-nowrap">
              {priceText(item.price)}
              {unitSuffix(item.priceUnit)}
              {item.priceNote && <div className="text-xs text-muted-foreground">{item.priceNote}</div>}
            </TableCell>
            <TableCell>
              <CrewBadge crewSize={item.crewSize} />
            </TableCell>
            <TableCell>{categories[item.categoryId] ?? ""}</TableCell>
            <TableCell>{item.taxable ? "Yes" : "No"}</TableCell>
            <TableCell className="text-right">
              <Button variant="ghost" size="icon" onClick={() => onDelete(item.id)} aria-label={`Delete ${item.name}`}>
                <Trash2 className="size-4 text-red-500" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onEdit(item)} aria-label={`Edit ${item.name}`}>
                <Edit3 className="size-4 text-[#8a9180]" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function CategoriesTable({
  categories,
  onEdit,
  onDelete,
}: {
  categories: PricebookCategory[];
  onEdit: (category: PricebookCategory) => void;
  onDelete: (categoryId: string) => void;
}) {
  return (
    <Table>
      <TableHeader className="bg-muted/30">
        <TableRow>
          <TableHead className="h-14 px-5">Category Name</TableHead>
          <TableHead>Image</TableHead>
          <TableHead>Description</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {categories.map((category, index) => (
          <TableRow key={category.id} className={index % 2 === 1 ? "bg-muted/20" : undefined}>
            <TableCell className="px-5 font-medium">{category.name}</TableCell>
            <TableCell>
              <ImagePlaceholder label={`${category.name} image`} />
            </TableCell>
            <TableCell className="max-w-[920px]">{category.description}</TableCell>
            <TableCell className="text-right">
              <Button variant="ghost" size="icon" onClick={() => onDelete(category.id)} aria-label={`Delete ${category.name}`}>
                <Trash2 className="size-4 text-red-500" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onEdit(category)} aria-label={`Edit ${category.name}`}>
                <Edit3 className="size-4 text-[#8a9180]" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function UploadRow({ onSelect }: { onSelect: (fileName: string) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <ImagePlaceholder label="Upload preview" />
        <div>
          <div className="font-semibold">Upload Image</div>
          <div className="mt-1 text-xs text-[#8a9180]">JPG or PNG, file size no more than 5MB</div>
        </div>
      </div>
      <Input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          onSelect(file.name);
          event.currentTarget.value = "";
        }}
      />
      <Button type="button" onClick={() => inputRef.current?.click()} className="rounded-lg bg-[#155e3f] text-white hover:bg-[#0c4a30]">
        <Upload className="size-4" />
        Select
      </Button>
    </div>
  );
}

function ItemDialog({
  open,
  item,
  categories,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  item: Partial<PricebookItem> | null;
  categories: PricebookCategory[];
  onOpenChange: (open: boolean) => void;
  onSave: (item: Partial<PricebookItem>) => void;
}) {
  const [draft, setDraft] = useState<Partial<PricebookItem>>({});

  useEffect(() => {
    if (item) setDraft(item);
  }, [item]);

  const updateDraft = (updates: Partial<PricebookItem>) => setDraft((current) => ({ ...current, ...updates }));
  const isEditing = Boolean(draft.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-xl p-6 sm:max-w-[960px]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <span>{isEditing ? "✍️" : "+"}</span>
            {isEditing ? "Update Item" : "Create an Item"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <UploadRow onSelect={(imageName) => updateDraft({ imageName })} />
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Item Name">
              <Input value={draft.name ?? ""} onChange={(event) => updateDraft({ name: event.target.value })} placeholder="Enter item name" className="h-12 rounded-lg" />
            </Field>
            <Field label="Model Number">
              <Input value={draft.modelNumber ?? ""} onChange={(event) => updateDraft({ modelNumber: event.target.value })} placeholder="Enter model number (optional)" className="h-12 rounded-lg" />
            </Field>
            <Field label="Price">
              <Input value={String(draft.price ?? 0)} onChange={(event) => updateDraft({ price: numeric(event.target.value) })} className="h-12 rounded-lg" />
            </Field>
            <Field label="Your Cost (optional)">
              <Input value={String(draft.cost ?? 0)} onChange={(event) => updateDraft({ cost: numeric(event.target.value) })} className="h-12 rounded-lg" />
            </Field>
            <Field label="Category">
              <Select value={draft.categoryId || undefined} onValueChange={(categoryId) => updateDraft({ categoryId })}>
                <SelectTrigger className="h-12 rounded-lg bg-card">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Item Type">
              <Select value={draft.itemType ?? "Service"} onValueChange={(itemType) => updateDraft({ itemType: itemType as PricebookItemType })}>
                <SelectTrigger className="h-12 rounded-lg bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {itemTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Price Unit">
              <Select value={draft.priceUnit ?? "flat"} onValueChange={(priceUnit) => updateDraft({ priceUnit: priceUnit as PricebookPriceUnit })}>
                <SelectTrigger className="h-12 rounded-lg bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priceUnitOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Crew Size (safety)">
              <Select
                value={draft.crewSize ? String(draft.crewSize) : "none"}
                onValueChange={(value) => updateDraft({ crewSize: value === "none" ? undefined : (Number(value) as PricebookCrewSize) })}
              >
                <SelectTrigger className="h-12 rounded-lg bg-card">
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not set</SelectItem>
                  {crewOptions.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size === 1 ? "1 worker" : `⚠️ ${size} workers`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Mode">
              <Select value={draft.mode ?? undefined} onValueChange={(mode) => updateDraft({ mode: mode as PricebookMode })}>
                <SelectTrigger className="h-12 rounded-lg bg-card">
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  {modeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Margin % (optional)">
              <Input
                value={draft.marginDecimal != null ? String(Math.round(draft.marginDecimal * 100)) : ""}
                onChange={(event) => {
                  const raw = event.target.value.trim();
                  updateDraft({ marginDecimal: raw === "" ? undefined : numeric(raw) / 100 });
                }}
                placeholder="e.g. 52"
                className="h-12 rounded-lg"
              />
            </Field>
            <Field label="Price Note (optional)">
              <Input value={draft.priceNote ?? ""} onChange={(event) => updateDraft({ priceNote: event.target.value })} placeholder='e.g. "$125–$175" or "+$125"' className="h-12 rounded-lg" />
            </Field>
          </div>
          <Field label="Item Description">
            <Textarea value={draft.description ?? ""} onChange={(event) => updateDraft({ description: event.target.value })} placeholder="Enter item description (optional)" className="min-h-24 resize-none rounded-lg p-6" />
          </Field>
          <Field label="Internal Notes (optional)">
            <Textarea value={draft.notes ?? ""} onChange={(event) => updateDraft({ notes: event.target.value })} placeholder='Crew/handling notes, e.g. "Wall anchoring included" or "NEVER solo"' className="min-h-20 resize-none rounded-lg p-6" />
          </Field>
          <div className="grid gap-3 md:grid-cols-3">
            <SwitchRow label="Add to Online Booking" checked={Boolean(draft.addToOnlineBooking)} onChange={(addToOnlineBooking) => updateDraft({ addToOnlineBooking })} />
            <SwitchRow label="Taxable" checked={Boolean(draft.taxable)} onChange={(taxable) => updateDraft({ taxable })} />
            <SwitchRow label="Photos Required" checked={Boolean(draft.photoRequired)} onChange={(photoRequired) => updateDraft({ photoRequired })} />
          </div>
        </div>
        <DialogFooter className="mt-2 border-t border-border pt-5 sm:justify-between">
          <Button variant="outline" className="rounded-lg" onClick={() => onOpenChange(false)}>
            <XCircle className="size-4" />
            Cancel
          </Button>
          <Button onClick={() => onSave(draft)} className="rounded-lg bg-[#155e3f] text-white hover:bg-[#0c4a30]">
            {isEditing ? <Save className="size-4" /> : <Plus className="size-4" />}
            {isEditing ? "Save" : "Create Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoryDialog({
  open,
  category,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  category: Partial<PricebookCategory> | null;
  onOpenChange: (open: boolean) => void;
  onSave: (category: Partial<PricebookCategory>) => void;
}) {
  const [draft, setDraft] = useState<Partial<PricebookCategory>>({});

  useEffect(() => {
    if (category) setDraft(category);
  }, [category]);

  const updateDraft = (updates: Partial<PricebookCategory>) => setDraft((current) => ({ ...current, ...updates }));
  const isEditing = Boolean(draft.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl p-6 sm:max-w-[620px]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Plus className="size-5" />
            {isEditing ? "Update Category" : "Create Category"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <UploadRow onSelect={(imageName) => updateDraft({ imageName })} />
          <Field label="Category Name">
            <Input value={draft.name ?? ""} onChange={(event) => updateDraft({ name: event.target.value })} placeholder="Enter category name" className="h-12 rounded-lg" />
          </Field>
          <Field label="Description">
            <Textarea value={draft.description ?? ""} onChange={(event) => updateDraft({ description: event.target.value })} placeholder="Enter category description" className="min-h-24 resize-none rounded-lg p-6" />
          </Field>
        </div>
        <DialogFooter className="mt-2 border-t border-border pt-5 sm:justify-between">
          <Button variant="outline" className="rounded-lg" onClick={() => onOpenChange(false)}>
            <XCircle className="size-4" />
            Cancel
          </Button>
          <Button onClick={() => onSave(draft)} className="rounded-lg bg-[#155e3f] text-white hover:bg-[#0c4a30]">
            {isEditing ? <CheckCircle2 className="size-4" /> : <Plus className="size-4" />}
            {isEditing ? "Submit" : "Create Category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-3 block text-sm font-semibold text-foreground">{label}</label>
      {children}
    </div>
  );
}

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex h-12 items-center justify-between gap-3 bg-muted/20 px-3">
      <span className="font-medium">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function newItemDraft(categoryId?: string): Partial<PricebookItem> {
  return {
    name: "",
    modelNumber: "",
    price: 0,
    cost: 0,
    categoryId: categoryId ?? "",
    itemType: "Service",
    priceUnit: "flat",
    description: "",
    notes: "",
    addToOnlineBooking: false,
    taxable: false,
    photoRequired: false,
  };
}

function newCategoryDraft(): Partial<PricebookCategory> {
  return {
    name: "",
    description: "",
  };
}
