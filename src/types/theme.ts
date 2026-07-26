export type AppTheme = "light" | "dark" | "system";

export type ResolvedAppTheme = Exclude<AppTheme, "system">;

export type ThemeIconName = "sun" | "moon";

export type ThemeToggleSize = "sm" | "md" | "lg";

export type ThemeToggleProps = {
  className?: string;
  size?: ThemeToggleSize;
  showLabel?: boolean;
};

export type ThemeState = {
  theme: AppTheme | undefined;
  resolvedTheme: ResolvedAppTheme | undefined;
  isMounted: boolean;
};

export type ThemeAction = {
  currentTheme: ResolvedAppTheme;
  nextTheme: ResolvedAppTheme;
  icon: ThemeIconName;
  label: string;
};

export type ThemeTransitionOptions = {
  disableTransition?: boolean;
  preserveSystemPreference?: boolean;
};