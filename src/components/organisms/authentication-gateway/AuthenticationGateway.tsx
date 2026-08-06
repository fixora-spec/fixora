"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import {
  useLocale,
  useTranslations,
} from "next-intl";

import {
  AdminSignInForm,
} from "@/components/organisms/admin-sign-in-form";

import {
  EmailVerificationForm,
} from "@/components/organisms/email-verification-form";

import {
  PasswordRecoveryForm,
} from "@/components/organisms/password-recovery-form";

import {
  PasswordResetForm,
} from "@/components/organisms/password-reset-form";

import {
  UserRegistrationForm,
} from "@/components/organisms/user-registration-form";

import {
  UserSignInForm,
} from "@/components/organisms/user-sign-in-form";

import {
  AuthenticationShell,
} from "@/components/templates/authentication-shell";

import {
  useAuth,
} from "@/providers/auth-provider";

import type {
  AuthenticationPanelView,
} from "@/providers/auth-provider";

import type {
  PasswordResetCodeResponseData,
  RegisterUserResponseData,
} from "@/services/auth";

import type {
  AccountRole,
} from "@/types/account";

import type {
  Locale,
} from "@/types/locale";

import type {
  AuthenticationGatewayPasswordResetState,
  AuthenticationGatewayProps,
  AuthenticationGatewayVerificationState,
} from "./AuthenticationGateway.types";

const AUTHENTICATION_FLOW_STORAGE_KEY =
  "fixora.authentication.flow.v2";

const LEGACY_AUTHENTICATION_FLOW_STORAGE_KEY =
  "fixora.authentication.flow.v1";

const AUTHENTICATION_FLOW_STORAGE_VERSION =
  2;

const MAXIMUM_STORED_FLOW_LENGTH =
  16_384;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const EMAIL_PATTERN =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

type AuthenticationFlowView =
  | "EMAIL_VERIFICATION"
  | "PASSWORD_RECOVERY";

type StoredAuthenticationFlowState = {
  version:
    number;

  view:
    AuthenticationFlowView;

  passwordRecoveryRole:
    AccountRole;

  verificationState:
    AuthenticationGatewayVerificationState
    | null;
};

type UnknownRecord =
  Record<string, unknown>;

type ShellConfiguration = {
  view:
    | "USER_SIGN_IN"
    | "USER_REGISTRATION"
    | "ADMIN_SIGN_IN";

  panelTitle:
    string;

  panelDescription:
    string;

  panelActionLabel:
    string;

  onPanelAction:
    () => void;
};

function resolveLocale(
  locale:
    string,
): Locale {
  return locale === "en"
    ? "en"
    : "es";
}

function isUnknownRecord(
  value:
    unknown,
): value is UnknownRecord {
  return (
    typeof value === "object"
    && value !== null
    && !Array.isArray(
      value,
    )
  );
}

function isAccountRoleValue(
  value:
    unknown,
): value is AccountRole {
  return (
    value === "USER"
    || value === "ADMIN"
  );
}

function isAuthenticationFlowView(
  value:
    unknown,
): value is AuthenticationFlowView {
  return (
    value === "EMAIL_VERIFICATION"
    || value === "PASSWORD_RECOVERY"
  );
}

function isValidIsoDate(
  value:
    unknown,
): value is string {
  return (
    typeof value === "string"
    && value.length > 0
    && value.length <= 100
    && !Number.isNaN(
      Date.parse(
        value,
      ),
    )
  );
}

function isVerificationState(
  value:
    unknown,
): value is AuthenticationGatewayVerificationState {
  if (
    !isUnknownRecord(
      value,
    )
  ) {
    return false;
  }

  return (
    typeof value.accountId === "string"
    && UUID_PATTERN.test(
      value.accountId,
    )

    && typeof value.email === "string"
    && value.email.length <= 320
    && EMAIL_PATTERN.test(
      value.email,
    )

    && typeof value.username === "string"
    && value.username.trim().length > 0
    && value.username.length <= 40

    && isValidIsoDate(
      value.verificationExpiresAt,
    )

    && isValidIsoDate(
      value.resendAvailableAt,
    )
  );
}

function removeLegacyStoredAuthenticationFlow():
  void {
  try {
    window.sessionStorage.removeItem(
      LEGACY_AUTHENTICATION_FLOW_STORAGE_KEY,
    );
  } catch {
    /*
     * sessionStorage puede estar deshabilitado.
     */
  }
}

function readStoredAuthenticationFlow():
  StoredAuthenticationFlowState
  | null {
  try {
    removeLegacyStoredAuthenticationFlow();

    const serializedState =
      window.sessionStorage.getItem(
        AUTHENTICATION_FLOW_STORAGE_KEY,
      );

    if (
      serializedState === null
    ) {
      return null;
    }

    if (
      serializedState.length
        > MAXIMUM_STORED_FLOW_LENGTH
    ) {
      window.sessionStorage.removeItem(
        AUTHENTICATION_FLOW_STORAGE_KEY,
      );

      return null;
    }

    const parsedState:
      unknown =
        JSON.parse(
          serializedState,
        );

    if (
      !isUnknownRecord(
        parsedState,
      )

      || parsedState.version
        !== AUTHENTICATION_FLOW_STORAGE_VERSION

      || !isAuthenticationFlowView(
        parsedState.view,
      )

      || !isAccountRoleValue(
        parsedState.passwordRecoveryRole,
      )
    ) {
      window.sessionStorage.removeItem(
        AUTHENTICATION_FLOW_STORAGE_KEY,
      );

      return null;
    }

    const verificationState =
      parsedState.verificationState
        === null
        ? null
        : isVerificationState(
            parsedState.verificationState,
          )
          ? parsedState.verificationState
          : null;

    if (
      parsedState.view
        === "EMAIL_VERIFICATION"

      && verificationState
        === null
    ) {
      window.sessionStorage.removeItem(
        AUTHENTICATION_FLOW_STORAGE_KEY,
      );

      return null;
    }

    return {
      version:
        AUTHENTICATION_FLOW_STORAGE_VERSION,

      view:
        parsedState.view,

      passwordRecoveryRole:
        parsedState.passwordRecoveryRole,

      verificationState,
    };
  } catch {
    try {
      window.sessionStorage.removeItem(
        AUTHENTICATION_FLOW_STORAGE_KEY,
      );

      removeLegacyStoredAuthenticationFlow();
    } catch {
      /*
       * sessionStorage puede estar deshabilitado.
       * El flujo continuará funcionando en memoria.
       */
    }

    return null;
  }
}

function storeAuthenticationFlow(
  state:
    StoredAuthenticationFlowState,
): void {
  try {
    const serializedState =
      JSON.stringify(
        state,
      );

    if (
      serializedState.length
        > MAXIMUM_STORED_FLOW_LENGTH
    ) {
      clearStoredAuthenticationFlow();

      return;
    }

    window.sessionStorage.setItem(
      AUTHENTICATION_FLOW_STORAGE_KEY,
      serializedState,
    );

    removeLegacyStoredAuthenticationFlow();
  } catch {
    /*
     * La falta de sessionStorage no impide
     * utilizar el flujo de autenticación.
     */
  }
}

function clearStoredAuthenticationFlow():
  void {
  try {
    window.sessionStorage.removeItem(
      AUTHENTICATION_FLOW_STORAGE_KEY,
    );

    window.sessionStorage.removeItem(
      LEGACY_AUTHENTICATION_FLOW_STORAGE_KEY,
    );
  } catch {
    /*
     * La limpieza es de mejor esfuerzo.
     */
  }
}

export function AuthenticationGateway({
  children,
  keepMounted = false,
  panelId,
  ariaLabel,
  onClose,
  onViewChange,
}: AuthenticationGatewayProps) {
  const {
    panelOpen,
    panelView,
    closeAuthentication,
    setAuthenticationView,
  } = useAuth();

  const translations =
    useTranslations(
      "auth.authenticationGateway",
    );

  const shellTranslations =
    useTranslations(
      "auth.authenticationShell",
    );

  const locale =
    resolveLocale(
      useLocale(),
    );

  const generatedPanelId =
    useId();

  const resolvedPanelId =
    panelId
    ?? `authentication-gateway-${generatedPanelId}`;

  const panelReference =
    useRef<HTMLElement | null>(
      null,
    );

  const previousViewReference =
    useRef<AuthenticationPanelView>(
      panelView,
    );

  const [
    storageHydrated,
    setStorageHydrated,
  ] =
    useState(
      false,
    );

  const [
    verificationState,
    setVerificationState,
  ] =
    useState<AuthenticationGatewayVerificationState | null>(
      null,
    );

  const [
    passwordRecoveryRole,
    setPasswordRecoveryRole,
  ] =
    useState<AccountRole>(
      "USER",
    );

  const [
    passwordResetState,
    setPasswordResetState,
  ] =
    useState<AuthenticationGatewayPasswordResetState | null>(
      null,
    );

  const changeView =
    useCallback(
      (
        view:
          AuthenticationPanelView,
      ): void => {
        if (
          view !== "PASSWORD_RESET"
        ) {
          setPasswordResetState(
            null,
          );
        }

        setAuthenticationView(
          view,
        );
      },
      [
        setAuthenticationView,
      ],
    );

  const handleClose =
    useCallback(
      (): void => {
        if (
          panelView
            === "PASSWORD_RESET"
        ) {
          setAuthenticationView(
            "PASSWORD_RECOVERY",
          );
        }

        setPasswordResetState(
          null,
        );

        closeAuthentication();

        onClose?.();
      },
      [
        closeAuthentication,
        onClose,
        panelView,
        setAuthenticationView,
      ],
    );

  const openUserSignIn =
    useCallback(
      (): void => {
        setPasswordResetState(
          null,
        );

        changeView(
          "USER_SIGN_IN",
        );
      },
      [
        changeView,
      ],
    );

  const openUserRegistration =
    useCallback(
      (): void => {
        changeView(
          "USER_REGISTRATION",
        );
      },
      [
        changeView,
      ],
    );

  const openUserPasswordRecovery =
    useCallback(
      (): void => {
        setPasswordRecoveryRole(
          "USER",
        );

        setPasswordResetState(
          null,
        );

        changeView(
          "PASSWORD_RECOVERY",
        );
      },
      [
        changeView,
      ],
    );

  const openAdminSignIn =
    useCallback(
      (): void => {
        setPasswordResetState(
          null,
        );

        changeView(
          "ADMIN_SIGN_IN",
        );
      },
      [
        changeView,
      ],
    );

  const openAdminPasswordRecovery =
    useCallback(
      (): void => {
        setPasswordRecoveryRole(
          "ADMIN",
        );

        setPasswordResetState(
          null,
        );

        changeView(
          "PASSWORD_RECOVERY",
        );
      },
      [
        changeView,
      ],
    );

  const handleRegistrationVerificationRequest =
    useCallback(
      (
        result:
          RegisterUserResponseData,
      ): void => {
        setVerificationState({
          accountId:
            result.accountId,

          email:
            result.email,

          username:
            result.username,

          verificationExpiresAt:
            result.verificationExpiresAt,

          resendAvailableAt:
            result.resendAvailableAt,
        });

        changeView(
          "EMAIL_VERIFICATION",
        );
      },
      [
        changeView,
      ],
    );

  const handleVerificationResendSuccess =
    useCallback(
      (
        result:
          RegisterUserResponseData,
      ): void => {
        setVerificationState({
          accountId:
            result.accountId,

          email:
            result.email,

          username:
            result.username,

          verificationExpiresAt:
            result.verificationExpiresAt,

          resendAvailableAt:
            result.resendAvailableAt,
        });
      },
      [],
    );

  const handleVerificationSuccess =
    useCallback(
      (): void => {
        setVerificationState(
          null,
        );

        clearStoredAuthenticationFlow();

        changeView(
          "USER_SIGN_IN",
        );
      },
      [
        changeView,
      ],
    );

  const handlePasswordResetRequest =
    useCallback(
      (
        result:
          PasswordResetCodeResponseData,
      ): void => {
        /*
         * El token de restablecimiento se mantiene únicamente en memoria.
         * Nunca se escribe en sessionStorage ni localStorage.
         */
        clearStoredAuthenticationFlow();

        setPasswordResetState({
          resetToken:
            result.resetToken,

          accountRole:
            passwordRecoveryRole,
        });

        changeView(
          "PASSWORD_RESET",
        );
      },
      [
        changeView,
        passwordRecoveryRole,
      ],
    );

  const handlePasswordResetSuccess =
    useCallback(
      (): void => {
        clearStoredAuthenticationFlow();
      },
      [],
    );

  const handlePasswordResetSignInRequest =
    useCallback(
      (): void => {
        const accountRole =
          passwordResetState
            ?.accountRole
          ?? passwordRecoveryRole;

        setPasswordResetState(
          null,
        );

        clearStoredAuthenticationFlow();

        changeView(
          accountRole === "ADMIN"
            ? "ADMIN_SIGN_IN"
            : "USER_SIGN_IN",
        );
      },
      [
        changeView,
        passwordRecoveryRole,
        passwordResetState,
      ],
    );

  const handlePasswordResetRecoveryRequest =
    useCallback(
      (): void => {
        const accountRole =
          passwordResetState
            ?.accountRole
          ?? passwordRecoveryRole;

        setPasswordRecoveryRole(
          accountRole,
        );

        setPasswordResetState(
          null,
        );

        changeView(
          "PASSWORD_RECOVERY",
        );
      },
      [
        changeView,
        passwordRecoveryRole,
        passwordResetState,
      ],
    );

  useEffect(
    () => {
      const hydrationTimeoutId =
        window.setTimeout(
          () => {
            const storedState =
              readStoredAuthenticationFlow();

            if (
              storedState !== null
            ) {
              setPasswordRecoveryRole(
                storedState.passwordRecoveryRole,
              );

              setVerificationState(
                storedState.verificationState,
              );

              setPasswordResetState(
                null,
              );

              setAuthenticationView(
                storedState.view,
              );
            }

            setStorageHydrated(
              true,
            );
          },
          0,
        );

      return () => {
        window.clearTimeout(
          hydrationTimeoutId,
        );
      };
    },
    [
      setAuthenticationView,
    ],
  );

  useEffect(
    () => {
      if (
        !storageHydrated
      ) {
        return;
      }

      if (
        panelView
          === "EMAIL_VERIFICATION"

        && verificationState
          !== null
      ) {
        storeAuthenticationFlow({
          version:
            AUTHENTICATION_FLOW_STORAGE_VERSION,

          view:
            "EMAIL_VERIFICATION",

          passwordRecoveryRole,

          verificationState,
        });

        return;
      }

      if (
        panelView
          === "PASSWORD_RECOVERY"
      ) {
        storeAuthenticationFlow({
          version:
            AUTHENTICATION_FLOW_STORAGE_VERSION,

          view:
            "PASSWORD_RECOVERY",

          passwordRecoveryRole,

          verificationState:
            null,
        });

        return;
      }

      clearStoredAuthenticationFlow();
    },
    [
      panelView,
      passwordRecoveryRole,
      storageHydrated,
      verificationState,
    ],
  );

  useEffect(
    () => {
      if (
        previousViewReference.current
          === panelView
      ) {
        return;
      }

      previousViewReference.current =
        panelView;

      onViewChange?.(
        panelView,
      );
    },
    [
      onViewChange,
      panelView,
    ],
  );

  useEffect(
    () => {
      if (
        !panelOpen
      ) {
        return;
      }

      panelReference.current
        ?.focus();
    },
    [
      panelOpen,
    ],
  );

  useEffect(
    () => {
      if (
        !panelOpen
      ) {
        return undefined;
      }

      const previousOverflow =
        document.body.style.overflow;

      document.body.style.overflow =
        "hidden";

      return () => {
        document.body.style.overflow =
          previousOverflow;
      };
    },
    [
      panelOpen,
    ],
  );

  useEffect(
    () => {
      if (
        !panelOpen
      ) {
        return undefined;
      }

      const handleKeyDown =
        (
          event:
            KeyboardEvent,
        ): void => {
          if (
            event.key !== "Escape"
          ) {
            return;
          }

          event.preventDefault();

          handleClose();
        };

      document.addEventListener(
        "keydown",
        handleKeyDown,
      );

      return () => {
        document.removeEventListener(
          "keydown",
          handleKeyDown,
        );
      };
    },
    [
      handleClose,
      panelOpen,
    ],
  );

  if (
    !panelOpen
    && !keepMounted
  ) {
    return null;
  }

  const defaultContent =
    (() => {
      switch (
        panelView
      ) {
        case "USER_REGISTRATION":
          return (
            <UserRegistrationForm
              locale={
                locale
              }
              onRequestSignIn={
                openUserSignIn
              }
              onRequestEmailVerification={
                handleRegistrationVerificationRequest
              }
            />
          );

        case "EMAIL_VERIFICATION":
          return verificationState
            === null
            ? null
            : (
                <EmailVerificationForm
                  accountId={
                    verificationState.accountId
                  }
                  email={
                    verificationState.email
                  }
                  username={
                    verificationState.username
                  }
                  verificationExpiresAt={
                    verificationState
                      .verificationExpiresAt
                  }
                  resendAvailableAt={
                    verificationState
                      .resendAvailableAt
                  }
                  locale={
                    locale
                  }
                  onSuccess={
                    handleVerificationSuccess
                  }
                  onResendSuccess={
                    handleVerificationResendSuccess
                  }
                  onRequestSignIn={
                    openUserSignIn
                  }
                  onRequestRegistration={
                    openUserRegistration
                  }
                />
              );

        case "PASSWORD_RECOVERY":
          return (
            <PasswordRecoveryForm
              locale={
                locale
              }
              accountRole={
                passwordRecoveryRole
              }
              onRequestPasswordReset={
                handlePasswordResetRequest
              }
              onRequestSignIn={
                passwordRecoveryRole
                  === "ADMIN"
                  ? openAdminSignIn
                  : openUserSignIn
              }
            />
          );

        case "PASSWORD_RESET":
          return passwordResetState
            === null
            ? null
            : (
                <PasswordResetForm
                  resetToken={
                    passwordResetState.resetToken
                  }
                  locale={
                    locale
                  }
                  accountRole={
                    passwordResetState.accountRole
                  }
                  onSuccess={
                    handlePasswordResetSuccess
                  }
                  onRequestSignIn={
                    handlePasswordResetSignInRequest
                  }
                  onRequestRecovery={
                    handlePasswordResetRecoveryRequest
                  }
                />
              );

        case "ADMIN_SIGN_IN":
          return (
            <AdminSignInForm
              locale={
                locale
              }
              onRequestUserSignIn={
                openUserSignIn
              }
              onRequestPasswordRecovery={
                openAdminPasswordRecovery
              }
            />
          );

        case "USER_SIGN_IN":
        default:
          return (
            <UserSignInForm
              locale={
                locale
              }
              onRequestRegistration={
                openUserRegistration
              }
              onRequestPasswordRecovery={
                openUserPasswordRecovery
              }
              onRequestAdminSignIn={
                openAdminSignIn
              }
            />
          );
      }
    })();

  const hasCustomContent =
    children !== undefined
    && children !== null;

  const renderedContent =
    hasCustomContent
      ? children
      : defaultContent;

  const shellConfiguration:
    ShellConfiguration
    | null =
      hasCustomContent
        ? null

        : panelView
          === "USER_SIGN_IN"
          ? {
              view:
                "USER_SIGN_IN",

              panelTitle:
                shellTranslations(
                  "userSignIn.title",
                ),

              panelDescription:
                shellTranslations(
                  "userSignIn.description",
                ),

              panelActionLabel:
                shellTranslations(
                  "userSignIn.action",
                ),

              onPanelAction:
                openUserRegistration,
            }

          : panelView
            === "USER_REGISTRATION"
            ? {
                view:
                  "USER_REGISTRATION",

                panelTitle:
                  shellTranslations(
                    "userRegistration.title",
                  ),

                panelDescription:
                  shellTranslations(
                    "userRegistration.description",
                  ),

                panelActionLabel:
                  shellTranslations(
                    "userRegistration.action",
                  ),

                onPanelAction:
                  openUserSignIn,
              }

            : panelView
              === "ADMIN_SIGN_IN"
              ? {
                  view:
                    "ADMIN_SIGN_IN",

                  panelTitle:
                    shellTranslations(
                      "adminSignIn.title",
                    ),

                  panelDescription:
                    shellTranslations(
                      "adminSignIn.description",
                    ),

                  panelActionLabel:
                    shellTranslations(
                      "adminSignIn.action",
                    ),

                  onPanelAction:
                    openUserSignIn,
                }

              : null;

  return (
    <section
      ref={
        panelReference
      }
      id={
        resolvedPanelId
      }
      role="dialog"
      tabIndex={-1}
      aria-modal={
        panelOpen
          ? true
          : undefined
      }
      aria-label={
        ariaLabel
        ?? translations(
          "dialogLabel",
        )
      }
      aria-hidden={
        !panelOpen
      }
      hidden={
        !panelOpen
      }
      data-authentication-gateway=""
      data-authentication-open={
        panelOpen
          ? "true"
          : "false"
      }
      data-authentication-view={
        panelView
      }
      className={[
        "fixed inset-0 z-[100]",
        "overflow-y-auto overscroll-contain",
        "bg-[var(--fixora-background)]",
        "text-[var(--fixora-foreground)]",
      ].join(
        " ",
      )}
    >
      {shellConfiguration ? (
        <AuthenticationShell
          view={
            shellConfiguration.view
          }
          locale={
            locale
          }
          panelTitle={
            shellConfiguration.panelTitle
          }
          panelDescription={
            shellConfiguration.panelDescription
          }
          panelActionLabel={
            shellConfiguration.panelActionLabel
          }
          panelActionAriaLabel={
            shellConfiguration.panelActionLabel
          }
          closeLabel={
            translations(
              "close",
            )
          }
          onClose={
            handleClose
          }
          onPanelAction={
            shellConfiguration.onPanelAction
          }
        >
          {renderedContent}
        </AuthenticationShell>
      ) : (
        <>
          <header>
            <button
              type="button"
              onClick={
                handleClose
              }
              aria-label={
                translations(
                  "close",
                )
              }
            >
              {translations(
                "close",
              )}
            </button>
          </header>

          {renderedContent}
        </>
      )}
    </section>
  );
}