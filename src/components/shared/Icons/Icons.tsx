import { useMemo } from "react";

import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import CreateOutlinedIcon from "@mui/icons-material/CreateOutlined";
import CreditCardOutlinedIcon from "@mui/icons-material/CreditCardOutlined";
import CreditScoreOutlinedIcon from "@mui/icons-material/CreditScoreOutlined";
import CurrencyPoundIcon from "@mui/icons-material/CurrencyPound";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import DoneOutlinedIcon from "@mui/icons-material/DoneOutlined";
import EventRepeatOutlinedIcon from "@mui/icons-material/EventRepeatOutlined";
import InsertInvitationIcon from "@mui/icons-material/InsertInvitation";
import InsertLinkOutlinedIcon from "@mui/icons-material/InsertLinkOutlined";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import LockOpenOutlinedIcon from "@mui/icons-material/LockOpenOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import NotificationsOutlinedIcon from "@mui/icons-material/NotificationsOutlined";
import PollOutlinedIcon from "@mui/icons-material/PollOutlined";
import SettingsIcon from "@mui/icons-material/Settings";
import TipsAndUpdatesOutlinedIcon from "@mui/icons-material/TipsAndUpdatesOutlined";
import WebStoriesOutlinedIcon from "@mui/icons-material/WebStoriesOutlined";
import Lottie from "lottie-react";

import saplingSway from "../../../LOGO Asset/sapling-sway.json";
import { useAppSelector } from "../../../store/hooks";
import { selectThemeMode } from "../../../store/slices/themeSlice";

export const ArticleIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);
export const IdeasIcon = () => <TipsAndUpdatesOutlinedIcon />;
export const VideoIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);

export const UsersIcon = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export const FormsIcon = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="8" y1="13" x2="16" y2="13" />
    <line x1="8" y1="17" x2="16" y2="17" />
  </svg>
);

export const PollsIcon = () => <PollOutlinedIcon />;

export const ClipboardIcon = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="9" y="2" width="6" height="4" rx="1" />
    <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
    <line x1="12" y1="11" x2="12" y2="17" />
    <line x1="9" y1="14" x2="15" y2="14" />
  </svg>
);

export const CheckIcon = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

export const BookIcon = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);

export const PlusIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export const HelpIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

export const LayersIcon = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);

export const ChevronDownSmIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export const SupervisionLogoMark = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M17 8h2a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1v3l-3-3h-1" />
    <path d="M9 3H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h3l3 3V5a2 2 0 0 0-2-2z" />
  </svg>
);

export const LeafLogoMark = ({ size = 28, color }: { size?: number; color?: string }) => {
  const themeMode = useAppSelector(selectThemeMode);

  const colorValue = color ?? (themeMode === "dark" ? "var(--text-primary)" : "var(--text-primary)");

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="Clarity"
      style={{ color: colorValue }}
    >
      <path d="M12 22V12" />
      <path d="M12 12C12 7 7 3 2 3c0 5 4 9 10 9z" />
      <path d="M12 12C12 7 17 3 22 3c0 5-4 9-10 9z" />
    </svg>
  );
};

export const LeafLottieLogoMark = ({ size = 48 }: { size?: number }) => {
  const themeMode = useAppSelector(selectThemeMode);

  const animationData = useMemo(() => {
    const stroke = themeMode === "dark" ? [1, 1, 1, 1] : [0, 0, 0, 1];
    const data = JSON.parse(JSON.stringify(saplingSway));
    const shapes = data.layers[0].shapes;
    shapes[0].it[2].c.k = stroke; // stem stroke
    shapes[1].it[2].c.k = stroke; // left leaf stroke
    // shapes[2].it[2] is the right leaf fill — teal, left as-is in JSON
    shapes[2].it[3].c.k = stroke; // right leaf stroke only
    return data;
  }, [themeMode]);

  return (
    <Lottie
      animationData={animationData}
      loop={false}
      style={{ width: size, height: size }}
      aria-label="Clarity"
      role="img"
    />
  );
};

export const ClarityLogoMark = ({ size = 36 }: { size?: number }) => {
  const uid = `clm-${Math.random().toString(36).slice(2, 7)}`;
  const blurId = `${uid}-b`;
  const clipId = `${uid}-c`;
  const glassPath =
    "M861.858,322.681c0,0 -446.972,7.641 -271.24,343.825c175.733,336.184 536.87,435.512 631.361,141.35c94.492,-294.161 105.952,-515.737 -360.121,-485.175Z";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1418 1418"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Clarity"
    >
      <defs>
        <filter id={blurId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="90" in="SourceGraphic" />
        </filter>
        <clipPath id={clipId}>
          <path d={glassPath} />
        </clipPath>
      </defs>

      {/* Amber blob — back */}
      <path
        d="M454.073,263.599c0,0 -488.995,282.701 -240.677,576.862c248.318,294.161 523.378,267.419 630.346,118.429c106.968,-148.991 -26.742,-878.664 -389.668,-695.29"
        fill="#ffd08b"
      />

      {/* Blue blob — middle */}
      <path
        d="M644.632,767.955c0,0 269.277,-106.333 249.277,244.115c-20,350.448 -510.527,286.925 -485.355,54.883c25.172,-232.043 197.663,-297.036 236.078,-298.998Z"
        fill="#5d9aff"
      />

      {/* Frosted bleed — blurred blobs clipped to the glass shape */}
      <g clipPath={`url(#${clipId})`}>
        <path
          d="M454.073,263.599c0,0 -488.995,282.701 -240.677,576.862c248.318,294.161 523.378,267.419 630.346,118.429c106.968,-148.991 -26.742,-878.664 -389.668,-695.29"
          fill="#ffd08b"
          filter={`url(#${blurId})`}
        />
        <path
          d="M644.632,767.955c0,0 269.277,-106.333 249.277,244.115c-20,350.448 -510.527,286.925 -485.355,54.883c25.172,-232.043 197.663,-297.036 236.078,-298.998Z"
          fill="#5d9aff"
          filter={`url(#${blurId})`}
        />
      </g>

      {/* Glass fill */}
      <path d={glassPath} fill="rgba(62,175,155,0.40)" />

      {/* Glass rim */}
      <path d={glassPath} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="12" />

      {/* Top sheen */}
      <path
        d="M 890,400 C 980,355 1095,358 1165,412"
        stroke="rgba(255,255,255,0.60)"
        strokeWidth="16"
        strokeLinecap="round"
        fill="none"
      />

      {/* C — serif */}
      <text
        x="508.505"
        y="888.597"
        style={{
          fontFamily: "'MicrosoftHimalaya','Microsoft Himalaya','Cormorant Garamond',Georgia,serif",
          fontSize: "896px",
          fill: "#ffffff",
        }}
      >
        C
      </text>
    </svg>
  );
};

export const MailIcon = () => (
  <svg
    width="32"
    height="32"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

export const SunIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

export const MoonIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

export const MenuIcon = () => (
  <svg
    width="1.25rem"
    height="1.25rem"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

export const CloseIcon = () => (
  <svg
    width="1.25rem"
    height="1.25rem"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const LinkIcon = () => <InsertLinkOutlinedIcon />;

export const LockIcon = () => <LockOutlinedIcon fontSize="inherit" />;
export const LockOpenIcon = () => <LockOpenOutlinedIcon fontSize="inherit" />;

export const DocumentIcon = () => <ArticleOutlinedIcon />;

export const Settingsicon = () => <SettingsIcon />;
export const ChevronDown = () => <KeyboardArrowDownIcon />;

export const BellIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

export const BinIcon = () => {
  return <DeleteOutlinedIcon />;
};

export const RescheduleIcon = () => <EventRepeatOutlinedIcon />;
export const PaidIcon = () => <CreditScoreOutlinedIcon />;
export const UnpaidIcon = () => <CreditCardOutlinedIcon />;
export const CancelIcon = () => <CancelOutlinedIcon />;

export const EditIcon = () => <CreateOutlinedIcon />;

export const TickIcon = () => <DoneOutlinedIcon />;

export const KeyIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="7.5" cy="15.5" r="5.5" />
    <path d="M21 2l-9.6 9.6" />
    <path d="M15.5 7.5l3 3L22 7l-3-3" />
  </svg>
);

export const CopyIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

export const HomeIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

export const CalendarIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

export const ChatIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

export const HistoryIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="12 8 12 12 14 14" />
    <path d="M3.05 11a9 9 0 1 1 .5 4m-.5-4v-4h4" />
  </svg>
);

export const ChevronLeftIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

export const ChevronRightIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

export const SidebarCardIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
    <line x1="1" y1="10" x2="23" y2="10" />
  </svg>
);

export const MoneyIcon = () => {
  return <CurrencyPoundIcon />;
};

export const DarkmodeIcon = () => <DarkModeOutlinedIcon />;
export const LightmodeIcon = () => <LightModeOutlinedIcon />;
export const NotificationBellIcon = () => <NotificationsOutlinedIcon />;
export const SupervisionLogo = () => <AdminPanelSettingsOutlinedIcon />;
export const CpdIcon = () => <WebStoriesOutlinedIcon />;
export const CreateSession = () => <InsertInvitationIcon />;
export const AssignmentClipIcon = () => <AssignmentOutlinedIcon />;
