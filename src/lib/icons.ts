/**
 * Central icon vocabulary for the app, backed by the free Hugeicons set
 * (`@hugeicons/core-free-icons`). Components render these with the
 * `<HugeiconsIcon>` wrapper from `@hugeicons/react`:
 *
 *   import { HugeiconsIcon } from "@hugeicons/react";
 *   import { IconClose } from "../lib/icons";
 *   <HugeiconsIcon icon={IconClose} size={16} strokeWidth={2} />
 *
 * Icons inherit the surrounding text color via `currentColor` (the wrapper's
 * default), so existing Tailwind color classes keep working. Keeping the
 * mapping here means the whole icon set can be swapped from one place.
 */
export {
  MinusSignIcon as IconMinimize,
  Cancel01Icon as IconClose,
  Add01Icon as IconAdd,
  Settings01Icon as IconSettings,
  Mic01Icon as IconMic,
  RecordIcon as IconRecord,
  PlayIcon as IconPlay,
  PauseIcon as IconPause,
  StopIcon as IconStop,
  DragDropVerticalIcon as IconDrag,
  Edit02Icon as IconRename,
  Delete02Icon as IconDelete,
  ArrowReloadHorizontalIcon as IconRegenerate,
  CheckmarkCircle02Icon as IconCheck,
} from '@hugeicons/core-free-icons';
