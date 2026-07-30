"use client";

import {
  LogIn,
} from "lucide-react";

import {
  useAuth,
} from "@/providers/auth-provider";

import {
  cn,
} from "@/utils/cn";

import type {
  LoginLinkProps,
} from "./LoginLink.types";

export function LoginLink({
  label,
  variant = "desktop",
  onNavigate,
  className,
  disabled,
  ...buttonProperties
}: LoginLinkProps) {
  const {
    openAuthentication,
  } = useAuth();

  const isDesktop =
    variant === "desktop";

  const handleAuthenticationRequest =
    (): void => {
      if (
        disabled
      ) {
        return;
      }

      openAuthentication({});

      onNavigate?.();
    };

  return (
    <button
      {...buttonProperties}
      type="button"
      disabled={disabled}
      aria-label={label}
      onClick={
        handleAuthenticationRequest
      }
      className={cn(
        "group inline-flex shrink-0 items-center justify-center",
        "rounded-full border font-semibold",

        "transition-[background-color,color,border-color,box-shadow,transform]",
        "duration-300 ease-out",

        "focus-visible:outline-none",
        "focus-visible:ring-2",
        "focus-visible:ring-[#4ead35]",
        "focus-visible:ring-offset-2",
        "focus-visible:ring-offset-[#fdfefe]",

        "hover:scale-[1.03]",
        "active:scale-[0.97]",

        "disabled:pointer-events-none",
        "disabled:cursor-not-allowed",
        "disabled:opacity-60",

        "dark:focus-visible:ring-[#57af33]",
        "dark:focus-visible:ring-offset-[#0c0f0c]",

        "motion-reduce:transform-none",
        "motion-reduce:transition-none",

        isDesktop
          ? [
              "h-12 gap-2.5 px-5",
              "text-sm tracking-[-0.01em]",

              "border-[#4ead35]",
              "bg-[#4ead35]",
              "text-[#0c0f0c]",

              "shadow-[0_10px_28px_rgba(78,173,53,0.22)]",

              "hover:border-[#57af33]",
              "hover:bg-[#57af33]",
              "hover:shadow-[0_12px_32px_rgba(78,173,53,0.30)]",

              "dark:border-[#57af33]",
              "dark:bg-[#57af33]",
              "dark:text-[#0c0f0c]",

              "dark:shadow-[0_10px_30px_rgba(87,175,51,0.24)]",

              "dark:hover:border-[#63bd3d]",
              "dark:hover:bg-[#63bd3d]",
              "dark:hover:shadow-[0_12px_34px_rgba(87,175,51,0.32)]",
            ]
          : [
              "min-h-11 w-full gap-2 px-3",
              "text-[11px] tracking-[-0.01em]",

              "border-[#4ead35]",
              "bg-[#4ead35]",
              "text-[#0c0f0c]",

              "shadow-[0_6px_18px_rgba(78,173,53,0.20)]",

              "hover:border-[#57af33]",
              "hover:bg-[#57af33]",
              "hover:shadow-[0_8px_22px_rgba(78,173,53,0.26)]",

              "dark:border-[#57af33]",
              "dark:bg-[#57af33]",
              "dark:text-[#0c0f0c]",

              "dark:shadow-[0_6px_20px_rgba(87,175,51,0.22)]",

              "dark:hover:border-[#63bd3d]",
              "dark:hover:bg-[#63bd3d]",
              "dark:hover:shadow-[0_8px_24px_rgba(87,175,51,0.28)]",
            ],

        className,
      )}
    >
      <LogIn
        aria-hidden="true"
        size={
          isDesktop
            ? 19
            : 17
        }
        strokeWidth={1.9}
        className={cn(
          "shrink-0",

          "transition-transform duration-300 ease-out",
          "group-hover:translate-x-0.5",

          "motion-reduce:transition-none",
        )}
      />

      <span className="min-w-0 whitespace-nowrap">
        {label}
      </span>
    </button>
  );
}