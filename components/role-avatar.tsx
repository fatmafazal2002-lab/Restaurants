import type { Portal } from "@/lib/portals";
export function RoleAvatar({
  role = "guest",
  size = 72,
}: {
  role?: Portal | "guest";
  size?: number;
}) {
  return (
    <span
      className={`role-avatar role-avatar-${role}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="60" r="59" fill="currentColor" opacity=".13" />
        <path d="M22 115c2-25 16-37 38-37s36 12 38 37" fill="currentColor" />
        <path d="M49 76v13c7 7 15 7 22 0V76" fill="#C99372" />
        <ellipse cx="60" cy="54" rx="27" ry="32" fill="#E8B38F" />
        <path
          d="M34 50c-5-28 48-38 53-1-10-2-17-13-20-20-7 11-19 18-33 21Z"
          fill="#3E4034"
        />
        <path
          d="M47 55h2m22 0h2"
          stroke="#343B32"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M54 69q6 5 12 0"
          stroke="#894F3D"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        {role === "kitchen" ? (
          <>
            <path
              d="M34 39v-8c-15-9-3-29 11-23 7-12 23-12 30 0 15-6 27 14 11 23v8Z"
              fill="#FFFDF6"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path d="M35 39h50v8H35z" fill="#FFFDF6" />
            <path d="M45 90v27m30-27v27" stroke="#FFFDF6" strokeWidth="4" />
          </>
        ) : role === "service" ? (
          <>
            <path d="m48 89 12 7-12 7zm24 0-12 7 12 7z" fill="#FFFDF6" />
            <circle cx="60" cy="108" r="2" fill="#FFFDF6" />
          </>
        ) : role === "admin" ? (
          <>
            <rect
              x="40"
              y="49"
              width="16"
              height="13"
              rx="5"
              stroke="#394334"
              strokeWidth="2"
            />
            <rect
              x="64"
              y="49"
              width="16"
              height="13"
              rx="5"
              stroke="#394334"
              strokeWidth="2"
            />
            <path
              d="M56 54h8m-16 35 12 9 12-9"
              stroke="#FFFDF6"
              strokeWidth="3"
            />
          </>
        ) : (
          <>
            <path
              d="M78 24c5-14 17-11 18-11-1 12-8 17-18 11Z"
              fill="currentColor"
            />
            <path d="M47 91q13 13 26 0" stroke="#FFFDF6" strokeWidth="3" />
          </>
        )}
      </svg>
    </span>
  );
}
