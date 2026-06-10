import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useRoute } from "wouter";
import type { LucideIcon } from "lucide-react";
import {
  BriefcaseBusiness,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  Image as ImageIcon,
  Info,
  Mail,
  MoreHorizontal,
  Paperclip,
  Phone,
  Plus,
  Save,
  Search,
  Smartphone,
  Trash2,
  Upload,
  User,
  UsersRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  activateDriver,
  fetchDriverAppStatuses,
  isActivationExpired,
  isSessionLive,
  revokeDriverAccess,
  type ActivateDriverResult,
} from "@/lib/driverActivation";
import { deleteEmployee, employeeName, getEmployee, getEmployees, saveEmployee } from "@/lib/employeeStorage";
import { colorFor, profileColors } from "@/lib/profileColors";
import { cn } from "@/lib/utils";
import type { DriverAppStatus } from "@/types/driver";
import type {
  EmployeeAttachment,
  EmployeeRecord,
  EmployeeRole,
  EmployeeType,
  LocationTrackingSetting,
  ProfileColor,
} from "@/types/employees";

const roles: EmployeeRole[] = ["Owner", "Manager", "Dispatcher", "Technician", "Driver", "Helper"];

const emptyEmployee: Partial<EmployeeRecord> = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  type: "employee",
  role: "Technician",
  fieldTech: true,
  locationTracking: "track",
  status: "active",
  profileColor: "purple",
  notes: "",
  attachments: [],
};

function titleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Mobile App activation (driver app access)
// ---------------------------------------------------------------------------

function useDriverAppStatuses() {
  const [statuses, setStatuses] = useState<Record<string, DriverAppStatus>>({});

  useEffect(() => {
    const load = () => void fetchDriverAppStatuses().then(setStatuses);
    load();
    window.addEventListener("driver-activations-updated", load);
    // Keeps Online / "Last seen" fresh without a manual refresh.
    const timer = window.setInterval(load, 60_000);
    return () => {
      window.removeEventListener("driver-activations-updated", load);
      window.clearInterval(timer);
    };
  }, []);

  return statuses;
}

function agoLabel(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
}

function expiryCountdown(expiresAt: string) {
  const hoursLeft = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 3600000));
  return hoursLeft >= 1 ? `${hoursLeft}h left` : "expiring";
}

type ActivationRequest = { employee: EmployeeRecord; hasActiveSession: boolean };

function MobileAppCell({
  employee,
  status,
  onActivate,
}: {
  employee: EmployeeRecord;
  status?: DriverAppStatus;
  onActivate: (request: ActivationRequest) => void;
}) {
  if (employee.type === "subcontractor") {
    return <span className="text-xs text-muted-foreground">SMS only</span>;
  }
  if (!employee.email) {
    return <span className="text-xs text-muted-foreground">No email</span>;
  }

  const activation = status?.activation ?? null;
  const session = status?.session ?? null;
  const request = { employee, hasActiveSession: Boolean(session && activation?.status === "activated") };

  if (activation?.status === "activated") {
    if (isSessionLive(session)) {
      return <Badge className="rounded-full bg-green-100 px-3 font-normal text-green-700">Online</Badge>;
    }
    if (session?.lastSeenAt) {
      return <span className="text-xs text-muted-foreground">Last seen {agoLabel(session.lastSeenAt)}</span>;
    }
    return (
      <Badge variant="secondary" className="rounded-full bg-muted px-3 font-normal text-muted-foreground">
        Offline
      </Badge>
    );
  }
  if (activation?.status === "pending" && !isActivationExpired(activation)) {
    return (
      <Badge className="rounded-full bg-amber-100 px-3 font-normal text-amber-800">
        Pending · {expiryCountdown(activation.expiresAt)}
      </Badge>
    );
  }
  if (activation && (activation.status === "expired" || isActivationExpired(activation))) {
    return (
      <Button size="sm" variant="outline" onClick={() => onActivate(request)}>
        Resend
      </Button>
    );
  }
  return (
    <Button size="sm" variant="outline" className="border-[#155e3f] text-[#155e3f] hover:text-[#155e3f]" onClick={() => onActivate(request)}>
      Activate
    </Button>
  );
}

/**
 * Confirm dialog -> create activation + send email -> success toast, or a
 * follow-up dialog with the key + link to copy when the email couldn't go out.
 */
function ActivateDriverFlow({ request, onClose }: { request: ActivationRequest | null; onClose: () => void }) {
  const [sending, setSending] = useState(false);
  const [emailFallback, setEmailFallback] = useState<(ActivateDriverResult & { email: string }) | null>(null);

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Couldn't copy. Select and copy it manually.");
    }
  };

  const confirmActivation = async () => {
    if (!request) return;
    setSending(true);
    try {
      const result = await activateDriver(request.employee);
      if (result.emailSent) {
        toast.success(`Activation email sent to ${request.employee.email}`);
      } else {
        setEmailFallback({ ...result, email: request.employee.email ?? "" });
        toast.warning("The activation was created, but the email couldn't be sent.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't create the activation.");
    } finally {
      setSending(false);
      onClose();
    }
  };

  return (
    <>
      <AlertDialog open={Boolean(request)} onOpenChange={(open) => !open && !sending && onClose()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {request?.hasActiveSession ? "Resend activation?" : "Send activation email?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {request?.hasActiveSession
                ? `This driver already has an active session. Resending will sign them out everywhere and email a new key to ${request?.employee.email}.`
                : `Send activation email to ${request ? employeeName(request.employee) : ""} at ${request?.employee.email}? The activation key expires in 72 hours.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={sending}
              className="bg-[#155e3f] text-white hover:bg-[#0c4a30]"
              onClick={(event) => {
                event.preventDefault();
                void confirmActivation();
              }}
            >
              {sending ? "Sending..." : request?.hasActiveSession ? "Resend" : "Send email"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={Boolean(emailFallback)} onOpenChange={(open) => !open && setEmailFallback(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email didn't go out</DialogTitle>
            <DialogDescription>
              {emailFallback?.emailError ?? "The email service couldn't be reached."} The activation still works — copy the key or
              link below and text it to {emailFallback?.email || "the driver"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 p-3">
              <span className="font-mono text-lg font-bold tracking-wider">{emailFallback?.activation.activationKey}</span>
              <Button size="sm" variant="outline" onClick={() => void copyText(emailFallback?.activation.activationKey ?? "", "Key")}>
                <Copy className="size-4" />
                Copy
              </Button>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 p-3">
              <span className="truncate text-xs text-muted-foreground">{emailFallback?.activationLink}</span>
              <Button size="sm" variant="outline" onClick={() => void copyText(emailFallback?.activationLink ?? "", "Link")}>
                <Copy className="size-4" />
                Copy
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** "App Access" card on the employee detail page. */
function AppAccessPanel({ employee }: { employee: EmployeeRecord }) {
  const statuses = useDriverAppStatuses();
  const status = statuses[employee.id];
  const [activationRequest, setActivationRequest] = useState<ActivationRequest | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const activation = status?.activation ?? null;
  const session = status?.session ?? null;
  const hasAccess = activation?.status === "activated" || (activation?.status === "pending" && !isActivationExpired(activation));

  const statusLine = (() => {
    if (employee.type === "subcontractor") return "Subcontractors don't get app access — they get SMS notifications only.";
    if (!employee.email) return "No email on file. Add one above to activate the driver app.";
    if (!activation) return "Not activated yet.";
    if (activation.status === "revoked") return "Access revoked.";
    if (activation.status === "activated") return isSessionLive(session) ? "Activated · online now" : "Activated · offline";
    if (isActivationExpired(activation)) return "Activation expired before it was used.";
    return `Activation pending · ${expiryCountdown(activation.expiresAt)} (sent to ${activation.emailSentTo}).`;
  })();

  // City-level only on purpose: round to ~1 decimal (~7 miles) so the detail
  // page doesn't read like a surveillance log.
  const roughLocation =
    session?.lastLat != null && session?.lastLng != null ? `Near ${session.lastLat.toFixed(1)}, ${session.lastLng.toFixed(1)}` : null;

  const revoke = async () => {
    setConfirmRevoke(false);
    try {
      await revokeDriverAccess(employee.id);
      toast.success("App access revoked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't revoke access.");
    }
  };

  return (
    <Panel>
      <SectionTitle icon={Smartphone}>App Access</SectionTitle>
      <div className="space-y-4 text-sm">
        <p>{statusLine}</p>
        {session?.lastSeenAt && (
          <p className="text-muted-foreground">
            Last seen {agoLabel(session.lastSeenAt)}
            {roughLocation ? ` · ${roughLocation}` : ""}
          </p>
        )}
        {employee.type === "employee" && employee.email && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="rounded-lg border-[#155e3f] text-[#155e3f] hover:text-[#155e3f]"
              onClick={() =>
                setActivationRequest({ employee, hasActiveSession: Boolean(session && activation?.status === "activated") })
              }
            >
              <Mail className="size-4" />
              {activation ? "Resend Activation" : "Send Activation"}
            </Button>
            {hasAccess && (
              <Button variant="outline" className="rounded-lg text-destructive hover:text-destructive" onClick={() => setConfirmRevoke(true)}>
                <Trash2 className="size-4" />
                Revoke Access
              </Button>
            )}
          </div>
        )}
      </div>

      <ActivateDriverFlow request={activationRequest} onClose={() => setActivationRequest(null)} />
      <AlertDialog open={confirmRevoke} onOpenChange={setConfirmRevoke}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke app access?</AlertDialogTitle>
            <AlertDialogDescription>
              {employeeName(employee)} will be signed out of the driver app immediately and will need a new activation email to get
              back in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void revoke();
              }}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}

export default function Employees() {
  const [, params] = useRoute("/employees/:employeeId");
  const [isNewRoute] = useRoute("/employees/new");

  if (isNewRoute) return <EmployeeEditor mode="new" />;
  if (params?.employeeId) return <EmployeeEditor employeeId={params.employeeId} />;
  return <EmployeeList />;
}

function EmployeesHeader({ crumb, actions }: { crumb?: string; actions?: ReactNode }) {
  return (
    <div className="border-b border-border bg-background px-4 py-5 md:px-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 text-base">
          <UsersRound className="size-5 text-foreground" />
          <Link href="/employees" className="text-foreground hover:text-[#155e3f]">
            Employees
          </Link>
          {crumb && (
            <>
              <span className="text-muted-foreground">/</span>
              <span className="font-medium text-foreground">{crumb}</span>
            </>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

function EmployeeList() {
  const [employees, setEmployees] = useState<EmployeeRecord[]>(() => getEmployees());
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState("10");
  const [, navigate] = useLocation();
  const appStatuses = useDriverAppStatuses();
  const [activationRequest, setActivationRequest] = useState<ActivationRequest | null>(null);

  useEffect(() => {
    const refresh = () => setEmployees(getEmployees());
    window.addEventListener("employees-updated", refresh);
    return () => window.removeEventListener("employees-updated", refresh);
  }, []);

  const filteredEmployees = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return employees.filter((employee) => {
      const searchable = [
        employeeName(employee),
        employee.email,
        employee.phone,
        employee.type,
        employee.role,
        employee.fieldTech ? "field tech yes" : "field tech no",
        employee.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return !normalizedQuery || searchable.includes(normalizedQuery);
    });
  }, [employees, query]);

  const removeEmployee = (event: React.MouseEvent, employeeId: string) => {
    event.stopPropagation();
    setEmployees(deleteEmployee(employeeId));
    toast.success("Employee deleted");
  };

  return (
    <>
      <EmployeesHeader
        actions={
          <>
            <Button asChild variant="outline" className="rounded-lg">
              <Link href="/employees/new?type=subcontractor">
                <Plus className="size-4" />
                Create Subcontractor
              </Link>
            </Button>
            <Button asChild className="rounded-lg bg-[#155e3f] text-white hover:bg-[#0c4a30]">
              <Link href="/employees/new">
                <Plus className="size-4" />
                Create Employee
              </Link>
            </Button>
          </>
        }
      />
      <div className="px-4 py-8 md:px-8">
        <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-[400px]">
              <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search..." className="h-12 rounded-lg pl-10 pr-10" />
              {query && (
                <button type="button" onClick={() => setQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8a9180]" aria-label="Clear employee search">
                  <X className="size-4" />
                </button>
              )}
            </div>
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
          </div>

          <div className="mt-6">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="h-14 px-5">Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Field Tech</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Mobile App</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmployees.map((employee) => (
                  <TableRow key={employee.id} className="cursor-pointer" onClick={() => navigate(`/employees/${employee.id}`)}>
                    <TableCell className="px-5 font-medium">
                      <span className="inline-flex items-center gap-3">
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: colorFor(employee.profileColor).hex }} />
                        {employeeName(employee)}
                      </span>
                    </TableCell>
                    <TableCell>{employee.email || ""}</TableCell>
                    <TableCell>{employee.phone || ""}</TableCell>
                    <TableCell>{employee.type === "employee" ? "Employee" : "Subcontractor"}</TableCell>
                    <TableCell>{employee.role}</TableCell>
                    <TableCell>{employee.fieldTech ? "Yes" : "No"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={cn("rounded-full px-3 font-normal", employee.status === "active" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground")}>
                        {titleCase(employee.status)}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <MobileAppCell employee={employee} status={appStatuses[employee.id]} onActivate={setActivationRequest} />
                    </TableCell>
                    <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                      <Button variant="ghost" size="icon" asChild aria-label={`Open ${employeeName(employee)}`}>
                        <Link href={`/employees/${employee.id}`}>
                          <MoreHorizontal className="size-4 text-[#8a9180]" />
                        </Link>
                      </Button>
                      <Button variant="ghost" size="icon" onClick={(event) => removeEmployee(event, employee.id)} aria-label={`Delete ${employeeName(employee)}`}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredEmployees.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="h-72 text-center">
                      <div className="flex flex-col items-center justify-center gap-4">
                        <BriefcaseBusiness className="size-8 text-[#155e3f]" />
                        <span className="text-sm text-muted-foreground">No employees match that search.</span>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="mt-5 flex flex-col gap-3 rounded-lg border border-border bg-card p-5 text-sm md:flex-row md:items-center md:justify-between">
          <span>{filteredEmployees.length ? `Showing 1-${filteredEmployees.length} of ${filteredEmployees.length} results` : "No results."}</span>
          <div className="flex items-center justify-center gap-4">
            <Button variant="outline" size="icon" className="size-10 rounded-lg">
              <ChevronLeft className="size-4" />
            </Button>
            <span>Page 1 of 1</span>
            <Button variant="outline" size="icon" className="size-10 rounded-lg">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </section>
      </div>

      <ActivateDriverFlow request={activationRequest} onClose={() => setActivationRequest(null)} />
    </>
  );
}

function EmployeeEditor({ mode, employeeId }: { mode?: "new"; employeeId?: string }) {
  const [, navigate] = useLocation();
  const initialType = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("type") === "subcontractor" ? "subcontractor" : "employee";
  const [employee, setEmployee] = useState<Partial<EmployeeRecord>>(() => (mode === "new" ? { ...emptyEmployee, type: initialType } : getEmployee(employeeId ?? "") ?? {}));

  const isNew = mode === "new";
  const isMissing = !isNew && !employee.id;
  const updateEmployee = (updates: Partial<EmployeeRecord>) => setEmployee((current) => ({ ...current, ...updates }));

  if (isMissing) {
    return (
      <>
        <EmployeesHeader crumb="Details" />
        <div className="px-4 py-8 md:px-8">Employee not found.</div>
      </>
    );
  }

  const persistEmployee = () => {
    const saved = saveEmployee({
      ...employee,
      firstName: employee.firstName?.trim() || "New",
      lastName: employee.lastName?.trim() || (employee.type === "subcontractor" ? "Subcontractor" : "Employee"),
      type: employee.type ?? "employee",
    });
    setEmployee(saved);
    toast.success(isNew ? `${saved.type === "subcontractor" ? "Subcontractor" : "Employee"} created` : "Employee saved");
    navigate(`/employees/${saved.id}`);
  };

  const removeEmployee = () => {
    if (!employee.id) return;
    deleteEmployee(employee.id);
    toast.success("Employee deleted");
    navigate("/employees");
  };

  return (
    <>
      <EmployeesHeader
        crumb={isNew ? (employee.type === "subcontractor" ? "New Subcontractor" : "New Employee") : employeeName(employee as EmployeeRecord)}
        actions={
          <>
            <Button onClick={persistEmployee} className="rounded-lg bg-[#155e3f] text-white hover:bg-[#0c4a30]">
              {isNew ? <Plus className="size-4" /> : <Save className="size-4" />}
              {isNew ? `Create ${employee.type === "subcontractor" ? "Subcontractor" : "Employee"}` : "Save"}
            </Button>
            {!isNew && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="size-10 rounded-lg">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem variant="destructive" onClick={removeEmployee}>
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />
      <div className="grid gap-5 px-4 py-8 xl:grid-cols-[1fr_1fr] md:px-8">
        <div className="space-y-5">
          <EmployeeDetailsPanel employee={employee} updateEmployee={updateEmployee} />
          {!isNew && <EmployeeAttachments employee={employee as EmployeeRecord} updateEmployee={updateEmployee} />}
        </div>
        <div className="space-y-5">
          <EmployeeTypePanel employee={employee} updateEmployee={updateEmployee} />
          {!isNew && (
            <Panel>
              <SectionTitle icon={FileText}>Private Notes</SectionTitle>
              <Textarea value={employee.notes ?? ""} onChange={(event) => updateEmployee({ notes: event.target.value })} placeholder="Enter notes (optional)" className="min-h-[180px] resize-none rounded-lg p-5" />
            </Panel>
          )}
          {!isNew && employee.id && <AppAccessPanel employee={employee as EmployeeRecord} />}
        </div>
      </div>
    </>
  );
}

function EmployeeDetailsPanel({
  employee,
  updateEmployee,
}: {
  employee: Partial<EmployeeRecord>;
  updateEmployee: (updates: Partial<EmployeeRecord>) => void;
}) {
  return (
    <Panel>
      <SectionTitle icon={Info}>Employee Details</SectionTitle>
      <div className="space-y-5">
        <TextField label="First Name" value={employee.firstName ?? ""} placeholder="Enter first name" icon={User} onChange={(firstName) => updateEmployee({ firstName })} />
        <TextField label="Last Name" value={employee.lastName ?? ""} placeholder="Enter last name" icon={User} onChange={(lastName) => updateEmployee({ lastName })} />
        <div className="grid gap-5 md:grid-cols-2">
          <TextField label="Email" value={employee.email ?? ""} placeholder="Enter email address" icon={Mail} onChange={(email) => updateEmployee({ email })} />
          <TextField label="Phone Number" value={employee.phone ?? ""} placeholder="Enter phone number" icon={Phone} onChange={(phone) => updateEmployee({ phone })} />
        </div>
        <div>
          <FieldLabel>Pick a Color Tag</FieldLabel>
          <ProfileColorPicker value={employee.profileColor ?? "purple"} onChange={(profileColor) => updateEmployee({ profileColor })} compact />
        </div>
      </div>
    </Panel>
  );
}

/**
 * Reads an image file into a downscaled (max 256px) JPEG data URL so the
 * picture survives reloads in localStorage. Blob URLs are session-scoped and
 * full-size base64 would blow the storage quota — this avoids both.
 */
function fileToAvatarDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const max = 256;
        const scale = Math.min(1, max / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(reader.result as string);
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      image.onerror = () => reject(new Error("Could not decode the image"));
      image.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function EmployeeTypePanel({
  employee,
  updateEmployee,
}: {
  employee: Partial<EmployeeRecord>;
  updateEmployee: (updates: Partial<EmployeeRecord>) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <Panel>
      <SectionTitle icon={Info}>Employee Type</SectionTitle>
      <div className="mb-6 flex flex-col gap-4 rounded-lg bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
            {employee.profilePictureDataUrl ? (
              <img src={employee.profilePictureDataUrl} alt="Profile" className="size-full object-cover" />
            ) : (
              <ImageIcon className="size-6 text-[#8a9180]" />
            )}
          </div>
          <div className="min-w-0">
            <div className="font-semibold">Profile Picture</div>
            <div className="mt-1 truncate text-xs text-[#8a9180]">{employee.profilePictureName || "JPG or PNG, file size no more than 10MB"}</div>
          </div>
        </div>
        <Input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(event) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            if (!file) return;
            if (file.size > 10 * 1024 * 1024) {
              toast.error("Image must be 10MB or smaller");
              input.value = "";
              return;
            }
            void fileToAvatarDataUrl(file)
              .then((profilePictureDataUrl) => {
                updateEmployee({ profilePictureName: file.name, profilePictureDataUrl });
                toast.success("Profile picture saved");
              })
              .catch(() => toast.error("Could not read that image — try a different file"));
            input.value = "";
          }}
        />
        <Button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-lg bg-[#155e3f] text-white hover:bg-[#0c4a30]">
          <Upload className="size-4" />
          Upload
        </Button>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <SelectField label="Type" value={employee.type ?? "employee"} onValueChange={(type) => updateEmployee({ type: type as EmployeeType })} options={[["employee", "Employee"], ["subcontractor", "Subcontractor"]]} />
        <SelectField label="Role" value={employee.role ?? "Technician"} onValueChange={(role) => updateEmployee({ role: role as EmployeeRole })} options={roles.map((role) => [role, role])} />
        <SelectField label="Field Tech (Assignable to Jobs)" value={employee.fieldTech ? "yes" : "no"} onValueChange={(fieldTech) => updateEmployee({ fieldTech: fieldTech === "yes" })} options={[["yes", "Yes"], ["no", "No"]]} />
        <SelectField
          label="Location Tracking"
          value={employee.locationTracking ?? "track"}
          onValueChange={(locationTracking) => updateEmployee({ locationTracking: locationTracking as LocationTrackingSetting })}
          options={[["track", "Track User Location"], ["do_not_track", "Do Not Track"]]}
        />
      </div>

      <div className="mt-6 rounded-lg border border-[#155e3f] bg-[#155e3f]/5 p-5 text-sm leading-6">
        <div className="flex gap-3">
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#155e3f] text-white">
            <Info className="size-3" />
          </span>
          <div>
            <p>
              <strong>Employee:</strong> Gets their own login to the system.
            </p>
            <p>
              <strong>Subcontractor:</strong> Does not get access to the app/website, just gets SMS notifications.
            </p>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function EmployeeAttachments({
  employee,
  updateEmployee,
}: {
  employee: EmployeeRecord;
  updateEmployee: (updates: Partial<EmployeeRecord>) => void;
}) {
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  const addAttachments = (files: FileList | null) => {
    if (!files?.length) return;
    const uploadedAt = new Date().toISOString();
    const nextAttachments: EmployeeAttachment[] = Array.from(files).map((file) => ({
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `attachment-${Date.now()}-${file.name}`,
      name: file.name,
      size: file.size,
      type: file.type || "Unknown",
      uploadedAt,
    }));
    updateEmployee({ attachments: [...(employee.attachments ?? []), ...nextAttachments] });
    toast.success(`${nextAttachments.length} file${nextAttachments.length > 1 ? "s" : ""} added`);
  };

  const removeAttachment = (attachmentId: string) => {
    updateEmployee({ attachments: employee.attachments.filter((attachment) => attachment.id !== attachmentId) });
  };

  return (
    <Panel>
      <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
        <SectionTitle icon={Paperclip} noBorder>
          Files
        </SectionTitle>
        <Input
          ref={attachmentInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            addAttachments(event.target.files);
            event.currentTarget.value = "";
          }}
        />
        <Button type="button" variant="outline" onClick={() => attachmentInputRef.current?.click()} className="rounded-lg border-[#155e3f] text-[#155e3f] hover:text-[#155e3f]">
          <Upload className="size-4" />
          Upload Files
        </Button>
      </div>
      <div className="mt-5 space-y-3">
        {employee.attachments.length > 0 ? (
          employee.attachments.map((attachment) => (
            <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-4">
              <div className="flex min-w-0 items-center gap-3">
                <FileText className="size-5 shrink-0 text-[#8a9180]" />
                <div className="min-w-0">
                  <div className="truncate font-medium">{attachment.name}</div>
                  <div className="text-xs text-[#8a9180]">{formatFileSize(attachment.size)}</div>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeAttachment(attachment.id)} aria-label={`Remove ${attachment.name}`}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          ))
        ) : (
          <p className="text-sm text-[#8a9180]">No files uploaded.</p>
        )}
      </div>
    </Panel>
  );
}

function ProfileColorPicker({ value, onChange, compact = false }: { value: ProfileColor; onChange: (value: ProfileColor) => void; compact?: boolean }) {
  const selected = colorFor(value);
  return (
    <div className="space-y-4">
      {!compact && (
        <div className="flex flex-wrap gap-4">
          {profileColors.map((color) => (
            <button
              key={color.value}
              type="button"
              onClick={() => onChange(color.value)}
              className={cn("flex size-8 items-center justify-center rounded-md ring-offset-2 transition", color.className, value === color.value && "ring-2 ring-[#155e3f]")}
              aria-label={`Use ${color.label} profile color`}
            >
              {value === color.value && <Check className="size-4 text-white" />}
            </button>
          ))}
        </div>
      )}
      <Select value={value} onValueChange={(profileColor) => onChange(profileColor as ProfileColor)}>
        <SelectTrigger className="h-12 rounded-lg bg-card">
          <span className="flex items-center gap-3">
            <span className={cn("size-4 rounded-full", selected.className)} />
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent>
          {profileColors.map((color) => (
            <SelectItem key={color.value} value={color.value}>
              {color.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SelectField({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-12 w-full rounded-lg bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([optionValue, label]) => (
            <SelectItem key={optionValue} value={optionValue}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function TextField({
  label,
  value,
  placeholder,
  icon: Icon,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  icon: LucideIcon;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-12 rounded-lg pr-11" />
        <Icon className="absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[#8a9180]" />
      </div>
    </div>
  );
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-lg border border-border bg-card p-6 shadow-sm", className)}>{children}</section>;
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-3 block text-sm font-semibold text-foreground">{children}</label>;
}

function SectionTitle({ icon: Icon, children, noBorder = false }: { icon: LucideIcon; children: ReactNode; noBorder?: boolean }) {
  return (
    <div className={cn("mb-5 flex items-center gap-2 text-2xl font-bold", !noBorder && "border-b border-border pb-4")}>
      <Icon className="size-5" />
      <h2 className="text-2xl font-bold">{children}</h2>
    </div>
  );
}
