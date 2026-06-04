export type EmployeeType = "employee" | "subcontractor";

export type EmployeeRole = "Owner" | "Manager" | "Dispatcher" | "Technician" | "Driver" | "Helper";

export type EmployeeStatus = "active" | "inactive";

export type LocationTrackingSetting = "track" | "do_not_track";

export type ProfileColor =
  | "purple"
  | "red"
  | "brown"
  | "rose"
  | "orange"
  | "green"
  | "teal"
  | "navy"
  | "blue"
  | "magenta"
  | "black";

export interface EmployeeAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
}

export interface EmployeeRecord {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  type: EmployeeType;
  role: EmployeeRole;
  fieldTech: boolean;
  locationTracking: LocationTrackingSetting;
  status: EmployeeStatus;
  profileColor: ProfileColor;
  profilePictureName?: string;
  notes?: string;
  attachments: EmployeeAttachment[];
  createdAt: string;
  updatedAt: string;
}
