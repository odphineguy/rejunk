/**
 * Driver <-> dispatch messaging (dispatch_threads / dispatch_thread_participants /
 * dispatch_messages tables). Replaces the old customer-SMS ConversationRecord model.
 *
 * Three thread types scope who sees what:
 * - "job"       — tied to one job; assigned crew + dispatch.
 * - "direct"    — 1:1 between dispatch and one driver.
 * - "broadcast" — dispatch -> all active field techs.
 */

export type DispatchThreadType = "job" | "direct" | "broadcast";

export interface DispatchThreadParticipant {
  id: string;
  threadId: string;
  employeeId: string;
  joinedAt: string;
  /** Null/undefined means the participant has never opened the thread. */
  lastReadAt?: string;
}

export interface DispatchMessage {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  body: string;
  /** Optional context, e.g. { jobId, issueId }. */
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface DispatchThread {
  id: string;
  threadType: DispatchThreadType;
  /** Only set for job threads. */
  jobId?: string;
  /** Job number + customer for job threads, driver name for direct, subject for broadcast. */
  title: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  participants: DispatchThreadParticipant[];
  /** Hydrated from the message cache for list previews. */
  lastMessage?: DispatchMessage;
  /** Computed for the identity that requested the thread list. */
  unreadCount: number;
}

export interface CreateThreadInput {
  threadType: DispatchThreadType;
  jobId?: string;
  title: string;
  createdBy?: string;
  participantIds: string[];
}
