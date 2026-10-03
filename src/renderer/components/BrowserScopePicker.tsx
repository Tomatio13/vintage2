import { Folder, Globe2 } from "lucide-react";
import { PanePicker } from "./PanePicker.js";

export function BrowserScopePicker({
  title,
  subtitle,
  value,
  workspaceId,
  workspaceName,
  active,
  onChange,
}: {
  title: string;
  subtitle: string;
  value: string | null;
  workspaceId: string | null;
  workspaceName?: string | null | undefined;
  active: boolean;
  onChange(value: string | null): void;
}) {
  return (
    <PanePicker
      title={title}
      subtitle={subtitle}
      eyebrow="BROWSER"
      value={value ?? ""}
      active={active}
      triggerClassName="w-full"
      options={[
        { value: "", label: "Common", description: "Available in every project", Icon: Globe2 },
        ...(workspaceId
          ? [
              {
                value: workspaceId,
                label: workspaceName ?? "This project",
                description: "Available in this project",
                Icon: Folder,
              },
            ]
          : []),
      ]}
      onChange={(value) => onChange(value || null)}
    />
  );
}
