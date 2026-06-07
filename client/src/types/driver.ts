import type { Job, DriverJobStatus } from "@/types/jobs";

export type EmployeeAppRole = "admin" | "dispatcher" | "driver";

export type JobStopType = "pickup" | "delivery" | "service" | "disposal" | "material_pickup" | "other";
export type CustomerJobStopType = Exclude<JobStopType, "disposal">;
export type JobDisposalEventStatus = "planned" | "en_route" | "arrived" | "unloading" | "completed" | "rejected" | "canceled";
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
  | "assignment_changed"
  | "instruction_acknowledged"
  | "dispatch_resolution"
  | "customer_contact"
  | "driver_release";
export type JobPhotoType = "before" | "progress" | "after" | "damage" | "issue" | "receipt" | "equipment" | "other";
export type JobPhotoVisibility = "internal" | "customer_ready";
export type JobMessageRecipientScope = "dispatch" | "assigned_crew" | "all_job_participants";
export type JobIssueType =
  | "customer_not_home"
  | "access_problem"
  | "gate_locked"
  | "access_blocked"
  | "unable_to_locate"
  | "customer_not_ready"
  | "unsafe_to_service"
  | "scope_dispute"
  | "disposal_access_problem"
  | "other_service_blocker"
  | "additional_items"
  | "item_not_listed"
  | "heavy_item"
  | "oversized_item"
  | "unexpected_stairs_access"
  | "extra_stop_requested"
  | "different_service_requested"
  | "damage"
  | "vehicle_problem"
  | "running_late"
  | "disposal_problem"
  | "unsafe_condition"
  | "other";
export type JobIssueSeverity = "low" | "medium" | "high" | "urgent";
export type AddedScopeReviewStatus = "awaiting_review" | "approved_continue" | "declined" | "call_dispatch" | "awaiting_customer_approval" | "rescope_requote";
export type JobIssueStatus = "awaiting_dispatch" | "dispatch_reviewing" | "contacting_customer" | "waiting_on_customer" | "instructions_sent" | "resolved";
export type JobIssueResolutionType = "proceed" | "wait" | "return_later" | "reschedule" | "skip_stop" | "cancel_job" | "unable_to_service" | "other";

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

export interface JobDisposalEvent {
  id: string;
  jobId: string;
  facilityId?: string;
  facilityName?: string;
  facilityAddress?: string;
  materialType?: string;
  sequenceNumber: number;
  status: JobDisposalEventStatus;
  planned: boolean;
  arrivedAt?: string;
  unloadingStartedAt?: string;
  unloadingCompletedAt?: string;
  departedAt?: string;
  grossWeightLbs?: number;
  tareWeightLbs?: number;
  netWeightLbs?: number;
  netWeightTons?: number;
  disposalCost?: number;
  receiptNumber?: string;
  scaleTicketNumber?: string;
  receiptPhotoId?: string;
  notes?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
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
  issueStatus?: JobIssueStatus;
  dispatchResponse?: string;
  dispatchInstructions?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  customerContactAttemptedAt?: string;
  customerContactResult?: string;
  driverCalledDispatchAt?: string;
  driverReleasedAt?: string;
  driverReleasedBy?: string;
  resolutionType?: JobIssueResolutionType;
  createdAt: string;
  updatedAt: string;
}

export interface JobInstructionAcknowledgement {
  id: string;
  jobId: string;
  acknowledgedBy: string;
  acknowledgedAt: string;
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
  disposalEvents: JobDisposalEvent[];
  messages: JobMessage[];
  issues: JobIssue[];
  instructionAcknowledgements?: JobInstructionAcknowledgement[];
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
