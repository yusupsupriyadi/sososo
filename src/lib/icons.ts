/**
 * Central icon vocabulary for the app, backed by the free Hugeicons set
 * (`@hugeicons/core-free-icons`). Components render these with the
 * `<HugeiconsIcon>` wrapper from `@hugeicons/react`:
 *
 *   import { HugeiconsIcon } from '@hugeicons/react';
 *   import { IconClose } from '../lib/icons';
 *   <HugeiconsIcon icon={IconClose} size={16} strokeWidth={2} />
 *
 * Icons inherit the surrounding text color via `currentColor` (the wrapper's
 * default), so existing Tailwind color classes keep working. Keeping the
 * mapping here means the whole icon set can be swapped from one place.
 */
export {
  // Window controls
  MinusSignIcon as IconMinimize,
  Cancel01Icon as IconClose,
  // Navigation & primary actions
  Add01Icon as IconAdd,
  Settings01Icon as IconSettings,
  ArrowLeft02Icon as IconBack,
  // Recording controls
  RecordIcon as IconRecord,
  PlayIcon as IconPlay,
  PauseIcon as IconPause,
  StopIcon as IconStop,
  DragDropVerticalIcon as IconDrag,
  // Session actions
  Edit02Icon as IconRename,
  Delete02Icon as IconDelete,
  ArrowReloadHorizontalIcon as IconRegenerate,
  CheckmarkCircle02Icon as IconCheck,
  // Audio & devices
  Mic01Icon as IconMic,
  Speaker01Icon as IconSpeaker,
  AudioWave01Icon as IconWave,
  HeadphonesIcon as IconDevices,
  // Metadata & content
  Globe02Icon as IconLanguage,
  Calendar03Icon as IconCalendar,
  TextAlignLeftIcon as IconLines,
  CaptionsIcon as IconTranscript,
  HistoryIcon as IconHistory,
  Key01Icon as IconKey,
  TextFontIcon as IconAppearance,
  SparklesIcon as IconAi,
  // People
  UserMultiple02Icon as IconRemote,
  // Empty / error states
  Alert02Icon as IconAlert,
  InboxIcon as IconInbox,
  CaptionsOffIcon as IconNoTranscript,
} from '@hugeicons/core-free-icons';
