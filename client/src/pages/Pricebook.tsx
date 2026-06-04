import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Edit3,
  FileImage,
  MoreHorizontal,
  Plus,
  Save,
  Search,
  Settings,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

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
import type { PricebookCategory, PricebookItem, PricebookItemType } from "@/types/pricebook";

type PricebookTab = "items" | "categories";

const itemTypes: PricebookItemType[] = ["Service", "Product", "Fee"];

function truncate(value: string, max = 34) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max).trim()}...` : value;
}

function priceText(value: number) {
  return value.toFixed(2);
}

function numeric(value: string | number | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
    <>
      <div className="border-b border-border bg-background px-4 py-5 md:px-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 text-base">
            <Settings className="size-5 text-[#7180a8]" />
            <Link href="/settings" className="text-[#7180a8] hover:text-[#3f3df1]">
              Settings
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="font-medium text-foreground">Pricebook</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-lg" onClick={() => setEditingCategory(newCategoryDraft())}>
              <Plus className="size-4" />
              Create Category
            </Button>
            <Button className="rounded-lg bg-[#3f3df1] text-white hover:bg-[#3330df]" onClick={() => setEditingItem(newItemDraft(pricebook.categories[0]?.id))}>
              <Plus className="size-4" />
              Create Item
            </Button>
          </div>
        </div>
      </div>

      <div className="px-4 py-8 md:px-8">
        <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-[400px]">
              <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search..." className="h-12 rounded-lg pl-10 pr-10" />
              {query && (
                <button type="button" onClick={() => setQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#7180a8]" aria-label="Clear pricebook search">
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
      </div>

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
    </>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-w-28 border-b-4 border-transparent px-4 py-4 text-left text-base font-medium transition-colors",
        active ? "border-[#3f3df1] text-[#3f3df1]" : "text-foreground hover:text-[#3f3df1]",
      )}
    >
      {children}
    </button>
  );
}

function ImagePlaceholder({ label }: { label: string }) {
  return (
    <div className="flex size-12 items-center justify-center rounded-lg bg-muted" aria-label={label}>
      <FileImage className="size-5 text-[#7180a8]" />
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
          <TableHead>Image</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Taxable</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item, index) => (
          <TableRow key={item.id} className={index % 2 === 1 ? "bg-muted/20" : undefined}>
            <TableCell className="px-5 font-medium">{item.name}</TableCell>
            <TableCell>
              <ImagePlaceholder label={`${item.name} image`} />
            </TableCell>
            <TableCell className="max-w-[320px]">{truncate(item.description)}</TableCell>
            <TableCell>{priceText(item.price)}</TableCell>
            <TableCell>{categories[item.categoryId] ?? ""}</TableCell>
            <TableCell>{item.taxable ? "Yes" : "No"}</TableCell>
            <TableCell className="text-right">
              <Button variant="ghost" size="icon" onClick={() => onDelete(item.id)} aria-label={`Delete ${item.name}`}>
                <Trash2 className="size-4 text-red-500" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onEdit(item)} aria-label={`Edit ${item.name}`}>
                <Edit3 className="size-4 text-[#7180a8]" />
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
                <Edit3 className="size-4 text-[#7180a8]" />
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
          <div className="mt-1 text-xs text-[#7180a8]">JPG or PNG, file size no more than 5MB</div>
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
      <Button type="button" onClick={() => inputRef.current?.click()} className="rounded-lg bg-[#3f3df1] text-white hover:bg-[#3330df]">
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
          <Field label="Item Description">
            <Textarea value={draft.description ?? ""} onChange={(event) => updateDraft({ description: event.target.value })} placeholder="Enter item description (optional)" className="min-h-24 resize-none rounded-lg p-6" />
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <SwitchRow label="Add to Online Booking" checked={Boolean(draft.addToOnlineBooking)} onChange={(addToOnlineBooking) => updateDraft({ addToOnlineBooking })} />
            <SwitchRow label="Taxable" checked={Boolean(draft.taxable)} onChange={(taxable) => updateDraft({ taxable })} />
          </div>
        </div>
        <DialogFooter className="mt-2 border-t border-border pt-5 sm:justify-between">
          <Button variant="outline" className="rounded-lg" onClick={() => onOpenChange(false)}>
            <XCircle className="size-4" />
            Cancel
          </Button>
          <Button onClick={() => onSave(draft)} className="rounded-lg bg-[#3f3df1] text-white hover:bg-[#3330df]">
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
          <Button onClick={() => onSave(draft)} className="rounded-lg bg-[#3f3df1] text-white hover:bg-[#3330df]">
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
    description: "",
    addToOnlineBooking: false,
    taxable: false,
  };
}

function newCategoryDraft(): Partial<PricebookCategory> {
  return {
    name: "",
    description: "",
  };
}
