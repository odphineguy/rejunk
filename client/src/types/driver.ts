import type { Job, DriverJobStatus } from "@/types/jobs";

export type EmployeeAppRole = "admin" | "dispatcher" | "driver";

export type JobStopType = "pickup" | "delivery" | "service" | "disposal" | "material_pickup" | "other";
export type JobStopStatus = "pending" | "en_route" | "arrived" | "in_progress" | "completed" | "skipped";
export type JobItemStatus = "pending" | "loaded" | "delivered" | "completed" | "missing" | "damaged" | "skipped";
export type JobActivityEventType =
  | "status_change"
  | "stop_completed"
  | "item_updated"
  | "photo_uploaded"
  | "message"
  | "issue_reported"
  | "scope_change"
  | "assignment_changed";
export type JobPhotoType = "before" | "progress" | "after" | "damage" | "issue" | "receipt" | "equipment" | "other";
export type JobPhotoVisibility = "internal" | "customer_ready";
export type JobMessageRecipientScope = "dispatch" | "assigned_crew" | "all_job_participants";
export type JobIssueType =
  | "customer_not_home"
  | "access_problem"
  | "additional_items"
  | "item_not_listed"
  | "heavy_item"
  | "oversized_item"
  | "damage"
  | "vehicle_problem"
  | "running_late"
  | "disposal_problem"
  | "unsafe_condition"
  | "other";
export type JobIssueSeverity = "low" | "medium" | "high" | "urgent";
export type AddedScopeReviewStatus = "awaiting_review" | "approved_continue" | "declined" | "call_dispatch";

export interface DriverProfile {
  id: string;
  authUserId?: string;
  employeeId?: string;
  displayName: string;
  email?: string;
  phone?: string;
  role: EmployeeAppRole;
  status: "active" | "inactive";
}

export interface JobAssignmentRecord {
  id: string;
  jobId: string;
  employeeId: string;
  role: "driver" | "helper" | "crew_lead";
  assignedBy?: string;
  createdAt: string;
}

export interface JobStop {
  id: string;
  jobId: string;
  stopOrder: number;
  stopType: JobStopType;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  latitude?: number;
  longitude?: number;
  contactName?: string;
  contactPhone?: string;
  arrivalWindowStart?: string;
  arrivalWindowEnd?: string;
  instructions?: string;
  status: JobStopStatus;
  arrivedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobItem {
  id: string;
  jobId: string;
  stopId?: string;
  name: string;
  quantity: number;
  category?: string;
  estimatedWeightLbs?: number;
  oversized: boolean;
  fragile: boolean;
  heavy: boolean;
  disassemblyRequired: boolean;
  reassemblyRequired: boolean;
  destinationStopId?: string;
  instructions?: string;
  status: JobItemStatus;
  createdAt: string;
  updatedAt: string;
}

export interface JobActivity {
  id: string;
  jobId: string;
  userId?: string;
  eventType: JobActivityEventType;
  previousStatus?: DriverJobStatus | null;
  newStatus?: DriverJobStatus | null;
  message?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface JobPhoto {
  id: string;
  jobId: string;
  stopId?: string;
  uploadedBy?: string;
  storagePath: string;
  publicUrl?: string;
  photoType: JobPhotoType;
  visibility: JobPhotoVisibility;
  caption?: string;
  createdAt: string;
}

export interface JobMessage {
  id: string;
  jobId: string;
  senderId?: string;
  recipientScope: JobMessageRecipientScope;
  message: string;
  attachmentUrl?: string;
  createdAt: string;
  readAt?: string;
}

export interface JobIssue {
  id: string;
  jobId: string;
  stopId?: string;
  reportedBy?: string;
  issueType: JobIssueType;
  description: string;
  severity: JobIssueSeverity;
  requiresDispatchResponse: boolean;
  addedScopeStatus?: AddedScopeReviewStatus;
  createdAt: string;
  updatedAt: string;
}

export type DriverJob = Pick<
  Job,
  | "id"
  | "jobNumber"
  | "customerName"
  | "jobLabel"
  | "phone"
  | "address"
  | "city"
  | "state"
  | "zip"
  | "scheduledStart"
  | "scheduledEnd"
  | "status"
  | "vehicleId"
  | "vehicleName"
  | "assignment"
  | "notes"
  | "internalNotes"
  | "materialName"
  | "materialType"
  | "updatedAt"
> & {
  serviceType?: string;
  stops: JobStop[];
  items: JobItem[];
  activity: JobActivity[];
  photos: JobPhoto[];
  messages: JobMessage[];
  issues: JobIssue[];
  assignedCrew: DriverProfile[];
  instructionsChanged?: boolean;
};

export interface DriverTodayData {
  driver: DriverProfile | null;
  activeJob: DriverJob | null;
  upcomingJobs: DriverJob[];
  completedJobs: DriverJob[];
  lastSyncedAt?: string;
  fromCache: boolean;
}
