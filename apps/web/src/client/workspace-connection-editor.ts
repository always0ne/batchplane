import type { ComponentType } from "react";

export type WorkspaceConnectionEditorProps = {
  checking: boolean;
  onCheckConnection: () => Promise<void>;
  onConnectionChanged: () => void;
};

export type WorkspaceConnectionEditor =
  ComponentType<WorkspaceConnectionEditorProps>;
