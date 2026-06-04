export interface EventRecord {
  id: string;
  title: string;
  notes?: string;
  private: boolean;
  startDate: string;
  startTime: string;
  endTime: string;
  streetAddress?: string;
  unit?: string;
  city?: string;
  state?: string;
  zip?: string;
  createdAt: string;
  updatedAt: string;
}
