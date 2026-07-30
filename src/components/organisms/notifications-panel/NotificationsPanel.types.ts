import type {
  NotificationHookItem,
} from "@/hooks/use-notifications";

export type NotificationsPanelProps = {
  panelId?: string;

  open?: boolean;
  disabled?: boolean;

  automaticLoad?: boolean;

  onClose?: () => void;

  onNotificationRead?: (
    notification:
      NotificationHookItem,
  ) => void;
};