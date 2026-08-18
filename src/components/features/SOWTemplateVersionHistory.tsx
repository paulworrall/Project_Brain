"use client";

import { VersionHistory, type VersionHistoryItem } from "./VersionHistory";
import {
  uploadSOWTemplateVersionAction,
  revertSOWTemplateVersionAction,
} from "@/app/(dashboard)/sow-templates/actions";

/**
 * Thin Client Component wrapper around the shared VersionHistory — needed
 * because the SOW Templates library page is a Server Component, and a
 * plain closure like `(versionId) => action.bind(null, id, versionId)`
 * can't cross the Server->Client boundary as a prop (only actual Server
 * Actions, or a direct .bind() of one, can); building that closure here,
 * inside a Client Component, keeps it entirely client-side instead.
 */
export function SOWTemplateVersionHistory({
  sowTemplateId,
  title,
  versions,
  canManage,
  emptyMessage,
}: {
  sowTemplateId: string;
  title: string;
  versions: VersionHistoryItem[];
  canManage: boolean;
  emptyMessage?: string;
}) {
  return (
    <VersionHistory
      title={title}
      versions={versions}
      canManage={canManage}
      fileLabel="SOW Template file"
      emptyMessage={emptyMessage}
      onUpload={uploadSOWTemplateVersionAction.bind(null, sowTemplateId)}
      makeRevertAction={(versionId) =>
        revertSOWTemplateVersionAction.bind(null, sowTemplateId, versionId)
      }
    />
  );
}
